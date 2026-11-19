import prisma from "@/prismaClient.js"
import { DbClient } from "@/db.js"
import { Prisma } from "@/generated/prisma/client.js"
import { openLibraryLimiter, parseRetryAfter } from "./search/rateLimiter.js"
import { createUserAgentHeader } from "@/utilities.js"
import { openLibraryResponseSchema, OpenLibraryBook } from "@/schemas/search/bookSchemas.js"
import { openLibraryService } from "@/services/search/openLibrarySearchService.js"
import { setMediaGenres, setMediaCreators, isJunkGenre } from "./genreService.js"
import { attachExternalIdsToMedia } from "@/repositories/mediaRepository.js"
import { validateDetails } from "@/schemas/detailsSchemas.js"

export interface OpenLibrarySyncResult {
    processed: number
    updated: number
}

// Bounded batch size keeping URL query length well under limit (≤ 50)
export const OL_BATCH_SIZE = 40
const MAX_CONSECUTIVE_FAILURES = 3

function cleanIsbn(val: unknown): string | null {
    if (typeof val !== "string" && typeof val !== "number") return null
    const s = String(val).replace(/["'= -]/g, "").trim()
    return s.length > 0 ? s : null
}

export async function syncOpenLibraryBooks(
    db: DbClient = prisma,
    updateProgress?: (pct: number) => Promise<void>
): Promise<OpenLibrarySyncResult> {
    let totalProcessed = 0
    let totalUpdated = 0
    let consecutiveFailures = 0
    const failedMediaIds = new Set<string>()

    const totalRaw = await db.$queryRaw<Array<{ count: bigint | number }>>(Prisma.sql`
        SELECT COUNT(*)::int AS count
        FROM "Media"
        WHERE provider = 'goodreads'
          AND "syncCheckedAt" IS NULL
    `)
    const total = Number(totalRaw[0]?.count ?? 0)

    if (total === 0) {
        if (updateProgress) await updateProgress(100)
        return { processed: 0, updated: 0 }
    }

    while (true) {
        const excludeClause = failedMediaIds.size > 0
            ? Prisma.sql`AND id NOT IN (${Prisma.join(Array.from(failedMediaIds))})`
            : Prisma.empty

        const candidates = await db.$queryRaw<Array<{
            id: string
            title: string
            creator: string | null
            year: number | null
            imageUrl: string | null
            providerId: string | null
            details: unknown
        }>>(Prisma.sql`
            SELECT id, title, creator, year, "imageUrl", "providerId", details
            FROM "Media"
            WHERE provider = 'goodreads'
              AND "syncCheckedAt" IS NULL
              ${excludeClause}
            ORDER BY id ASC
            LIMIT ${OL_BATCH_SIZE}
        `)

        if (!candidates || candidates.length === 0) {
            break
        }

        // 1. Gather ISBNs for batch lookup
        const candidateIds = candidates.map(c => c.id)
        const extIds = await db.mediaExternalId.findMany({
            where: {
                mediaId: { in: candidateIds },
                provider: { in: ["isbn13", "isbn"] },
            },
        })
        const extIdByMedia = new Map<string, string>()
        for (const e of extIds) {
            const cleaned = cleanIsbn(e.externalId)
            if (cleaned && !extIdByMedia.has(e.mediaId)) {
                extIdByMedia.set(e.mediaId, cleaned)
            }
        }

        const candidateDetailsMap = new Map<string, Record<string, unknown>>()
        const rowIsbnMap = new Map<string, string>()
        const isbnsToQuery: string[] = []

        for (const c of candidates) {
            const rawDetails = c.details
            let det: Record<string, unknown> = {}
            if (rawDetails && typeof rawDetails === "object" && !Array.isArray(rawDetails)) {
                det = rawDetails as Record<string, unknown>
            } else if (typeof rawDetails === "string") {
                try { det = JSON.parse(rawDetails) } catch { det = {} }
            }
            candidateDetailsMap.set(c.id, det)

            const isbn = extIdByMedia.get(c.id) ?? null
            if (isbn) {
                rowIsbnMap.set(c.id, isbn)
                if (!isbnsToQuery.includes(isbn)) {
                    isbnsToQuery.push(isbn)
                }
            }
        }

        // 2. Batch search for all ISBNs in candidates (if any)
        let docByIsbn = new Map<string, OpenLibraryBook>()
        let batchIsbnSearchFailed = false

        if (isbnsToQuery.length > 0) {
            try {
                docByIsbn = await openLibraryService.findByIsbns(isbnsToQuery)
                consecutiveFailures = 0
            } catch {
                batchIsbnSearchFailed = true
            }

            if (batchIsbnSearchFailed) {
                consecutiveFailures++
                for (const c of candidates) {
                    if (rowIsbnMap.has(c.id)) {
                        failedMediaIds.add(c.id)
                    }
                }
                if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                    console.warn(`Open Library sync stopped early: ${consecutiveFailures} consecutive failures`)
                    break
                }
            }
        }

        // 3. For each candidate: update from ISBN match, or fallback to title + author
        for (const item of candidates) {
            if (failedMediaIds.has(item.id)) continue

            const existingDetails = candidateDetailsMap.get(item.id) ?? {}
            const isbn = rowIsbnMap.get(item.id)
            let matchedDoc: OpenLibraryBook | null = isbn ? (docByIsbn.get(isbn) ?? null) : null

            // If no ISBN match, try title + author
            if (!matchedDoc) {
                let singleSearchFailed = false
                try {
                    matchedDoc = await openLibraryService.findByTitleAuthor(item.title, item.creator)
                    consecutiveFailures = 0
                } catch {
                    singleSearchFailed = true
                }

                if (singleSearchFailed) {
                    consecutiveFailures++
                    failedMediaIds.add(item.id)
                    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                        console.warn(`Open Library sync stopped early: ${consecutiveFailures} consecutive failures`)
                        break
                    }
                    continue // Failure never stamps, leave for next run
                }
            }

            const now = new Date()

            if (matchedDoc) {
                const coverUrl = matchedDoc.cover_i
                    ? `https://covers.openlibrary.org/b/id/${matchedDoc.cover_i}-M.jpg`
                    : item.imageUrl

                const pageCount = matchedDoc.number_of_pages_median ?? (typeof existingDetails.pageCount === "number" ? existingDetails.pageCount : undefined)
                const publisher = matchedDoc.publisher?.[0] ?? (typeof existingDetails.publisher === "string" ? existingDetails.publisher : undefined)
                const year = matchedDoc.first_publish_year ?? item.year ?? null // we store what Open Library says

                const updatedDetails = {
                    ...(pageCount != null ? { pageCount } : {}),
                    ...(publisher != null ? { publisher } : {}),
                }
                const validated = validateDetails(updatedDetails, { subtype: null, mediaTypeName: "book", hasProvider: true })

                await db.media.update({
                    where: { id: item.id },
                    data: {
                        imageUrl: coverUrl,
                        year,
                        details: (validated ?? Prisma.JsonNull) as Prisma.InputJsonValue,
                        provider: "openlibrary",
                        providerId: matchedDoc.key,
                        syncedAt: now,
                        syncCheckedAt: now,
                    },
                })

                if (item.providerId) {
                    await attachExternalIdsToMedia(item.id, [{ provider: "goodreads", externalId: item.providerId }], db)
                }

                const categories = (matchedDoc.subject ?? []).filter(s => !isJunkGenre(s, "book")).slice(0, 3)
                if (categories.length > 0) {
                    await setMediaGenres(item.id, categories, "book", db)
                }

                if (matchedDoc.author_name?.length) {
                    const creators = matchedDoc.author_name.map(name => ({ name, role: "author" }))
                    await setMediaCreators(item.id, creators, "book", item.creator, db)
                }

                if (matchedDoc.key) {
                    await attachExternalIdsToMedia(item.id, [{ provider: "openlibrary", externalId: matchedDoc.key }], db)
                }

                totalUpdated++
            } else {
                // Open Library has no match: stamp syncCheckedAt so row isn't retried every start
                await db.media.update({
                    where: { id: item.id },
                    data: { syncCheckedAt: now },
                })
            }

            totalProcessed++
        }

        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            break
        }

        if (updateProgress) {
            const pct = total > 0
                ? Math.min(99, Math.floor(100 * (totalProcessed + failedMediaIds.size) / total))
                : 100
            await updateProgress(pct)
        }
    }

    if (updateProgress) {
        await updateProgress(100)
    }

    return { processed: totalProcessed, updated: totalUpdated }
}

export const openLibrarySyncService = {
    syncOpenLibraryBooks,
}
