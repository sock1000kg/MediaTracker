import prisma from "@/prismaClient.js"
import { Prisma } from "@/db.js"
import { findUserByUsername } from "@/repositories/authRepository.js"
import { findMediaTypeForUserOrGlobal } from "@/repositories/mediaTypeRepository.js"
import { compactEdition } from "@/schemas/entrySchemas.js"
import { GoodReadsRow, goodreadsRowSchema } from "@/schemas/imports/goodReadsSchemas.js"
import { AppError } from "@/api/domain/error.js"
import { validateSchema, parseImportDate, toDayPrecision } from "@/utilities.js"
import { parse } from "csv-parse/sync"
import { ZodError } from "zod"
import { ImportResult } from "@/api/domain/imports.js"
import { executeBatchImport, BatchRowItem } from "./batchWrite.js"
import { LIMITS } from "@/config/limits.js"

export const MAX_IMPORT_FAILURES = LIMITS.imports.maxFailures

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
    async importFromGoodReads(
        userId: string,
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


        const validItems: BatchRowItem[] = []

        for (const [index, unvalidRecord] of rawRecords.entries()) {
            const rowNum = index + 2 // 1st entry is line 2
            const rawTitle = (unvalidRecord['Title'] as string) || "Unknown Title"
            try {
                const record = validateSchema(goodreadsRowSchema, unvalidRecord)
                const sourceId = record['Book Id'] ? String(record['Book Id']) : null
                const rawIsbn13 = record['ISBN13'] ? String(record['ISBN13']).replace(/["'=]/g, "").trim() : null
                const rawIsbn = record['ISBN'] ? String(record['ISBN']).replace(/["'=]/g, "").trim() : null

                const mainAuthor = record['Author']
                const additionalAuthors = record['Additional Authors']
                const year = record['Year Published'] ?? null
                const starRating = record['My Rating']
                const exclusiveShelf = record['Exclusive Shelf'] || ""
                const author = additionalAuthors ? `${mainAuthor}, ${additionalAuthors}` : mainAuthor

                let status = "wishlist"
                if (exclusiveShelf === 'read') status = "completed"
                else if (exclusiveShelf === 'currently-reading') status = "in progress"
                else if (record['Date Read']) status = "completed"

                const rating100 = typeof starRating === "number" && Number.isFinite(starRating) && starRating >= 1
                    ? Math.round(starRating * 20)
                    : null

                const rawPageCount = record['Number of Pages']
                const csvPageCount = typeof rawPageCount === "number" && rawPageCount > 0 ? rawPageCount : null

                const externalIds: { provider: string; id: string }[] = []
                if (sourceId) externalIds.push({ provider: "goodreads", id: sourceId })
                if (rawIsbn13) externalIds.push({ provider: "isbn13", id: rawIsbn13 })
                if (rawIsbn && rawIsbn !== rawIsbn13) externalIds.push({ provider: "isbn", id: rawIsbn })

                const structuredCreators: { name: string; role: string }[] = []
                if (mainAuthor?.trim()) {
                    structuredCreators.push({ name: mainAuthor.trim(), role: "author" })
                }
                if (additionalAuthors?.trim()) {
                    for (const a of additionalAuthors.split(", ")) {
                        const trimmed = a.trim()
                        if (trimmed) structuredCreators.push({ name: trimmed, role: "author" })
                    }
                }

                validItems.push({
                    rowNum,
                    title: record['Title'],
                    externalIds,
                    genres: [],
                    creators: structuredCreators,
                    mediaData: {
                        title: record['Title'],
                        creator: author,
                        year,
                        source: "goodreads",
                        sourceId,
                        description: null,
                        imageUrl: null,
                        details: {
                            ...(csvPageCount ? { pageCount: csvPageCount } : {}),
                            ...(record['Publisher'] ? { publisher: record['Publisher'] } : {}),
                        },
                    },
                    logData: {
                        status,
                        rating: rating100,
                        notes: record['My Review'] || "",
                        loggedAt: importedLogDate(record),
                        tags: [],
                    },
                    // One read, finished on Date Read (Goodreads has no start date). Read Count has no dates, so it adds nothing.
                    entries: [{
                        finishedAt: toDayPrecision(record['Date Read']),
                        edition: compactEdition({
                            title: record['Title'].slice(0, 300),
                            ...(record['Binding'] ? { format: record['Binding'].trim().slice(0, 60) } : {}),
                        }),
                    }],
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
                if (item.externalIds) {
                    for (const x of item.externalIds) {
                        const m = bySourceKey.get(`${x.provider.toLowerCase()}:${x.id}`)
                        if (m) return m
                    }
                }
                if (item.mediaData.sourceId) {
                    return bySourceKey.get(`goodreads:${item.mediaData.sourceId}`) ?? null
                }
                return null
            },
            computeGapFill: (media, log, item) => {
                let filledGap = false
                const logUpdates: { rating?: number } = {}
                let mediaPatch: Record<string, Prisma.InputJsonValue | null> | undefined

                const existingDetails = (media.details && typeof media.details === "object" && !Array.isArray(media.details))
                    ? (media.details as Record<string, unknown>)
                    : {}
                const hasPageCount = typeof existingDetails.pageCount === "number" && existingDetails.pageCount > 0
                const itemDetails = (item.mediaData.details && typeof item.mediaData.details === "object" && !Array.isArray(item.mediaData.details))
                    ? (item.mediaData.details as Record<string, unknown>)
                    : {}
                const csvPageCount = typeof itemDetails.pageCount === "number" ? itemDetails.pageCount : null

                if (!hasPageCount && csvPageCount) {
                    mediaPatch = { pageCount: csvPageCount }
                    filledGap = true
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
