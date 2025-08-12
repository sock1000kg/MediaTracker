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
        }
    })

    if(!user) throw new Error('Cannot find user')
    return user
}

//MEDIA
export async function findMedia(title, type, creator, year) {
    return await prisma.media.findFirst({
        where: {
            title,
            type,
            creator: creator || null,
            year: year || null
        }
    })
}

//**Used in Default Media check upon registration
export async function findFirstMediaByTitle(title) {
    return await prisma.media.findFirst({
        where: {
            title
        }
    })
}

export async function createMedia(title, type, creator, year, metadata) {
    return await prisma.media.create({
        data: {
            title,
            type,
            creator,
            year,
            metadata
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