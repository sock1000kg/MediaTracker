import prisma from "@/prismaClient.js"
import { Prisma, DbClient } from "@/db.js"
import { MEDIA_INCLUDE, formatMedia } from "./mediaFormat.js"

const profileSelect = { id: true, username: true, displayName: true, created_at: true, preferences: true } as const

export async function getUserProfile(id: string, client: DbClient = prisma) {
    return client.user.findUnique({ where: { id }, select: profileSelect })
}

export async function getUserWithPassword(id: string, client: DbClient = prisma) {
    return client.user.findUnique({ where: { id } })
}

export async function updateDisplayName(id: string, displayName: string, client: DbClient = prisma) {
    return client.user.update({ where: { id }, data: { displayName }, select: profileSelect })
}

export async function updatePassword(id: string, password: string, client: DbClient = prisma) {
    return client.user.update({ where: { id }, data: { password }, select: { id: true } })
}

export async function getPreferences(id: string, client: DbClient = prisma): Promise<unknown> {
    const u = await client.user.findUnique({ where: { id }, select: { preferences: true } })
    return u?.preferences ?? {}
}

export async function setPreferences(id: string, json: Prisma.InputJsonValue, client: DbClient = prisma) {
    return client.user.update({ where: { id }, data: { preferences: json }, select: { preferences: true } })
}

export async function deleteAllRefreshTokensForUser(id: string, client: DbClient = prisma) {
    return client.refreshToken.deleteMany({ where: { userId: id } })
}

export async function deleteUserById(id: string, client: DbClient = prisma) {
    return client.user.delete({ where: { id } })
}

export async function getExportData(userId: string, client: DbClient = prisma) {
    const [mediaTypes, media, logs, collections] = await Promise.all([
        client.mediaType.findMany({ where: { userId }, orderBy: [{ created_at: "asc" }, { id: "asc" }] }),
        client.media.findMany({ where: { userId }, include: { ...MEDIA_INCLUDE }, orderBy: [{ created_at: "asc" }, { id: "asc" }] }),
        client.userLogs.findMany({
            where: { userId },
            include: {
                media: { include: { ...MEDIA_INCLUDE } },
                tags: { include: { tag: true } },
                collectionItems: { include: { collection: true } },
                entries: true,
            },
            orderBy: [{ logged_at: "asc" }, { id: "asc" }],
        }),
        client.collection.findMany({
            where: { userId },
            include: {
                items: {
                    orderBy: [{ position: "asc" }, { logId: "asc" }],
                    include: {
                        log: {
                            include: {
                                media: { include: { ...MEDIA_INCLUDE } },
                            },
                        },
                    },
                },
            },
            orderBy: [{ created_at: "asc" }, { id: "asc" }],
        }),
    ])
    return {
        mediaTypes,
        media: media.map(m => formatMedia(m)!),
        logs: logs.map(l => ({ ...l, media: formatMedia(l.media)! })),
        collections,
    }
}
