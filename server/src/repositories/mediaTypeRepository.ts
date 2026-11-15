import prisma from "@/prismaClient.js"
import { Media, MediaType, DbClient } from "@/db.js"

//MEDIA TYPE
export async function getAllMediaTypesForUser(userId: string): Promise<(MediaType & { media: Media[] })[]> {
    return prisma.mediaType.findMany({
        where: { 
            OR: [
                {  user: { username: 'system' } }, 
                { userId }
            ] 
        },
        include: { media: true },
    })
}

// Each user has uniquely tied mediaType names (except the global ones)
export async function findMediaTypeForUserOrGlobal(typeName: string, userId: string, client: DbClient): Promise<(MediaType & { media: Media[] }) | null>  {
    return client.mediaType.findFirst({
        where: {
            name: typeName,
            OR: [
                {  user: { username: 'system' } }, 
                { userId: userId}
            ]
        },
        include: { media: true }
    })
}

export async function findMediaTypeForUser(name: string, userId: string): Promise<(MediaType & { media: Media[] }) | null> {
    return prisma.mediaType.findFirst({ 
        where: { 
            name, 
            userId 
        }, 
        include: { media: true } 
    })
}

export async function createMediaTypeForUser(name: string, userId: string, client: DbClient): Promise<MediaType & { media: Media[] }> {
    return client.mediaType.create({ 
        data: { 
            name, 
            userId 
        },
        include: { media: true }
    })
}

// User can only delete media types that is tied to their ID (aka their own created types)
export async function deleteMediaTypeForUser(name: string, userId: string, client: DbClient): Promise<void> {
    await client.mediaType.delete({ 
        where: { 
            userId_name: { 
                userId, 
                name 
            } 
        } 
    })
}

export async function deleteAllMediaTypeForUser(userId: string, client: DbClient): Promise<void> {
    await client.mediaType.deleteMany({ 
        where: { 
            userId
        } 
    })
}

export async function updateMediaTypeForUser(oldName: string, newName: string, userId: string): Promise<MediaType> {
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
