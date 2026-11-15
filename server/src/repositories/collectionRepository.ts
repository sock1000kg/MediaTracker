import prisma from "@/prismaClient.js"
import { MEDIA_INCLUDE } from "./mediaFormat.js"
import { DbClient } from "@/db.js"
import { mapLogWithTags } from "@/repositories/logsRepository.js"

export interface CollectionSummary {
    id: string
    name: string
    description: string | null
    ranked: boolean
    count: number
    updated_at: Date
    covers: string[]
}

export async function findCollectionsForUser(userId: string, client: DbClient = prisma): Promise<CollectionSummary[]> {
    const collections = await client.collection.findMany({
        where: { userId },
        include: {
            items: {
                orderBy: { position: "asc" },
                include: {
                    log: {
                        include: {
                            media: true,
                        },
                    },
                },
            },
            _count: {
                select: { items: true },
            },
        },
        orderBy: { updated_at: "desc" },
    })

    return collections.map((c) => {
        const covers: string[] = []
        for (const it of c.items) {
            const url = it.log.media?.imageUrl
            if (typeof url === "string" && url.trim().length > 0) {
                covers.push(url)
                if (covers.length === 4) break
            }
        }
        return {
            id: c.id,
            name: c.name,
            description: c.description,
            ranked: c.ranked,
            count: c._count.items,
            updated_at: c.updated_at,
            covers,
        }
    })
}

export async function findCollectionById(id: string, userId: string, client: DbClient = prisma) {
    const c = await client.collection.findFirst({
        where: { id, userId },
        include: {
            items: {
                orderBy: { position: "asc" },
                include: {
                    log: {
                        include: {
                            media: { include: MEDIA_INCLUDE },
                            tags: { include: { tag: true } },
                            collectionItems: { select: { collectionId: true } },
                        },
                    },
                },
            },
        },
    })
    if (!c) return null

    return {
        id: c.id,
        name: c.name,
        description: c.description,
        ranked: c.ranked,
        created_at: c.created_at,
        updated_at: c.updated_at,
        items: c.items.map((it) => ({
            position: it.position,
            added_at: it.added_at,
            log: mapLogWithTags(it.log),
        })),
    }
}

export async function findCollectionRawById(id: string, userId: string, client: DbClient = prisma) {
    return client.collection.findFirst({
        where: { id, userId },
    })
}

export async function findCollectionByNameKey(userId: string, nameKey: string, client: DbClient = prisma) {
    return client.collection.findUnique({
        where: {
            userId_nameKey: { userId, nameKey },
        },
    })
}

export async function countCollectionsForUser(userId: string, client: DbClient = prisma) {
    return client.collection.count({
        where: { userId },
    })
}

export async function countItemsInCollection(collectionId: string, client: DbClient = prisma) {
    return client.collectionItem.count({
        where: { collectionId },
    })
}

export async function createCollection(
    userId: string,
    data: { name: string; nameKey: string; description: string | null; ranked: boolean },
    client: DbClient = prisma
) {
    return client.collection.create({
        data: {
            userId,
            name: data.name,
            nameKey: data.nameKey,
            description: data.description,
            ranked: data.ranked,
        },
    })
}

export async function updateCollection(
    id: string,
    data: { name?: string; nameKey?: string; description?: string | null; ranked?: boolean },
    client: DbClient = prisma
) {
    return client.collection.update({
        where: { id },
        data: {
            ...data,
            updated_at: new Date(),
        },
    })
}

export async function deleteCollection(id: string, client: DbClient = prisma) {
    return client.collection.delete({
        where: { id },
    })
}

export async function deleteAllCollectionsForUser(userId: string, client: DbClient = prisma) {
    return client.collection.deleteMany({
        where: { userId },
    })
}

export async function findCollectionItem(collectionId: string, logId: string, client: DbClient = prisma) {
    return client.collectionItem.findUnique({
        where: {
            collectionId_logId: { collectionId, logId },
        },
    })
}

export async function getCollectionItems(collectionId: string, client: DbClient = prisma) {
    return client.collectionItem.findMany({
        where: { collectionId },
        orderBy: { position: "asc" },
    })
}

export async function addItem(
    collectionId: string,
    logId: string,
    position: number,
    client: DbClient = prisma
) {
    return client.collectionItem.create({
        data: {
            collectionId,
            logId,
            position,
        },
    })
}

export async function removeItem(collectionId: string, logId: string, client: DbClient = prisma) {
    return client.collectionItem.delete({
        where: {
            collectionId_logId: { collectionId, logId },
        },
    })
}

export async function updateItemPosition(
    collectionId: string,
    logId: string,
    position: number,
    client: DbClient = prisma
) {
    return client.collectionItem.update({
        where: {
            collectionId_logId: { collectionId, logId },
        },
        data: { position },
    })
}

export async function touchCollection(id: string, client: DbClient = prisma) {
    return client.collection.update({
        where: { id },
        data: { updated_at: new Date() },
    })
}
