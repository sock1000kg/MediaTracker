
import prisma from "../prismaClient.js"
import bcrypt from "bcryptjs"

async function createSystemUser() {
    let systemUser = await prisma.user.findUnique({
        where: { id: 0 }
    });

    if (!systemUser) {
        const hashedPassword = await bcrypt.hash("system", 12);
        systemUser = await prisma.user.create({
            data: {
                id: 0, 
                username: "system",
                password: hashedPassword
            }
        });
        console.log("System user created");
    } else {
        console.log("System user already exists");
    }

    return systemUser;
}

async function createMediaTypeSeed(name, userId){
    const existing = await prisma.mediaType.findFirst({
        where: {
            name
        }
    })
    if(!existing){
        const mediatype = await prisma.mediaType.create({
            data: {
                name,
                created_at: new Date(),
                userId
            }
        })
        console.log("Default media type: " + name + " created")
        return mediatype
    }
    else console.log("Default media type:" + name + " already exists")
    return null
}

async function main() {
    const systemUser = await createSystemUser();

    //CREATE SEED MEDIA TYPE
    const book = await createMediaTypeSeed("book", systemUser.id)
    const music = await createMediaTypeSeed("music", systemUser.id)

    //CREATE SEED MEDIA
    const defaultMedia = await prisma.media.findFirst({
        where: {
            title: "Default Media",
            userId: systemUser.id
        }
    })

    if(!defaultMedia){
        await prisma.media.create({
            data: {
                title: "Default Media",
                mediaTypeId: 1,
                creator: "Unknown",
                year: new Date().getFullYear(),
                metadata: {},
                userId: systemUser.id
            }
        })
        console.log("Default Media created")
    }
    else console.log("Default Media already exists")
}

await main()
        .then(() => prisma.$disconnect())
        .catch(error => {
            console.error(error)
            prisma.$disconnect()
            process.exit(1)
        })