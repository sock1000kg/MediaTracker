import prisma from "../../../prismaClient.js"

//USERS
export async function createUser(username, hashedPassword){
    const existingUser = await prisma.user.findUnique({ where: { username } });
    if (existingUser) throw new Error('Username already taken');
    

    return await prisma.user.create({
        data: {
            username,
            password: hashedPassword
        }
    })
}

export async function findUserByUsername(username) {
    const user = await prisma.user.findUnique({
        where: {
            username   
        },
        include: { mediaType: true }
        
    })

    if(!user) throw new Error('Cannot find user')
    return user
}

//MEDIA
export async function findMedia(title, type, creator, year, userId) {
    return await prisma.media.findFirst({
        where: {
            title,
            mediaType: {
                name: type,
                OR: [
                    {userId: null}, //find whether media exists, checks both global types and personal types
                    {userId: userId}
                ]
            },
            ...(creator ? { creator } : {}),
            ...(year ? { year } : {})
        }
    })
}

//**Used in Default Media check upon registration
export async function findFirstMediaByTitle(title) {
    return await prisma.media.findFirst({
        where: {
            title
        },
        include: { mediaType: true }
    })
}

export async function createMedia(title, type, creator, year, metadata) {
    return await prisma.media.create({
        data: {
            title,
            mediaType: {
                connectOrCreate: {
                    where: { name: type }, 
                    create: { name: type }
                }
            },
            creator,
            year,
            metadata
        },
        include: {mediaType: true}
    })
}

//MEDIA TYPE
export async function getAllMediaTypes(userId) {
    return await prisma.mediaType.findMany({
        where: {
            OR: [
                { userId: null }, // global seed ones
                { userId: userId } // ones this user created
            ] 
        }
    })
}

export async function findMediaTypeForUser(name, userId) {
    return await prisma.mediaType.findUnique({
        where: {
            userId_name: {userId,name} //unique composite find syntax cus wtf
        }
    })
}
export async function createMediaType(name, userId) {
    return await prisma.mediaType.create({
        data: {
            name,
            userId
        }
    })
}

//LOGS
export async function createLog(userId, mediaId, status, rating, notes) {
    return await prisma.userLogs.create({
        data: {
            userId,
            mediaId,
            status,
            rating,
            notes
        }
    })
}

export async function getAllLogs(userId) {
    return await prisma.userLogs.findMany({
        where: {
            userId
        }
    })
}

export async function findLogOfUser(userId, mediaId) {
    return await prisma.userLogs.findFirst({
        where: {
            userId,
            mediaId
        }
    })
}