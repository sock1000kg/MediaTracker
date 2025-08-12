import prisma from "../prismaClient.js"

async function main() {
    const defaultMedia = await prisma.media.findFirst({
        where: {
            title: "Default Media"
        }
    })

    if(!defaultMedia){
        await prisma.media.create({
            data: {
                title: "Default Media",
                type: "book",
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