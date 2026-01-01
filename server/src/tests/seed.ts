import { addApiKeyForUser } from "@/repositories/apiKeyRepository.js"
import { createLog, findLogOfUserByMediaId } from "@/repositories/logsRepository.js"
import { createMedia } from "@/repositories/mediaRepository.js"
import prisma from "@/prismaClient.js"
import { encryptKey } from "@/utilities.js"
import { MediaType, Prisma, User, UserAPIKey } from "@prisma/client"
import bcrypt from "bcryptjs"
import { fileURLToPath } from "url"
import path from "path"
import fs from "fs"
import { mediaService } from "@/services/mediaService.js"
import { goodreadsImportService } from "@/services/imports/goodreadsImportService.js"

async function createSystemUser(): Promise<{ id: number }> {
    let systemUser = await prisma.user.findUnique({
        where: { username: 'system' },
    })

    if (!systemUser) {
        if (!process.env.SYSTEM_USER_PASSWORD) {
        throw new Error("SYSTEM_USER_PASSWORD env variable is required")
        }

        const hashedPassword = await bcrypt.hash(process.env.SYSTEM_USER_PASSWORD, 12)
        systemUser = await prisma.user.create({
        data: {
            username: "system",
            password: hashedPassword,
            displayName: "System User",
        },
        })
        console.log("System user created")
    } else {
        console.log("System user already exists")
    }

    return systemUser
}

async function createDemoUser(): Promise<User & { apiKeys: UserAPIKey[] }> {
    let demoUser = await prisma.user.findUnique({
        where: { username: 'demo' },
        include: {
            apiKeys: true
        }
    })

    if (!demoUser) {
        if (!process.env.DEMO_USER_PASSWORD) {
        throw new Error("DEMO_USER_PASSWORD env variable is required")
        }

        const hashedPassword = await bcrypt.hash(process.env.DEMO_USER_PASSWORD, 12)
        demoUser = await prisma.user.create({
            data: {
                username: "demo",
                password: hashedPassword,
                displayName: "Demo User",
            },
            include: {
                apiKeys: true
            }
        })
        console.log("Demo user created")
    } else {
        console.log("Demo user already exists")
    }

    return demoUser
}

async function createMediaTypeSeed(name: string, userId: number): Promise<MediaType> {
    const existing = await prisma.mediaType.findFirst({ 
        where: { name } 
    })
    if (!existing) {
        const mediatype = await prisma.mediaType.create({
            data: { 
                name, 
                created_at: new Date(), 
                userId },
        })
        console.log(`Default media type: ${name} created`)
        return mediatype
    } else {
        console.log(`Default media type: ${name} already exists`)
        return existing
    }
}

export async function seedDatabase() {
    const systemUser = await createSystemUser()
    const demoUser = await createDemoUser()

    // CREATE SEED MEDIA TYPES
    const defaultType = await createMediaTypeSeed("book", systemUser.id)
    await createMediaTypeSeed("music", systemUser.id)
    await createMediaTypeSeed("game", systemUser.id)
    await createMediaTypeSeed("movie", systemUser.id)
    await createMediaTypeSeed("anime", systemUser.id)
    await createMediaTypeSeed("manga", systemUser.id)

    // CREATE SEED MEDIA
    let defaultMedia = await prisma.media.findFirst({
        where: { title: "Default Media", userId: systemUser.id },
    })
    if (!defaultMedia && defaultType) {
        defaultMedia = await createMedia(
            "Default Media",
            defaultType,
            "System",
            2025,
            null,
            null,
            "This is your default  media",
            null,
            null,
            systemUser.id,
            prisma
        )
        console.log("Default Media created")
    } else {
        console.log("Default Media already exists")
    }

    //Create seed log
    if(defaultMedia) {
        const demoLog = await findLogOfUserByMediaId(demoUser.id, defaultMedia.id, prisma)
        if(!demoLog) {
            try {
                await createLog(demoUser.id, defaultMedia.id, "completed", 100, "Welcome! This is your default log! Search up or create a custom media to log it!", prisma)
                console.log("Demo log created")
            } catch (error: unknown) {
                if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                    console.log("Demo log already exists")
                } else {
                    throw error
                }
            }
        } else {
            console.log("Demo log already exists")
        }
    }

    //Seed Google Books key
    console.log("Demo user API keys:", demoUser.apiKeys)
    const hasGoogleBooksKey = demoUser.apiKeys.some(
        (key) => key.service === "google_books"
    )
    if(!hasGoogleBooksKey && process.env.GOOGLE_BOOKS_API_KEY) {
        try {
            await addApiKeyForUser(demoUser.id, encryptKey(process.env.GOOGLE_BOOKS_API_KEY), "google_books")
            console.log("Google Books Demo Key created")
        } catch (error) {
            console.error("Failed to create Google Books API key:", error)
        }
    } else if (!process.env.GOOGLE_BOOKS_API_KEY) {
        console.log("GOOGLE_BOOKS_API_KEY environment variable not set")
    } else {
        console.log("Google Books Demo Key already exists")
    }

    //Seed lastfm key
    const hasLastFmKey = demoUser.apiKeys.some(
        (key) => key.service === "lastfm"
    )
    if(!hasLastFmKey && process.env.LASTFM_API_KEY) {
        try {
            await addApiKeyForUser(demoUser.id, encryptKey(process.env.LASTFM_API_KEY), "lastfm")
            console.log("lastfm Demo Key created")
        } catch (error) {
            console.error("Failed to create lastfm API key:", error)
        }
    } else if (!process.env.LASTFM_API_KEY) {
        console.log("LASTFM_API_KEY environment variable not set")
    } else {
        console.log("lastfm Demo Key already exists")
    }


    // SEED GoodReads import
    if (process.env.NODE_ENV !== 'test') {
        const __filename = fileURLToPath(import.meta.url)
        const __dirname = path.dirname(__filename)
        const csvPath = path.join(__dirname, "goodreads_seed.csv")
    
        if (fs.existsSync(csvPath)) {
            console.log(`\x1b[1m\x1b[32m\nFound goodreads_seed.csv at ${csvPath}\x1b[0m`)
            console.log("Importing books for Demo user...")
            
            try {
                const fileBuffer = fs.readFileSync(csvPath)
                
                // Re-use your existing service!
                const result = await goodreadsImportService.importFromGoodReads(demoUser.id, fileBuffer)
                
                console.log(`Goodreads Import Results:`)
                console.log(`Imported: ${result.imported}`)
                console.log(`Skipped: ${result.skipped}`)
                console.log(`Errors: ${result.errors}`)
            } catch (error) {
                console.error("\x1b[1m\x1b[31mFailed to seed Goodreads CSV:\x1b[0m", error)
            }
        } else {
            console.log(`\nNo 'goodreads_seed.csv' found in ${__dirname}. Skipping CSV import.`)
        }
    }
}

// Execute seed script if the script that node ran is the same as the file path
// node seed.js = running /full/path/seed.js
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    seedDatabase()
        .then(() => prisma.$disconnect())
        .catch((error) => {
            console.error(error)
            prisma.$disconnect()
            process.exit(1)
        })
}