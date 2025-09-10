import prisma from "@/prismaClient"
import { Prisma, User, Media, MediaType, UserLogs } from "@prisma/client"

//USERS
export async function createUser(
    username: string,
    displayName: string,
    hashedPassword: string
): Promise<User> {
    const existingUser = await prisma.user.findUnique({ where: { username } })
    if (existingUser) throw new Error("Username already taken")

    return prisma.user.create({
        data: { 
            username, 
            displayName, 
            password: hashedPassword },
    })
}

export async function findUserByUsername(username: string): Promise<User & { mediaType: MediaType[] }> {
    const user = await prisma.user.findUnique({
        where: {
            username 
        },
        include: { 
            mediaType: true 
        },
    })
    if (!user) throw new Error("Cannot find user")
    return user
}

//MEDIA
export async function getAllMediasUserCreated(userId: number): Promise<(Media & { mediaType: MediaType | null, logs: UserLogs[] })[]> {
    return prisma.media.findMany({
        where: { 
            userId 
        },
        include: { 
            mediaType: true, 
            logs: true },
    })
}

export async function getAllMediasForUser(userId: number): Promise<(Media & { mediaType: MediaType | null, logs: UserLogs[] })[]> {
    return prisma.media.findMany({
        where: { 
            OR: [
                { userId: 0 }, 
                { userId }
            ] },
        include: { 
            mediaType: true, 
            logs: true 
        },
    })
}

export async function findMediaForUser(
    title: string,
    userId: number,
    type: MediaType,
    creator: string | null,
    year: number | null,
    metadata: Prisma.JsonValue | null,
    source: string | null,
    sourceId: string | null,
    sourceRating: number | null,
    ratingsCount: number | null,
    description: string | null,
    imageUrl: string | null
): Promise<(Media & { mediaType: MediaType | null, logs: UserLogs[] }) | null> {
    return prisma.media.findFirst({
        where: {
            title,
            mediaType: { name: type.name },
            OR: [{ userId: 0 }, { userId }],
            ...(creator ? { creator } : {}),
            ...(year ? { year } : {}),
            ...(metadata ? { metadata: { equals: metadata } } : {}),
            ...(source ? { source } : {}),
            ...(sourceId ? { sourceId } : {}),
            ...(sourceRating ? { sourceRating } : {}),
            ...(ratingsCount ? { ratingsCount } : {}),
            ...(description ? { description } : {}),
            ...(imageUrl ? { imageUrl } : {})
        },
        include: { 
            mediaType: true, 
            logs: true },
    })
}

export async function findMediaForUserById(mediaId: number, userId: number): Promise<(Media & { mediaType: MediaType | null, logs: UserLogs[] }) | null> {
    return prisma.media.findFirst({
        where: { 
            id: mediaId, 
            OR: [
                { userId: 0 }, 
                { userId }
            ] },
        include: { 
            mediaType: true, 
            logs: true },
    })
}

export async function findMediaById(id: number): Promise<(Media & { mediaType: MediaType | null, logs: UserLogs[] }) | null> {
    return prisma.media.findUnique({
        where: { id },
        include: { 
            mediaType: true, 
            logs: true },
    })
}

export async function findMediaBySource(sourceId: string | null, source: string | null): Promise<Media | null> {
    if(source === null || sourceId === null) return null
    return prisma.media.findFirst({
        where: {
            source: source,
            sourceId: sourceId
        }
    })
}

//**Used in Default Media check upon registration
export async function findFirstMediaByTitle(title: string): Promise<(Media & { mediaType: MediaType | null, logs: UserLogs[] }) | null> {
    return prisma.media.findFirst({
        where: { title },
        include: { 
            mediaType: true, 
            logs: true },
    })
}



export async function createMedia(
    title: string,
    type: MediaType,
    creator: string | null,
    year: number | null,
    source: string | null,
    sourceId: string | null,
    sourceRating: number | null,
    ratingsCount: number | null,
    description: string | null,
    metadata: Prisma.JsonValue | null,
    imageUrl: string | null,
    userId: number
): Promise<Media & { mediaType: MediaType | null }> {
    return prisma.media.create({
        data: {
            title,
            mediaType: { connect: { id: type.id } },
            user: { connect: { id: userId } },
            ...(source ? { source } : {}),
            ...(sourceId ? { sourceId } : {}),
            ...(sourceRating ? { sourceRating } : {}),
            ...(ratingsCount ? { ratingsCount } : {}),
            ...(description ? { description } : {}),
            ...(creator ? { creator } : {}),
            ...(year ? { year } : {}),
            ...(metadata ? { metadata } : {}),
            ...(imageUrl ? { imageUrl } : {}),
        },
        include: { mediaType: true },
    })
}

