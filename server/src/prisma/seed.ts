
import { addApiKey } from "@/controllers/apiKeyController.js"
import { addApiKeyForUser } from "@/controllers/dbCalls/apiKey.js"
import { createLog, findLogOfUserByMediaId } from "@/controllers/dbCalls/logsCalls.js"
import { createMedia } from "@/controllers/dbCalls/mediaCalls.js"
import prisma from "@/prismaClient.js"
import { encryptKey } from "@/utilities.js"
import { MediaType, User, UserAPIKey } from "@prisma/client"
import bcrypt from "bcryptjs"

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

async function main() {
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
            null,
            null,
            "This is your default  media",
            null,
            null,
            systemUser.id
        )
        console.log("Default Media created")
    } else {
        console.log("Default Media already exists")
    }

    //Create seed log
    if(defaultMedia) {
        const demoLog = await findLogOfUserByMediaId(demoUser.id, defaultMedia.id)
        if(!demoLog) {
            try {
                await createLog(demoUser.id, defaultMedia.id, "completed", 100, "Welcome! This is your default log! Search up or create a custom media to log it!")
                console.log("Demo log created")
            } catch (error: any) {
                if (error.code === 'P2002') {
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
    console.log("Google Books API Key exists:", !!process.env.GOOGLE_BOOKS_API_KEY)
    const hasGoogleBooksKey = demoUser.apiKeys.some(
        (key) => key.service === "google_books"
    )
    if(!hasGoogleBooksKey && process.env.GOOGLE_BOOKS_API_KEY) {
        try {
            await addApiKeyForUser(demoUser.id, encryptKey(process.env.GOOGLE_BOOKS_API_KEY), "google_books")
            console.log("Encrypted demo key:", encryptKey(process.env.GOOGLE_BOOKS_API_KEY))
            console.log("Google Books Demo Key created")
        } catch (error) {
            console.error("Failed to create Google Books API key:", error)
        }
    } else if (!process.env.GOOGLE_BOOKS_API_KEY) {
        console.log("GOOGLE_BOOKS_API_KEY environment variable not set")
    } else {
        console.log("Google Books Demo Key already exists")
    }
}

// Execute seed script
main()
    .then(() => prisma.$disconnect())
    .catch((error) => {
        console.error(error)
        prisma.$disconnect()
        process.exit(1)
    })
