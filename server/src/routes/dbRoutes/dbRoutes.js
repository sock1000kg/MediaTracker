import prisma from "../../../prismaClient.js"

//USERS
export async function createUser(username, displayName, hashedPassword){
    const existingUser = await prisma.user.findUnique({ where: { username } });
    if (existingUser) throw new Error('Username already taken');
    

    return await prisma.user.create({
        data: {
            username,
            displayName,
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
export async function getAllMediasForUser(userId){
    return await prisma.media.findMany({
        where: {
            OR: [
                { userId: 0 }, // global seed ones
                { userId: userId } // ones this user created
            ] 
        },
        include: { 
            mediaType: true,
            logs: true,
        }
    })
}


export async function findMediaForUser(title, type, creator, year, metadata, userId) {
    return await prisma.media.findFirst({
        where: {
            title,
            mediaType: {
                name: type.name
            },
            OR: [
                { userId: 0 }, // global seed ones
                { userId: userId } // ones this user created
            ],
            // Optional info
            ...(creator ? { creator } : {}),
            ...(year ? { year } : {}),
            ...(metadata ? { metadata: { equals: metadata } } : {}) //JSON filter
        },
        include: { 
            mediaType: true,
            logs: true,
        }
    }) 
}

export async function findMediaForUserById(mediaId, userId){
    return await prisma.media.findFirst({
        where: { 
            id: mediaId,
            OR: [
                { userId: 0 }, // global seed ones
                { userId: userId } // ones this user created
            ],
        },
        include: { 
            mediaType: true,
            logs: true,
        }
    })
}

export async function findMediaById(id){
    return await prisma.media.findUnique({
        where: { id },
        include: { 
            mediaType: true,
            logs: true,
        }
    })
}

//**Used in Default Media check upon registration
export async function findFirstMediaByTitle(title) {
    return await prisma.media.findFirst({
        where: {
            title
        },
        include: { 
            mediaType: true,
            logs: true,
        }
    })
}

export async function createMedia(title, type, creator, year, metadata, userId) {
    return await prisma.media.create({
        data: {
            title,
            mediaType: { 
                connect: { 
                    id: type.id
                }
            },
            user: {
                connect: {
                    id: userId
                }
            },
            // Optional info
            ...(creator ? {creator} : {}),
            ...(year ? {year} : {}),
            ...(metadata ? {metadata} : {}),
        },
        include: { mediaType: true }
    })
}

export async function updateMediaForUser(title, type, creator, year, metadata, userId, mediaId) {
    return await prisma.media.update({
        where: { id: mediaId },
        data: {
            title,
            ...(creator ? {creator} : {}),
            ...(year ? {year} : {}),
            ...(metadata ? {metadata} : {}),
            mediaType: { 
                connect: { 
                    id: type.id
                }
            },
            user: {
                connect: {
                    id: userId
                }
            },
        },
        include: { 
            mediaType: true,
            logs: true,
        }
    })
}

export async function deleteMedia(id){
    await prisma.media.delete({
        where: { id }
    })
}

//MEDIA TYPE
export async function getAllMediaTypesForUser(userId) {
    return await prisma.mediaType.findMany({
        where: {
            OR: [
                { userId: 0 }, // global seed ones
                { userId: userId } // ones this user created
            ] 
        },
        include: { media: true }
    })
}

// Each user has uniquely tied mediaType names (except the global ones)
export async function findMediaTypeForUserOrGlobal(typeName, userId) {
    return prisma.mediaType.findFirst({
        where: {
            name: typeName,
            OR: [
                { userId: 0 }, 
                { userId: userId}
            ]
        },
        include: { media: true }
    });
}

export async function findMediaTypeForUser(name, userId){
    return prisma.mediaType.findFirst({
        where: {
            name,
            userId
        },
        include: { media: true }
    });
}

export async function createMediaTypeForUser(name, userId) {
    return await prisma.mediaType.create({
        data: {
            name,
            userId
        }
    })
}

// User can only delete media types that is tied to their ID (aka their own created types)
export async function deleteMediaTypeForUser(name, userId) {
    await prisma.mediaType.delete({
        where: {
            userId_name: {userId,name}
        }
    })
}

export async function updateMediaTypeForUser(oldName, newName, userId) {
    return await prisma.mediaType.update({
        where: {
            userId_name: {userId,name: oldName}
        },
        data: {
            name: newName
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
        },
        include: {
            media: {
                include: {
                    mediaType: true
                }
            }
        }
    })
}

export async function findLogOfUserByMediaId(userId, mediaId) {
    return await prisma.userLogs.findUnique({
        where: {
            userId_mediaId: {
                userId,
                mediaId
            }
        },
        include: {
            media: {
                include: {
                    mediaType: true
                }
            }
        }
    })
}

export async function findLogById(logId) {
    return await prisma.userLogs.findFirst({
        where: {
            id: logId
        },
        include: {
            media: {
                include: {
                    mediaType: true
                }
            }
        }
    })
}

export async function updateLog(logId, newStatus, newRating, newNotes) {
    return await prisma.userLogs.update({
        where: {
            id: logId
        },
        data: {
            ...(newStatus ? {status: newStatus} : {}),
            ...(newNotes ? {notes: newNotes} : {}),
            ...(newRating ? {rating: newRating} : {})
        },
        include: {
            media: {
                include: {
                    mediaType: true
                }
            }
        }
    })
}

export async function deleteLog(id) {
    await prisma.userLogs.delete({
        where: { id }
    })
}