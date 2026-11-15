import { AppError } from "@/api/domain/error.js"
import { DbClient, Prisma } from "@/db.js"
import prisma from "@/prismaClient.js"
import {
    findTagsForUser,
    findTagById,
    findTagByNameKey,
    findTagsByNameKeys,
    countTagsForUser,
    createTag,
    updateTag,
    deleteTag,
    syncLogTags,
} from "@/repositories/tagRepository.js"
import { tagInputSchema } from "@/schemas/tagSchemas.js"
import { MAX_TAGS_PER_USER, tagKey, validateSchema } from "@/utilities.js"

export class TagService {
    async getAll(userId: number) {
        return findTagsForUser(userId)
    }

    async create(userId: number, payload: unknown) {
        const { name } = validateSchema(tagInputSchema, payload)
        const key = tagKey(name)

        const existing = await findTagByNameKey(userId, key)
        if (existing) {
            const err = new AppError("A tag with that name already exists", 409)
            Object.assign(err, { tag: { id: existing.id, name: existing.name } })
            throw err
        }

        const count = await countTagsForUser(userId)
        if (count >= MAX_TAGS_PER_USER) {
            throw new AppError("Maximum 500 tags per user", 400)
        }

        try {
            const created = await createTag(userId, name, key)
            return { id: created.id, name: created.name }
        } catch (error: unknown) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
                const collision = await findTagByNameKey(userId, key)
                const err = new AppError("A tag with that name already exists", 409)
                if (collision) {
                    Object.assign(err, { tag: { id: collision.id, name: collision.name } })
                }
                throw err
            }
            throw error
        }
    }

    async rename(userId: number, tagId: number, payload: unknown) {
        const tag = await findTagById(tagId, userId)
        if (!tag) {
            throw new AppError("Tag not found", 404)
        }

        const { name } = validateSchema(tagInputSchema, payload)
        const newKey = tagKey(name)

        if (newKey !== tag.nameKey) {
            const collision = await findTagByNameKey(userId, newKey)
            if (collision && collision.id !== tagId) {
                const err = new AppError("A tag with that name already exists", 409)
                Object.assign(err, { tag: { id: collision.id, name: collision.name } })
                throw err
            }
        }

        try {
            const updated = await updateTag(tagId, name, newKey)
            return { id: updated.id, name: updated.name }
        } catch (error: unknown) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
                const collision = await findTagByNameKey(userId, newKey)
                const err = new AppError("A tag with that name already exists", 409)
                if (collision) {
                    Object.assign(err, { tag: { id: collision.id, name: collision.name } })
                }
                throw err
            }
            throw error
        }
    }

    async delete(userId: number, tagId: number) {
        const tag = await findTagById(tagId, userId)
        if (!tag) {
            throw new AppError("Tag not found", 404)
        }

        await deleteTag(tagId)
    }

    /**
     * Resolves an array of tag names for a user, auto-creating any new ones
     * (respecting user limit of 500 tags), and syncs the log's LogTag entries.
     */
    async resolveAndSyncTags(
        userId: number,
        logId: number,
        tagNames: string[],
        tx: DbClient = prisma
    ) {
        const keys = tagNames.map(tagKey)
        const existing = await findTagsByNameKeys(userId, keys, tx)
        const existingByKey = new Map(existing.map(t => [t.nameKey, t]))

        const missingNames: string[] = []
        for (const name of tagNames) {
            const k = tagKey(name)
            if (!existingByKey.has(k)) {
                missingNames.push(name)
            }
        }

        if (missingNames.length > 0) {
            // 500-tags-per-user limit check before inserting.
            // Under a race the count may be off by one, which is acceptable.
            const currentCount = await countTagsForUser(userId, tx)
            if (currentCount + missingNames.length > MAX_TAGS_PER_USER) {
                throw new AppError("Maximum 500 tags per user", 400)
            }

            for (const mName of missingNames) {
                const mKey = tagKey(mName)
                // Use createMany with skipDuplicates: true (translates to INSERT ... ON CONFLICT DO NOTHING in PostgreSQL)
                // so that concurrent inserts do not abort the interactive transaction block with a unique constraint error (25P02).
                // Under READ COMMITTED, the second transaction's insert waits on the unique index until the first commits,
                // and then does nothing. The following SELECT sees the committed row.
                await tx.tag.createMany({
                    data: [{ userId, name: mName, nameKey: mKey }],
                    skipDuplicates: true,
                })
                const tag = await findTagByNameKey(userId, mKey, tx)
                if (tag) {
                    existingByKey.set(tag.nameKey, tag)
                }
            }
        }

        const targetTagIds = tagNames.map(name => existingByKey.get(tagKey(name))!.id)
        await syncLogTags(logId, targetTagIds, tx)
    }
}

export const tagService = new TagService()
