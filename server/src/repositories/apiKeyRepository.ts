import prisma from "@/prismaClient.js"
import { UserAPIKey, ApiKeyService } from "@/db.js"

export async function addApiKeyForUser(userId: string, key: string, service: ApiKeyService): Promise<UserAPIKey> {
    return prisma.userAPIKey.create({
        data: { userId, key, service }
    })
}

export async function findApiKeyForUser(userId: string, service: ApiKeyService): Promise<UserAPIKey | null>{
    return prisma.userAPIKey.findFirst({
        where: {
            userId,
            service
        }
    })
}

export async function getAllApiKeys(userId: string): Promise<UserAPIKey[]> {
    return prisma.userAPIKey.findMany({
        where: { userId }
    })
}

export async function updateApiKeyForUser(userId: string, service: ApiKeyService, key: string): Promise<UserAPIKey> {
    return prisma.userAPIKey.update({
        where: { userId_service: { userId, service } },
        data: { key }
    })
}

export async function deleteApiKeyForUser(userId: string, service: ApiKeyService): Promise<void> {
    await prisma.userAPIKey.delete({
        where: { userId_service: { userId, service } }
    })
}
