import prisma from "@/prismaClient.js"
import { Prisma } from "@/db.js"
import { findUserByUsername } from "@/repositories/authRepository.js"
import { findMediaTypeForUserOrGlobal } from "@/repositories/mediaTypeRepository.js"
import { GoodReadsRow, goodreadsRowSchema } from "@/schemas/imports/goodReadsSchemas.js"
import { AppError } from "@/api/domain/error.js"
import { validateSchema, parseImportDate, toDayPrecision } from "@/utilities.js"
import { parse } from "csv-parse/sync"
import { BookMetadata } from "@/api/domain/media.js"
import { ZodError } from "zod"
import { ImportResult } from "@/api/domain/imports.js"
import { openLibraryService } from "../search/openLibrarySearchService.js"
import { executeBatchImport, BatchRowItem } from "./batchWrite.js"

// Helpers for preparing rich or unrich data
type BookEnrichmentData = {
    description: string | null
    imageUrl: string | null
    metadata: BookMetadata
}

export const MAX_IMPORT_FAILURES = 500

export type ImportProgressCallback = (processed: number, total: number) => Promise<void> | void

/**
 * Wraps a progress callback so it only fires when the integer percent changes
 * (plus once at 100%). With total 0 it reports 100 straight away via `start()`.
 * `report(processed)` is called after each row.
 */
export function makeProgressReporter(total: number, report: ImportProgressCallback) {
    let lastPct = -1
    const emit = async (processed: number) => {
        const pct = total <= 0 ? 100 : Math.floor((processed / total) * 100)
        if (pct === lastPct) return
        lastPct = pct
        await report(processed, total)
    }
    return {
        /** Call once before the first row: reports immediately when there is nothing to process. */
        start: async () => { if (total <= 0) await emit(0) },
        row: (processed: number) => emit(processed),
    }
}

/** Date Added, then Date Read; null (so the DB default of now applies) when neither parses. */
export function importedLogDate(record: Pick<GoodReadsRow, "Date Read" | "Date Added">): Date | null {
    return parseImportDate(record["Date Added"]) ?? parseImportDate(record["Date Read"])
}

