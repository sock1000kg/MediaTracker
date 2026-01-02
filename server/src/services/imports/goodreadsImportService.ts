import prisma from "@/prismaClient.js"
import { findUserByUsername } from "@/repositories/authRepository.js"
import { findMediaTypeForUserOrGlobal } from "@/repositories/mediaTypeRepository.js"
import { GoodReadsRow, goodreadsRowSchema } from "@/schemas/imports/goodReadsSchemas.js"
import { AppError } from "@/api/domain/error.js"
import { validateSchema } from "@/utilities.js"
import { PrismaClient } from "@prisma/client/extension"
import { parse } from "csv-parse/sync"
import { googleBooksService } from "../search/googleBooksSearchService.js"
import { BookMetadata, createImportedMedia } from "@/api/domain/media.js"
import { ZodError } from "zod"
import { ImportFailure, ImportResult } from "@/api/domain/imports.js"

//Helpers for preparing rich or unrich data
type BookEnrichmentData = {
    description: string | null
    imageUrl: string | null
    metadata: BookMetadata
}

type PreparedImportItem = {
    isValid: boolean
    record: GoodReadsRow
    enrichmentData?: BookEnrichmentData
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
            const searchResponse = await googleBooksService.searchBooksGGBooks(userId, query, 0).catch(() => null)
            const book = searchResponse?.results?.[0]

            if (!book) return null

            const meta = book.metadata as BookMetadata

            // Map Google result to our internal structure
            return {
                description: book.description || null,
                imageUrl: book.imageUrl || null,
                metadata: {
                    pageCount: meta.pageCount ?? null,
                    categories: meta.categories ?? null,
                    publisher: meta.publisher ?? null
                }
            }
        } catch (error) {
            console.warn(`Enrichment failed for ${record['Title']}`, error)
            return null
        }
    }

    async importFromGoodReads(userId: number, fileBuffer: Buffer): Promise<ImportResult> {
        const rawRecords = parse(fileBuffer, {
            columns: true, //use the headers as fields for JSON, if false it parses data into arrays
            skip_empty_lines: true,
            trim: true,
            cast: true,
            bom: true //handle weird Excel csv apparently, just for safety
        }) as Record<string, unknown>[]

        const results: ImportResult = { imported: 0, skipped: 0, failures: [] }
        const failures: ImportFailure[] = []
        const preparedItems: PreparedImportItem[] = []

        // EXTRACT ALL EXISTING RECORDS TO SAVE ENRICHMENT API calls
        const sourceIds = rawRecords
            .map(r => r['Book Id'])
            .filter(Boolean)
            .map(id => String(id)) // Force string conversion

        const existingMedia = await prisma.media.findMany({
            where: {
                source: "goodreads",
                sourceId: { in: sourceIds }
            },
            select: { sourceId: true }
        })
        const existingSourceIds = new Set(existingMedia.map(m => m.sourceId))

        //ENRICHMENT OF IMPORTED DATA
        for (const [index, unvalidRecord] of rawRecords.entries()) {
            const rowNum = index + 2 //+2 because: 1st entry is on line 2
            const rawTitle = (unvalidRecord['Title'] as string) || "Unknown Title"
            try {
                const record = validateSchema(goodreadsRowSchema, unvalidRecord)
                const sourceId = record['Book Id']

                let enrichmentData: BookEnrichmentData | undefined
                // Only enrich if it's a NEW book (not in DB)
                if (sourceId && !existingSourceIds.has(sourceId.toString())) {
                    // Small delay to be nice to Google API if processing many
                    await new Promise(r => setTimeout(r, 100)) 

                    const data = await this.fetchEnrichmentData(userId, record)
                    if (data) enrichmentData = data
                }

                preparedItems.push({ isValid: true, record, enrichmentData })

            } catch (error: unknown) {
                let reason = "Invalid data format"

                if (error instanceof ZodError) {
                    const reason = error.issues 
                    ? error.issues.map((i) => i.message).join(", ") 
                    : error.message || "Invalid data format"

                    failures.push({
                        row: rowNum,
                        title: rawTitle,
                        reason: `Validation Error: ${reason}`
                    })
                } else if (error instanceof Error) {
                    reason = error.message
                }

                results.failures.push({
                    row: rowNum,
                    title: rawTitle,
                    reason: `Validation Error: ${reason}`
                })
            }
        }

        return prisma.$transaction(async (tx: PrismaClient) => {
            const systemUser = await findUserByUsername("system", tx)
            const bookType = await findMediaTypeForUserOrGlobal("book", userId, tx)

            if (!systemUser || !bookType) {
                throw new AppError("System user or book type missing", 500)
            }
            
            for (const item of preparedItems) {
                if (!item.isValid) continue
                try {
                    const { record, enrichmentData } = item

                    const title = record['Title']
                    const mainAuthor = record['Author']
                    const additionalAuthors = record['Additional Authors']
                    const year = record['Year Published'] ?? null
                    const sourceId = record['Book Id'] ?? null
                    const starRating = record['My Rating'] ?? 0
                    const exclusiveShelf = record['Exclusive Shelf'] || ""

                    //Combine authors
                    const author = additionalAuthors 
                        ? `${mainAuthor}, ${additionalAuthors}` 
                        : mainAuthor

                    // CONSTRUCT THE LINK
                    // Goodreads links follow this pattern: https://www.goodreads.com/book/show/12345
                    let constructedSourceUrl = ""
                    if (sourceId) {
                        constructedSourceUrl = `https://www.goodreads.com/book/show/${sourceId}`
                    }

                    // Map shelves to status, wishlist is default
                    let status = "wishlist"
                    if (exclusiveShelf === 'read') {
                        status = "completed"
                    } else if (exclusiveShelf === 'currently-reading') {
                        status = "in progress"
                    } else if (exclusiveShelf === 'to-read') {
                        status = "wishlist"
                    } else {
                        // FALLBACK: If Exclusive Shelf is somehow missing, check "Date Read"
                        if (record['Date Read']) {
                            status = "completed"
                        }
                    }
    
                    //Convert stars to 100
                    const rating100 = Math.round(starRating * 20)

                    // MERGE DATA: Use enrichment data if available
                    const finalMetadata = {
                        url: constructedSourceUrl,
                        ...(enrichmentData?.metadata || {})
                    }
    
                    const { logCreated } = await createImportedMedia(
                        {
                            userId,
                            mediaTypeName: "book",
                            mediaData: {
                                title,
                                creator: author,
                                year,
                                source: "goodreads",
                                sourceId,
                                metadata: finalMetadata,
                                description: enrichmentData?.description,
                                imageUrl: enrichmentData?.imageUrl,

                            },
                            logData: {
                                status,
                                rating: rating100,
                                notes: record['My Review'] || "",
                            },
                        },
                        tx
                    )
                        
                    if (logCreated) {
                        results.imported++
                    } else {
                        results.skipped++
                    }
                } catch (error: unknown) {
                    const reason = error instanceof Error ? error.message : "Unknown database error"

                    const title = item['Title']
                    console.error(`Failed to import book: ${title}`, error)
                    
                    results.failures.push({
                        row: -1, // We can't track original row index in preparedItems easily, but we have the title
                        title: title,
                        reason: `Save Error: ${reason}`
                    })
                }
            }

            return results
        }, { timeout: 30000 })

    }
}

export const goodreadsImportService = new GoodreadsImportService()