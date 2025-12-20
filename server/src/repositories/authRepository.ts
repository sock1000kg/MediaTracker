import prisma from "@/prismaClient.js"
import { User, MediaType, UserAPIKey } from "@prisma/client"
import { PrismaClient } from "@prisma/client/extension"

//USERS
export async function createUser(
    username: string,
    displayName: string,
    hashedPassword: string,
    client: PrismaClient
): Promise<User> {
    return client.user.create({
        data: { 
            username, 
            displayName, 
            password: hashedPassword },
    })
}

export async function findUserByUsername(username: string, client: PrismaClient): Promise<User & { mediaType: MediaType[] } | null> {
    const user = await client.user.findUnique({
        where: {
            username 
        },
        include: { 
            mediaType: true,
        },
    })
    return user ?? null
}

export async function findUserById(id: number): Promise<User & { apiKeys: UserAPIKey[] } | null> {
    return await prisma.user.findUnique({
        where: {
            id
        },
        include: { 
            apiKeys: true 
        },
    })
}