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

export const saveRefreshToken = async (userId: number, token: string, expiresAt: Date, client: any) => {
    return await client.refreshToken.upsert({
        where: { token: token },
        update: { expiresAt },
        create: { userId, token, expiresAt }
    })
}

export async function findRefreshToken(token: string) {
    return await prisma.refreshToken.findUnique({
        where: { token },
        include: { user: true }
    })
}

export async function deleteRefreshToken(token: string) {
    return await prisma.refreshToken.delete({
        where: { token }
    })
}