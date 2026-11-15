import '@/env.js'
import { addApiKeyForUser } from "@/repositories/apiKeyRepository.js"
import { createLog, findLogOfUserByMediaId } from "@/repositories/logsRepository.js"
import { createMedia } from "@/repositories/mediaRepository.js"
import prisma from "@/prismaClient.js"
import { encryptKey } from "@/utilities.js"
import { MediaType, Prisma, User, UserAPIKey } from "@/db.js"
import bcrypt from "bcryptjs"
import { fileURLToPath } from "url"
import path from "path"
import fs from "fs"
import { goodreadsImportService } from "@/services/imports/goodreadsImportService.js"
import { malImportService, createCacheMalResolver } from "@/services/imports/malImportService.js"
import {
    letterboxdImportService,
    createCacheLetterboxdResolver,
    unzipLetterboxdExport,
} from "@/services/imports/letterboxdImportService.js"
import { seedDemoMedia, seedDemoCollectionExtras, demoMediaSeeder } from "./fixtures/demo/seedDemoMedia.js"
import { pruneJunkGenres } from "@/services/genreService.js"

export interface SeedOptions {
    seedDemoFixture?: boolean
    strict?: boolean
}

export interface SeedDeps {
    seedDemo?: typeof seedDemoMedia
    importGoodreads?: typeof goodreadsImportService.importFromGoodReads
    importMal?: typeof malImportService.importFromMal
    importLetterboxd?: typeof letterboxdImportService.importFromLetterboxd
    seedCollectionExtras?: typeof seedDemoCollectionExtras
}

