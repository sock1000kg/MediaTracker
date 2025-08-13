import prisma from "../prismaClient.js"

async function createMediaTypeSeed(name){
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
            }
        })
        console.log("Default media type:" + name + "created")
        return mediatype
    }
    else console.log("Default media type:" + name + " already exists")
    return null
}

async function main() {
    //CREATE SEED MEDIA TYPE
    const book = await createMediaTypeSeed("book")
    const music = await createMediaTypeSeed("music")

    //CREATE SEED MEDIA
    const defaultMedia = await prisma.media.findFirst({
        where: {
            title: "Default Media"
        }
    })

    if(!defaultMedia){
        await prisma.media.create({
            data: {
                title: "Default Media",
                mediaTypeId: 1,
                creator: "Unknown",
                year: new Date().getFullYear(),
                metadata: {}
            }
        })
        console.log("Default Media created")
    }
    else console.log("Default Media already exists")
}

main()
    .then(() => prisma.$disconnect())
    .catch(error => {
        console.error(error)
        prisma.$disconnect()
        process.exit(1)
    })