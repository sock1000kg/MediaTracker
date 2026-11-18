import crypto from "crypto"
import prisma from "@/prismaClient.js"
import { User, MediaType, UserAPIKey, DbClient } from "@/db.js"

export function hashRefreshToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex")
}

//USERS
export async function createUser(
    username: string,
    displayName: string,
    hashedPassword: string,
    client: DbClient
): Promise<User> {
    return client.user.create({
        data: { 
            username, 
            displayName, 
            password: hashedPassword },
    })
}

export async function findUserByUsername(username: string, client: DbClient): Promise<User & { mediaType: MediaType[] } | null> {
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

export async function findUserById(id: string): Promise<User & { apiKeys: UserAPIKey[] } | null> {
    return await prisma.user.findUnique({
        where: {
            id
        },
        include: { 
            apiKeys: true 
        },
    })
}

export const saveRefreshToken = async (userId: string, token: string, expiresAt: Date, client: DbClient) => {
    const tokenHash = hashRefreshToken(token)
    return await client.refreshToken.upsert({
        where: { tokenHash },
        update: { expiresAt },
        create: { userId, tokenHash, expiresAt }
    })
}

export async function findRefreshToken(token: string) {
    const tokenHash = hashRefreshToken(token)
    return await prisma.refreshToken.findUnique({
        where: { tokenHash },
        include: { user: true }
    })
}

/** Idempotent: returns how many rows were deleted (0 if already gone). */
export async function deleteRefreshToken(token: string): Promise<number> {
    const tokenHash = hashRefreshToken(token)
    const { count } = await prisma.refreshToken.deleteMany({
        where: { tokenHash }
    })
    return count
}
