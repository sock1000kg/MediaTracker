import prisma from "@/prismaClient"
import { UserAPIKey } from "@prisma/client"

export async function addApiKeyForUser(userId: number, key: string, service: string): Promise<UserAPIKey> {
    return prisma.userAPIKey.create({
        data: { userId, key, service }
    })
}

export async function findApiKeyForUser(userId: number, service: string): Promise<UserAPIKey | null>{
    return prisma.userAPIKey.findFirst({
        where: {
            userId,
            service
        }
    })
}

export async function getAllApiKeys(userId: number): Promise<UserAPIKey[]> {
    return prisma.userAPIKey.findMany({
        where: { userId }
    })
}

export async function updateApiKeyForUser(userId: number, service: string, key: string): Promise<UserAPIKey> {
    return prisma.userAPIKey.update({
        where: { userId_service: { userId, service } },
        data: { key }
    })
}

export async function deleteApiKeyForUser(userId: number, service: string): Promise<void> {
    await prisma.userAPIKey.delete({
        where: { userId_service: { userId, service } }
    })
}