async function createSystemUser(): Promise<{ id: string }> {
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

async function createMediaTypeSeed(name: string, userId: string): Promise<MediaType> {
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

function findFixtureFile(relativePath: string): string | null {
    const __filename = fileURLToPath(import.meta.url)
    const __dirname = path.dirname(__filename)
    const candidatePaths = [
        path.join(__dirname, relativePath),
        path.resolve(__dirname, "../../src/tests", relativePath),
        path.resolve(process.cwd(), "src/tests", relativePath),
        path.resolve(process.cwd(), "server/src/tests", relativePath),
        path.resolve(process.cwd(), "dist/tests", relativePath),
        path.resolve(process.cwd(), relativePath),
    ]
    for (const p of candidatePaths) {
        if (fs.existsSync(p)) return p
    }
    return null
}

export async function seedDatabase(options?: SeedOptions, deps?: SeedDeps) {
    const systemUser = await createSystemUser()
    const demoUser = await createDemoUser()

    // CREATE SEED MEDIA TYPES
    const defaultType = await createMediaTypeSeed("book", systemUser.id)
    await createMediaTypeSeed("music", systemUser.id)
    await createMediaTypeSeed("game", systemUser.id)
    await createMediaTypeSeed("movie", systemUser.id)
    await createMediaTypeSeed("tv", systemUser.id)
    await createMediaTypeSeed("anime", systemUser.id)
    await createMediaTypeSeed("manga", systemUser.id)

    // CREATE SEED MEDIA
    let defaultMedia: { id: string } | null = await prisma.media.findFirst({
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

    //Seed tmdb key
    const hasTmdbKey = demoUser.apiKeys.some(
        (key) => key.service === "tmdb"
    )
    if(!hasTmdbKey && process.env.TMDB_API_KEY) {
        try {
            await addApiKeyForUser(demoUser.id, encryptKey(process.env.TMDB_API_KEY), "tmdb")
            console.log("tmdb Demo Key created")
        } catch (error) {
            console.error("Failed to create tmdb API key:", error)
        }
    } else if (!process.env.TMDB_API_KEY) {
        console.log("TMDB_API_KEY environment variable not set")
    } else {
        console.log("tmdb Demo Key already exists")
    }

    //Seed rawg key
    const hasRawgKey = demoUser.apiKeys.some(
        (key) => key.service === "rawg"
    )
    if(!hasRawgKey && process.env.RAWG_API_KEY) {
        try {
            await addApiKeyForUser(demoUser.id, encryptKey(process.env.RAWG_API_KEY), "rawg")
            console.log("rawg Demo Key created")
        } catch (error) {
            console.error("Failed to create rawg API key:", error)
        }
    } else if (!process.env.RAWG_API_KEY) {
        console.log("RAWG_API_KEY environment variable not set")
    } else {
        console.log("rawg Demo Key already exists")
    }


    // In test runs, the Goodreads and MAL exports stay skipped unless seedDemoFixture is true
    if (process.env.NODE_ENV !== 'test' || options?.seedDemoFixture) {
        // 3. SEED Goodreads import
        const goodreadsPath = findFixtureFile("fixtures/demo/exports/goodreads.csv")
        if (goodreadsPath) {
            console.log(`\x1b[1m\x1b[32m\nFound goodreads.csv at ${goodreadsPath}\x1b[0m`)
            console.log("Importing books for Demo user...")
            try {
                const fileBuffer = fs.readFileSync(goodreadsPath)
                const importFn = deps?.importGoodreads ?? ((u, b, o) => goodreadsImportService.importFromGoodReads(u, b, o))
                const result = await importFn(demoUser.id, fileBuffer, { enrich: false })
                console.log(`Goodreads Import Results: imported ${result.imported}, skipped ${result.skipped}`)
            } catch (error) {
                if (options?.strict) throw error
                console.error("\x1b[1m\x1b[31mFailed to seed Goodreads CSV:\x1b[0m", error)
            }
        } else {
            console.log("\nNo goodreads.csv found. Skipping CSV import.")
        }

        // 4. SEED MAL anime import, then MAL manga import, with cache resolver
        const animePath = findFixtureFile("fixtures/demo/exports/mal-anime.xml")
        const mangaPath = findFixtureFile("fixtures/demo/exports/mal-manga.xml")
        const cacheResolver = createCacheMalResolver()
        const importMalFn = deps?.importMal ?? ((u, b, opts) => malImportService.importFromMal(u, b, opts))

        if (animePath) {
            console.log(`\x1b[1m\x1b[32m\nFound mal-anime.xml at ${animePath}\x1b[0m`)
            console.log("Importing anime for Demo user...")
            try {
                const fileBuffer = fs.readFileSync(animePath)
                const result = await importMalFn(demoUser.id, fileBuffer, { resolver: cacheResolver })
                console.log(`MAL Anime Import Results: imported ${result.imported}, skipped ${result.skipped}`)
            } catch (error) {
                if (options?.strict) throw error
                console.error("\x1b[1m\x1b[31mFailed to seed MAL Anime XML:\x1b[0m", error)
            }
        } else {
            console.log("\nNo mal-anime.xml found. Skipping MAL anime import.")
        }

        if (mangaPath) {
            console.log(`\x1b[1m\x1b[32m\nFound mal-manga.xml at ${mangaPath}\x1b[0m`)
            console.log("Importing manga for Demo user...")
            try {
                const fileBuffer = fs.readFileSync(mangaPath)
                const result = await importMalFn(demoUser.id, fileBuffer, { resolver: cacheResolver })
                console.log(`MAL Manga Import Results: imported ${result.imported}, skipped ${result.skipped}`)
            } catch (error) {
                if (options?.strict) throw error
                console.error("\x1b[1m\x1b[31mFailed to seed MAL Manga XML:\x1b[0m", error)
            }
        } else {
            console.log("\nNo mal-manga.xml found. Skipping MAL manga import.")
        }

        // 4b. SEED Letterboxd import with cache resolver
        const letterboxdPath = findFixtureFile("fixtures/demo/exports/letterboxd.zip")
        const cacheLetterboxdResolver = createCacheLetterboxdResolver()
        const importLetterboxdFn = deps?.importLetterboxd ?? ((u, f, opts) => letterboxdImportService.importFromLetterboxd(u, f, opts))

        if (letterboxdPath) {
            console.log(`\x1b[1m\x1b[32m\nFound letterboxd.zip at ${letterboxdPath}\x1b[0m`)
            console.log("Importing films for Demo user...")
            try {
                const fileBuffer = fs.readFileSync(letterboxdPath)
                const files = unzipLetterboxdExport(fileBuffer)
                const result = await importLetterboxdFn(demoUser.id, files, { resolver: cacheLetterboxdResolver })
                console.log(`Letterboxd Import Results: imported ${result.imported}, skipped ${result.skipped}`)
            } catch (error) {
                if (options?.strict) throw error
                console.error("\x1b[1m\x1b[31mFailed to seed Letterboxd ZIP:\x1b[0m", error)
            }
        } else {
            console.log("\nNo letterboxd.zip found. Skipping Letterboxd import.")
        }

        // 5. SEED Demo Media Fixture (remaining picks) & collections
        console.log("\nSeeding demo media fixture...")
        try {
            await (deps?.seedDemo ?? demoMediaSeeder.seedDemoMedia)(demoUser.id)
            console.log("Demo media fixture seeded successfully.")
        } catch (error) {
            if (options?.strict) throw error
            console.error(
                "Demo fixture seeding failed (continuing startup):",
                error instanceof Error ? error.message : error
            )
        }

        // 6. Collections extras for imported films
        console.log("\nSeeding demo collection extras...")
        try {
            await (deps?.seedCollectionExtras ?? demoMediaSeeder.seedDemoCollectionExtras)(demoUser.id, prisma, Boolean(options?.strict))
            console.log("Demo collection extras seeded successfully.")
        } catch (error) {
            if (options?.strict) throw error
            console.error(
                "Demo collection extras failed (continuing startup):",
                error instanceof Error ? error.message : error
            )
        }
    }

    try {
        await pruneJunkGenres(prisma)
    } catch (error) {
        console.error("Failed to prune junk genres during seed:", error)
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