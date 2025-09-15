import prisma from "@/prismaClient"
import { Prisma, Media, MediaType, UserLogs } from "@prisma/client"


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