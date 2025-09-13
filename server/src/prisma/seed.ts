
import { createMedia } from "@/controllers/dbCalls/dbControllers"
import prisma from "@/prismaClient"
import bcrypt from "bcryptjs"

async function createSystemUser(): Promise<{ id: number }> {
    let systemUser = await prisma.user.findUnique({
        where: { id: 0 },
    })

    if (!systemUser) {
        if (!process.env.SYSTEM_USER_PASSWORD) {
        throw new Error("SYSTEM_USER_PASSWORD env variable is required")
        }

        const hashedPassword = await bcrypt.hash(process.env.SYSTEM_USER_PASSWORD, 12)
        systemUser = await prisma.user.create({
        data: {
            id: 0,
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

async function createDemoUser(): Promise<{ id: number }> {
    let demoUser = await prisma.user.findUnique({
        where: { id: 1 },
    })

    if (!demoUser) {
        if (!process.env.DEMO_USER_PASSWORD) {
        throw new Error("DEMO_USER_PASSWORD env variable is required")
        }

        const hashedPassword = await bcrypt.hash(process.env.DEMO_USER_PASSWORD, 12)
        demoUser = await prisma.user.create({
        data: {
            id: 1,
            username: "demo",
            password: hashedPassword,
            displayName: "Demo User",
        },
        })
        console.log("Demo user created")
    } else {
        console.log("Demo user already exists")
    }

    return demoUser
}

async function createMediaTypeSeed(name: string, userId: number) {
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
        return null
    }
}

async function main() {
    const systemUser = await createSystemUser()
    const demoUser = await createDemoUser()

    // CREATE SEED MEDIA TYPES
    const defaultType = await createMediaTypeSeed("book", systemUser.id)
    await createMediaTypeSeed("music", systemUser.id)

    // CREATE SEED MEDIA
    const defaultMedia = await prisma.media.findFirst({
        where: { title: "Default Media", userId: systemUser.id },
    })

    if (!defaultMedia && defaultType) {
        await createMedia(
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
            0
        )
        console.log("Default Media created")
    } else {
        console.log("Default Media already exists")
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
