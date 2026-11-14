import prisma from "@/prismaClient.js"
import { Prisma, DbClient } from "@/db.js"

const profileSelect = { id: true, username: true, displayName: true, created_at: true, preferences: true } as const

export async function getUserProfile(id: number, client: DbClient = prisma) {
    return client.user.findUnique({ where: { id }, select: profileSelect })
}

export async function getUserWithPassword(id: number, client: DbClient = prisma) {
    return client.user.findUnique({ where: { id } })
}

export async function updateDisplayName(id: number, displayName: string, client: DbClient = prisma) {
    return client.user.update({ where: { id }, data: { displayName }, select: profileSelect })
}

export async function updatePassword(id: number, password: string, client: DbClient = prisma) {
    return client.user.update({ where: { id }, data: { password }, select: { id: true } })
}

export async function getPreferences(id: number, client: DbClient = prisma): Promise<unknown> {
    const u = await client.user.findUnique({ where: { id }, select: { preferences: true } })
    return u?.preferences ?? {}
}

export async function setPreferences(id: number, json: Prisma.InputJsonValue, client: DbClient = prisma) {
    return client.user.update({ where: { id }, data: { preferences: json }, select: { preferences: true } })
}

export async function deleteAllRefreshTokensForUser(id: number, client: DbClient = prisma) {
    return client.refreshToken.deleteMany({ where: { userId: id } })
}

export async function deleteUserById(id: number, client: DbClient = prisma) {
    return client.user.delete({ where: { id } })
}

export async function getExportData(userId: number, client: DbClient = prisma) {
    const [mediaTypes, media, logs, collections] = await Promise.all([
        client.mediaType.findMany({ where: { userId }, orderBy: { id: "asc" } }),
        client.media.findMany({ where: { userId }, include: { mediaType: true }, orderBy: { id: "asc" } }),
        client.userLogs.findMany({
            where: { userId },
            include: {
                media: { include: { mediaType: true } },
                tags: { include: { tag: true } },
                collectionItems: { include: { collection: true } },
            },
            orderBy: { logged_at: "asc" },
        }),
        client.collection.findMany({
            where: { userId },
            include: {
                items: {
                    orderBy: { position: "asc" },
                    include: {
                        log: {
                            include: {
                                media: { include: { mediaType: true } },
                            },
                        },
                    },
                },
            },
            orderBy: { id: "asc" },
        }),
    ])
    return { mediaTypes, media, logs, collections }
}
