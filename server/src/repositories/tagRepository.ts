import prisma from "@/prismaClient.js"
import { DbClient } from "@/db.js"

export async function findTagsForUser(userId: number, client: DbClient = prisma) {
    const tags = await client.tag.findMany({
        where: { userId },
        include: {
            _count: {
                select: { logs: true }
            }
        }
    })
    return tags
        .map(t => ({ id: t.id, name: t.name, count: t._count.logs }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
}

export async function findTagById(id: number, userId: number, client: DbClient = prisma) {
    return client.tag.findFirst({
        where: { id, userId }
    })
}

export async function findTagByNameKey(userId: number, nameKey: string, client: DbClient = prisma) {
    return client.tag.findUnique({
        where: {
            userId_nameKey: { userId, nameKey }
        }
    })
}

export async function findTagsByNameKeys(userId: number, nameKeys: string[], client: DbClient = prisma) {
    return client.tag.findMany({
        where: {
            userId,
            nameKey: { in: nameKeys }
        }
    })
}

export async function countTagsForUser(userId: number, client: DbClient = prisma) {
    return client.tag.count({
        where: { userId }
    })
}

export async function createTag(userId: number, name: string, nameKey: string, client: DbClient = prisma) {
    return client.tag.create({
        data: { userId, name, nameKey }
    })
}

export async function updateTag(id: number, name: string, nameKey: string, client: DbClient = prisma) {
    return client.tag.update({
        where: { id },
        data: { name, nameKey }
    })
}

export async function deleteTag(id: number, client: DbClient = prisma) {
    return client.tag.delete({
        where: { id }
    })
}

export async function deleteAllTagsForUser(userId: number, client: DbClient = prisma) {
    return client.tag.deleteMany({
        where: { userId }
    })
}

export async function syncLogTags(logId: number, tagIds: number[], client: DbClient) {
    await client.logTag.deleteMany({ where: { logId } })
    if (tagIds.length > 0) {
        await client.logTag.createMany({
            data: tagIds.map(tagId => ({ logId, tagId }))
        })
    }
}
