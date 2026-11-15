import { AppError } from "@/api/domain/error.js"
import { DbClient, Prisma } from "@/db.js"
import prisma from "@/prismaClient.js"
import { findLogById } from "@/repositories/logsRepository.js"
import {
    findCollectionsForUser,
    findCollectionById,
    findCollectionRawById,
    findCollectionByNameKey,
    countCollectionsForUser,
    countItemsInCollection,
    createCollection,
    updateCollection,
    deleteCollection,
    findCollectionItem,
    getCollectionItems,
    addItem,
    removeItem,
    updateItemPosition,
    touchCollection,
} from "@/repositories/collectionRepository.js"
import {
    createCollectionSchema,
    updateCollectionSchema,
    addCollectionItemSchema,
    reorderCollectionSchema,
} from "@/schemas/collectionSchemas.js"
import {
    MAX_COLLECTIONS_PER_USER,
    MAX_ITEMS_PER_COLLECTION,
    collectionKey,
    validateSchema,
} from "@/utilities.js"

export class CollectionService {
    async getAll(userId: number) {
        return findCollectionsForUser(userId)
    }

    async getById(userId: number, collectionId: number) {
        const c = await findCollectionById(collectionId, userId)
        if (!c) {
            throw new AppError("Collection not found", 404)
        }
        return c
    }

