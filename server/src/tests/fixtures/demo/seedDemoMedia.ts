import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import prisma from "@/prismaClient.js"
import { DbClient } from "@/db.js"
import { createImportedMedia } from "@/api/domain/media.js"
import {
    findCollectionByNameKey,
    createCollection,
    findCollectionItem,
    addItem,
} from "@/repositories/collectionRepository.js"
import { collectionKey } from "@/utilities.js"
import { DEMO_COLLECTIONS, DEMO_COLLECTION_EXTRAS } from "./picks.js"
import type { SearchResult } from "@/schemas/search/searchSchemas.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export interface DemoFixtureItem {
    mediaTypeName: string
    media: SearchResult
    parent?: SearchResult
    log: {
        status: "completed" | "in progress" | "wishlist" | "dropped"
        rating?: number | null
        notes?: string | null
        loggedAt: string
        startedAt?: string | null
        finishedAt?: string | null
        tags?: string[]
    }
    collections: string[]
}

export interface DemoFixture {
    collections: typeof DEMO_COLLECTIONS
    items: DemoFixtureItem[]
}

export function loadDemoFixture(): DemoFixture {
    const candidatePaths = [
        path.join(__dirname, "demo-media.json"),
        path.resolve(__dirname, "../../src/tests/fixtures/demo/demo-media.json"),
        path.resolve(process.cwd(), "src/tests/fixtures/demo/demo-media.json"),
        path.resolve(process.cwd(), "server/src/tests/fixtures/demo/demo-media.json"),
        path.resolve(process.cwd(), "dist/tests/fixtures/demo/demo-media.json"),
    ]

    for (const p of candidatePaths) {
        if (fs.existsSync(p)) {
            const raw = fs.readFileSync(p, "utf-8")
            return JSON.parse(raw) as DemoFixture
        }
    }
    throw new Error(`demo-media.json not found in candidates: ${candidatePaths.join(", ")}`)
}

export async function seedDemoMedia(
    demoUserId: string,
    db: DbClient = prisma,
    overrideFixture?: DemoFixture
): Promise<void> {
    const fixture = overrideFixture ?? loadDemoFixture()

    // 1. Ensure collections exist
    const collectionMap = new Map<string, string>()
    for (const c of fixture.collections) {
        const key = collectionKey(c.name)
        let coll = await findCollectionByNameKey(demoUserId, key, db)
        if (!coll) {
            coll = await createCollection(
                demoUserId,
                {
                    name: c.name,
                    nameKey: key,
                    description: c.description,
                    ranked: c.ranked,
                },
                db
            )
        }
        collectionMap.set(c.name, coll.id)
    }

    // 2. Insert items and logs
    for (const item of fixture.items) {
        try {
            const { log } = await createImportedMedia(
                {
                    userId: demoUserId,
                    mediaTypeName: item.mediaTypeName,
                    mediaData: {
                        title: item.media.title,
                        creator: item.media.creator ?? null,
                        year: item.media.year ? Number(item.media.year) : null,
                        source: item.media.source,
                        sourceId: item.media.sourceId,
                        description: item.media.description ?? null,
                        imageUrl: item.media.imageUrl ?? null,
                        metadata: item.media.metadata ?? null,
                    },
                    parent: item.parent
                        ? {
                              ...item.parent,
                              year: item.parent.year ? Number(item.parent.year) : null,
                          }
                        : undefined,
                    logData: {
                        status: item.log.status,
                        rating: item.log.rating ?? null,
                        notes: item.log.notes ?? null,
                        loggedAt: item.log.loggedAt ? new Date(item.log.loggedAt) : null,
                        startedAt: item.log.startedAt ? new Date(item.log.startedAt) : null,
                        finishedAt: item.log.finishedAt ? new Date(item.log.finishedAt) : null,
                        tags: item.log.tags,
                    },
                },
                db
            )

            // 3. Add to collections if specified
            for (const collName of item.collections) {
                const collId = collectionMap.get(collName)
                if (!collId) continue

                const existing = await findCollectionItem(collId, log.id, db)
                if (!existing) {
                    const lastItem = await db.collectionItem.findFirst({
                        where: { collectionId: collId },
                        orderBy: { position: "desc" },
                        select: { position: true },
                    })
                    const position = lastItem != null ? lastItem.position + 1 : 0
                    await addItem(collId, log.id, position, db)
                }
            }
        } catch (error) {
            const cause = error instanceof Error ? error.message : String(error)
            const title = item.media?.title ?? "unknown"
            const source = item.media?.source ?? "unknown"
            const sourceId = item.media?.sourceId ?? "unknown"
            const err = new Error(`Demo fixture item "${title}" (${source}:${sourceId}) failed: ${cause}`)
            ;(err as unknown as { cause: unknown }).cause = error
            throw err
        }
    }
}

export async function seedDemoCollectionExtras(
    demoUserId: string,
    db: DbClient = prisma,
    strict = false
): Promise<void> {
    for (const extra of DEMO_COLLECTION_EXTRAS) {
        const key = collectionKey(extra.collection)
        const coll = await findCollectionByNameKey(demoUserId, key, db)
        if (!coll) {
            const msg = `Collection "${extra.collection}" not found for demo collection extra`
            if (strict) throw new Error(msg)
            console.warn(msg)
            continue
        }

        const userLog = await db.userLogs.findFirst({
            where: {
                userId: demoUserId,
                media: {
                    mediaType: { name: extra.mediaTypeName },
                    year: extra.year,
                    title: { equals: extra.title, mode: "insensitive" },
                },
            },
            select: { id: true },
        })

        if (!userLog) {
            const msg = `Film "${extra.title}" (${extra.year}) not found in demo user logs for collection "${extra.collection}"`
            if (strict) throw new Error(msg)
            console.warn(msg)
            continue
        }

        const existing = await findCollectionItem(coll.id, userLog.id, db)
        if (!existing) {
            const lastItem = await db.collectionItem.findFirst({
                where: { collectionId: coll.id },
                orderBy: { position: "desc" },
                select: { position: true },
            })
            const position = lastItem != null ? lastItem.position + 1 : 0
            await addItem(coll.id, userLog.id, position, db)
        }
    }
}

export const demoMediaSeeder = {
    seedDemoMedia,
    seedDemoCollectionExtras,
}
