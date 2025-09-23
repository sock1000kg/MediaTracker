import prisma from "@/prismaClient.js"
import { Prisma, User, Media, MediaType, UserLogs } from "@prisma/client"

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