export async function updateMediaForUser(
    title: string,
    type: MediaType,
    creator: string | null,
    year: number | null,
    source: string | null,
    sourceId: string | null,
    sourceRating: number | null,
    ratingsCount: number | null,
    description: string | null,
    metadata: Prisma.JsonValue | null,
    imageUrl: string | null,
    userId: number,
    mediaId: number
): Promise<Media & { mediaType: MediaType | null, logs: UserLogs[] }> {
    return prisma.media.update({
        where: { id: mediaId },
        data: {
            title,
            mediaType: { connect: { id: type.id } },
            user: { connect: { id: userId } },
            ...(source ? { source } : {}),
            ...(sourceId ? { sourceId } : {}),
            ...(sourceRating ? { sourceRating } : {}),
            ...(ratingsCount ? { ratingsCount } : {}),
            ...(description ? { description } : {}),
            ...(creator ? { creator } : {}),
            ...(year ? { year } : {}),
            ...(metadata ? { metadata } : {}),
            ...(imageUrl ? { imageUrl } : {}),
        },
        include: { mediaType: true, logs: true },
    })
}

export async function deleteMedia(id: number): Promise<void> {
    await prisma.media.delete({ where: { id } })
}

//MEDIA TYPE
export async function getAllMediaTypesForUser(userId: number): Promise<(MediaType & { media: Media[] })[]> {
    return prisma.mediaType.findMany({
        where: { 
            OR: [
                { userId: 0 }, 
                { userId }
            ] 
        },
        include: { media: true },
    })
}

// Each user has uniquely tied mediaType names (except the global ones)
export async function findMediaTypeForUserOrGlobal(typeName: string, userId: number): Promise<(MediaType & { media: Media[] }) | null>  {
    return prisma.mediaType.findFirst({
        where: {
            name: typeName,
            OR: [
                { userId: 0 }, 
                { userId: userId}
            ]
        },
        include: { media: true }
    })
}

export async function findMediaTypeForUser(name: string, userId: number): Promise<(MediaType & { media: Media[] }) | null> {
    return prisma.mediaType.findFirst({ 
        where: { 
            name, 
            userId 
        }, 
        include: { media: true } 
    })
}

export async function createMediaTypeForUser(name: string, userId: number): Promise<MediaType & { media: Media[] }> {
    return prisma.mediaType.create({ 
        data: { 
            name, 
            userId 
        },
        include: { media: true }
    })
}

// User can only delete media types that is tied to their ID (aka their own created types)
export async function deleteMediaTypeForUser(name: string, userId: number): Promise<void> {
    await prisma.mediaType.delete({ 
        where: { 
            userId_name: { 
                userId, 
                name 
            } 
        } 
    })
}

export async function updateMediaTypeForUser(oldName: string, newName: string, userId: number): Promise<MediaType> {
  return prisma.mediaType.update({
    where: { 
        userId_name: { 
            userId, 
            name: oldName 
        } 
    },
    data: { 
        name: 
        newName 
    },
  })
}

//LOGS
export async function createLog(
    userId: number, 
    mediaId: number, 
    status: string | null,
    rating: number | null, 
    notes: string | null
): Promise<UserLogs> {
    return prisma.userLogs.create({
        data: { userId, mediaId, status, rating, notes },
    })
}

export async function getAllLogs(userId: number): Promise<(UserLogs & { media: Media & { mediaType: MediaType | null } })[]> {
    return prisma.userLogs.findMany({
        where: { userId },
        include: { 
            media: { include: { mediaType: true } } 
        },
    })
}

export async function findLogOfUserByMediaId(userId: number, mediaId: number): Promise<(UserLogs & { media: Media & { mediaType: MediaType | null } }) | null> {
    return prisma.userLogs.findUnique({
        where: { 
            userId_mediaId: { 
                userId, 
                mediaId 
            } 
        },
        include: { 
            media: { include: { mediaType: true } } },
    })
    }

export async function findLogById(logId: number): Promise<(UserLogs & { media: Media & { mediaType: MediaType | null } }) | null> {
    return prisma.userLogs.findFirst({ 
        where: { id: logId }, 
        include: { media: { 
            include: { mediaType: true } 
            } 
        } 
    })
}

export async function updateLog(
    logId: number, 
    newStatus: string | null, 
    newRating: number | null, 
    newNotes: string | null
): Promise<UserLogs & { media: Media & { mediaType: MediaType | null } }> {
    return prisma.userLogs.update({
        where: { id: logId },
        data: { 
            ...(newStatus ? { status: newStatus } : {}), 
            ...(newRating ? { rating: newRating } : {}),
            ...(newNotes ? { notes: newNotes } : {}) 
        },
        include: { 
            media: { include: { mediaType: true } } 
        },
    })
}

export async function deleteLog(id) {
    await prisma.userLogs.delete({
        where: { id }
    })
}