export class GoodreadsImportService {
    /**
     * Enriches a record with Google Books data.
     * Returns a partial object to merge with mediaData.
     */
    private async fetchEnrichmentData(
        userId: number,
        record: GoodReadsRow
    ): Promise<BookEnrichmentData | null> {
        try {
            const isbn = record['ISBN13'] || record['ISBN']
            const cleanIsbn = isbn?.replace(/["'=]/g, "") // Clean Goodreads CSV formatting

            let query = ""
            if (cleanIsbn) {
                query = `isbn:${cleanIsbn}`
            } else {
                query = `intitle:${record['Title']} inauthor:${record['Author']}`
            }

            // catch errors silently so one failed search doesn't crash the import
            const searchResponse = await openLibraryService.searchBooksOpenLib(userId, query, 1).catch(() => null)
            const book = searchResponse?.results?.[0]

            if (!book) return null

            const meta = book.metadata as BookMetadata

            // Map Google result to our internal structure
            return {
                description: book.description || null,
                imageUrl: book.imageUrl || null,
                metadata: {
                    pageCount: meta.pageCount || null, // ignore 0
                    categories: meta.categories ?? null,
                    publisher: meta.publisher ?? null,
                },
            }
        } catch (error) {
            console.warn(`Enrichment failed for ${record['Title']}`, error)
            return null
        }
    }

    async importFromGoodReads(
        userId: number,
        fileBuffer: Buffer,
        opts: { onProgress?: ImportProgressCallback; enrich?: boolean } = {}
    ): Promise<ImportResult> {
        const rawRecords = parse(fileBuffer, {
            columns: true,
            skip_empty_lines: true,
            trim: true,
            cast: true,
            bom: true,
        }) as Record<string, unknown>[]

        const results: ImportResult = { imported: 0, updated: 0, skipped: 0, failures: [] }

        const systemUser = await findUserByUsername("system", prisma)
        const bookType = await findMediaTypeForUserOrGlobal("book", userId, prisma)
        if (!systemUser || !bookType) throw new AppError("System config missing", 500)

        const sourceIds = rawRecords
            .map(r => r['Book Id'])
            .filter(Boolean)
            .map(id => String(id))

        const existingMedia = await prisma.media.findMany({
            where: {
                source: "goodreads",
                sourceId: { in: sourceIds },
            },
            select: { sourceId: true },
        })
        const existingSourceIds = new Set(existingMedia.map(m => m.sourceId))

        const validItems: BatchRowItem[] = []
        const shouldEnrich = opts.enrich !== false

        for (const [index, unvalidRecord] of rawRecords.entries()) {
            const rowNum = index + 2 // 1st entry is line 2
            const rawTitle = (unvalidRecord['Title'] as string) || "Unknown Title"
            try {
                const record = validateSchema(goodreadsRowSchema, unvalidRecord)
                const sourceId = record['Book Id'] ? String(record['Book Id']) : null

                let enrichmentData: BookEnrichmentData | undefined
                if (shouldEnrich && sourceId && !existingSourceIds.has(sourceId)) {
                    await new Promise(r => setTimeout(r, 100))
                    const data = await this.fetchEnrichmentData(userId, record)
                    if (data) enrichmentData = data
                }

                const mainAuthor = record['Author']
                const additionalAuthors = record['Additional Authors']
                const year = record['Year Published'] ?? null
                const starRating = record['My Rating']
                const exclusiveShelf = record['Exclusive Shelf'] || ""
                const author = additionalAuthors ? `${mainAuthor}, ${additionalAuthors}` : mainAuthor
                const constructedSourceUrl = sourceId ? `https://www.goodreads.com/book/show/${sourceId}` : ""

                let status = "wishlist"
                if (exclusiveShelf === 'read') status = "completed"
                else if (exclusiveShelf === 'currently-reading') status = "in progress"
                else if (record['Date Read']) status = "completed"

                const rating100 = typeof starRating === "number" && Number.isFinite(starRating) && starRating >= 1
                    ? Math.round(starRating * 20)
                    : null

                const rawPageCount = record['Number of Pages']
                const csvPageCount = typeof rawPageCount === "number" && rawPageCount > 0 ? rawPageCount : null
                const pageCount = enrichmentData?.metadata?.pageCount ?? csvPageCount

                validItems.push({
                    rowNum,
                    title: record['Title'],
                    mediaData: {
                        title: record['Title'],
                        creator: author,
                        year,
                        source: "goodreads",
                        sourceId,
                        description: enrichmentData?.description ?? null,
                        imageUrl: enrichmentData?.imageUrl ?? null,
                        metadata: {
                            url: constructedSourceUrl,
                            ...(enrichmentData?.metadata || {}),
                            ...(pageCount ? { pageCount } : {}),
                        },
                    },
                    logData: {
                        status,
                        rating: rating100,
                        notes: record['My Review'] || "",
                        loggedAt: importedLogDate(record),
                        startedAt: null,
                        finishedAt: toDayPrecision(record['Date Read']),
                        tags: [],
                    },
                })
            } catch (error: unknown) {
                let reason = "Invalid data format"
                if (error instanceof ZodError) {
                    reason = error.issues
                        ? error.issues.map((i) => i.message).join(", ")
                        : error.message || "Invalid data format"
                } else if (error instanceof Error) {
                    reason = error.message
                }

                results.failures.push({
                    row: rowNum,
                    title: rawTitle,
                    reason: `Validation Error: ${reason}`,
                })
            }
        }

        await executeBatchImport({
            userId,
            systemUserId: systemUser.id,
            mediaTypeId: bookType.id,
            items: validItems,
            findExistingMediaMatch: (item, bySourceKey) => {
                if (item.mediaData.sourceId) {
                    return bySourceKey.get(`goodreads:${item.mediaData.sourceId}`) ?? null
                }
                return null
            },
            computeGapFill: (media, log, item) => {
                let filledGap = false
                const logUpdates: { rating?: number; finished_at?: Date } = {}
                let mediaPatch: Record<string, Prisma.InputJsonValue | null> | undefined

                const existingMeta = (media.metadata && typeof media.metadata === "object" && !Array.isArray(media.metadata))
                    ? (media.metadata as Record<string, unknown>)
                    : {}
                const hasPageCount = typeof existingMeta.pageCount === "number" && existingMeta.pageCount > 0
                const itemMeta = (item.mediaData.metadata && typeof item.mediaData.metadata === "object" && !Array.isArray(item.mediaData.metadata))
                    ? (item.mediaData.metadata as Record<string, unknown>)
                    : {}
                const csvPageCount = typeof itemMeta.pageCount === "number" ? itemMeta.pageCount : null

                if (!hasPageCount && csvPageCount) {
                    mediaPatch = { pageCount: csvPageCount }
                    filledGap = true
                }

                const parsedFinishedAt = item.logData.finishedAt
                if (log.finished_at === null && parsedFinishedAt !== null) {
                    if (!log.started_at || parsedFinishedAt.getTime() >= log.started_at.getTime()) {
                        logUpdates.finished_at = parsedFinishedAt
                        filledGap = true
                    }
                }

                if (log.rating === null && item.logData.rating !== null) {
                    logUpdates.rating = item.logData.rating
                    filledGap = true
                }

                if (!filledGap) return null
                return { logUpdates, mediaPatch }
            },
            onProgress: opts.onProgress,
            initialResults: results,
        })

        if (results.failures.length > MAX_IMPORT_FAILURES) {
            results.failuresTruncated = results.failures.length - MAX_IMPORT_FAILURES
            results.failures = results.failures.slice(0, MAX_IMPORT_FAILURES)
        } else {
            results.failuresTruncated = 0
        }
        return results
    }
}

export const goodreadsImportService = new GoodreadsImportService()
