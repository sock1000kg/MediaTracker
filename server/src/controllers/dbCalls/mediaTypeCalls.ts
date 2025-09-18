import prisma from "@/prismaClient"
import { Media, MediaType } from "@prisma/client"

//MEDIA TYPE
export async function getAllMediaTypesForUser(userId: number): Promise<(MediaType & { media: Media[] })[]> {
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
export async function findMediaTypeForUserOrGlobal(typeName: string, userId: number): Promise<(MediaType & { media: Media[] }) | null>  {
    return prisma.mediaType.findFirst({
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