    async create(userId: number, payload: unknown) {
        const { name, description, ranked } = validateSchema(createCollectionSchema, payload)
        const key = collectionKey(name)

        const existing = await findCollectionByNameKey(userId, key)
        if (existing) {
            const err = new AppError("A collection with that name already exists", 409)
            Object.assign(err, { collection: { id: existing.id, name: existing.name } })
            throw err
        }

        const count = await countCollectionsForUser(userId)
        if (count >= MAX_COLLECTIONS_PER_USER) {
            throw new AppError("Maximum 200 collections per user", 400)
        }

        try {
            return await createCollection(userId, {
                name,
                nameKey: key,
                description: description ?? null,
                ranked: ranked ?? false,
            })
        } catch (error: unknown) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
                const collision = await findCollectionByNameKey(userId, key)
                const err = new AppError("A collection with that name already exists", 409)
                if (collision) {
                    Object.assign(err, { collection: { id: collision.id, name: collision.name } })
                }
                throw err
            }
            throw error
        }
    }

    async update(userId: number, collectionId: number, payload: unknown) {
        const existing = await findCollectionRawById(collectionId, userId)
        if (!existing) {
            throw new AppError("Collection not found", 404)
        }

        const data = validateSchema(updateCollectionSchema, payload)
        let nameKey: string | undefined

        if (data.name !== undefined) {
            const key = collectionKey(data.name)
            if (key !== existing.nameKey) {
                const collision = await findCollectionByNameKey(userId, key)
                if (collision && collision.id !== collectionId) {
                    const err = new AppError("A collection with that name already exists", 409)
                    Object.assign(err, { collection: { id: collision.id, name: collision.name } })
                    throw err
                }
            }
            nameKey = key
        }

        try {
            return await updateCollection(collectionId, {
                name: data.name,
                nameKey,
                description: data.description !== undefined ? data.description : undefined,
                ranked: data.ranked,
            })
        } catch (error: unknown) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
                const collision = nameKey ? await findCollectionByNameKey(userId, nameKey) : null
                const err = new AppError("A collection with that name already exists", 409)
                if (collision) {
                    Object.assign(err, { collection: { id: collision.id, name: collision.name } })
                }
                throw err
            }
            throw error
        }
    }

    async delete(userId: number, collectionId: number) {
        const existing = await findCollectionRawById(collectionId, userId)
        if (!existing) {
            throw new AppError("Collection not found", 404)
        }

        await deleteCollection(collectionId)
    }

    async addItem(userId: number, collectionId: number, payload: unknown) {
        const { logId } = validateSchema(addCollectionItemSchema, payload)

        return prisma.$transaction(async (tx: DbClient) => {
            // Lock the Collection row (FOR UPDATE) to serialize concurrent operations
            // on this collection, ensuring atomic position calculation and preventing duplicate positions
            // under READ COMMITTED transaction isolation.
            await tx.$queryRaw`SELECT id FROM "Collection" WHERE id = ${collectionId} FOR UPDATE`

            const collection = await findCollectionRawById(collectionId, userId, tx)
            if (!collection) {
                throw new AppError("Collection not found", 404)
            }

            const log = await findLogById(logId, tx)
            if (!log || log.userId !== userId) {
                throw new AppError("Log not found", 404)
            }

            const existing = await findCollectionItem(collectionId, logId, tx)
            if (existing) {
                throw new AppError("Log is already in this collection", 409)
            }

            const currentItemCount = await countItemsInCollection(collectionId, tx)
            if (currentItemCount >= MAX_ITEMS_PER_COLLECTION) {
                throw new AppError("Maximum 1000 items per collection", 400)
            }

            const lastItem = await tx.collectionItem.findFirst({
                where: { collectionId },
                orderBy: { position: "desc" },
                select: { position: true },
            })
            const position = lastItem != null ? lastItem.position + 1 : 0

            try {
                const created = await addItem(collectionId, logId, position, tx)
                await touchCollection(collectionId, tx)
                return created
            } catch (error: unknown) {
                if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
                    throw new AppError("Log is already in this collection", 409)
                }
                throw error
            }
        })
    }

    async removeItem(userId: number, collectionId: number, logId: number) {
        return prisma.$transaction(async (tx: DbClient) => {
            // Lock the Collection row (FOR UPDATE) to serialize concurrent removals
            // and guarantee safe position re-densification.
            await tx.$queryRaw`SELECT id FROM "Collection" WHERE id = ${collectionId} FOR UPDATE`

            const collection = await findCollectionRawById(collectionId, userId, tx)
            if (!collection) {
                throw new AppError("Collection not found", 404)
            }

            const existing = await findCollectionItem(collectionId, logId, tx)
            if (!existing) {
                throw new AppError("Item not found in collection", 404)
            }

            await removeItem(collectionId, logId, tx)

            const remaining = await getCollectionItems(collectionId, tx)
            for (let i = 0; i < remaining.length; i++) {
                if (remaining[i].position !== i) {
                    await updateItemPosition(collectionId, remaining[i].logId, i, tx)
                }
            }
            await touchCollection(collectionId, tx)
        })
    }

    async reorder(userId: number, collectionId: number, payload: unknown) {
        const { logIds } = validateSchema(reorderCollectionSchema, payload)

        return prisma.$transaction(async (tx: DbClient) => {
            // Lock the Collection row (FOR UPDATE) to serialize concurrent reorders
            // on this collection.
            await tx.$queryRaw`SELECT id FROM "Collection" WHERE id = ${collectionId} FOR UPDATE`

            const collection = await findCollectionRawById(collectionId, userId, tx)
            if (!collection) {
                throw new AppError("Collection not found", 404)
            }

            const currentItems = await getCollectionItems(collectionId, tx)
            if (logIds.length !== currentItems.length) {
                throw new AppError("Order list must contain exactly the current items", 400)
            }

            const currentSet = new Set(currentItems.map((it) => it.logId))
            const seen = new Set<number>()
            for (const id of logIds) {
                if (seen.has(id) || !currentSet.has(id)) {
                    throw new AppError("Order list must be a permutation of current items", 400)
                }
                seen.add(id)
            }

            for (let i = 0; i < logIds.length; i++) {
                await updateItemPosition(collectionId, logIds[i], i, tx)
            }
            await touchCollection(collectionId, tx)
            return { message: "Order updated" }
        })
    }
}

export const collectionService = new CollectionService()
