import prisma from "@/prismaClient.js"
import { findUserByUsername } from "@/repositories/authRepository.js"
import { findMediaTypeForUserOrGlobal } from "@/repositories/mediaTypeRepository.js"
import { GoodReadsRow, goodreadsRowSchema } from "@/schemas/imports/goodReadsSchemas.js"
import { AppError } from "@/types/error.js"
import { validateSchema } from "@/utilities.js"
import { PrismaClient } from "@prisma/client/extension"
import { parse } from "csv-parse/sync"
import { googleBooksService } from "../search/googleBooksSearchService.js"
import { createImportedMedia } from "@/api/domain/media/mediaFactory.js"

//Helper for fetching rich data
type GoogleBookMetadata = {
    pageCount?: number | null
    categories?: string[] | null
    publisher?: string | null
}

//Helpers for preparing rich or unrich data
type BookEnrichmentData = {
    description: string | null
    imageUrl: string | null
    metadata: GoogleBookMetadata
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

            const meta = book.metadata as GoogleBookMetadata

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

    async importFromGoodReads(userId: number, fileBuffer: Buffer) {
        const rawRecords = parse(fileBuffer, {
            columns: true, //use the headers as fields for JSON, if false it parses data into arrays
            skip_empty_lines: true,
            trim: true,
            cast: true,
            bom: true //handle weird Excel csv apparently, just for safety
        }) as Record<string, unknown>[]
        const results = { imported: 0, skipped: 0, errors: 0 }
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
        for (const unvalidRecord of rawRecords) {
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
                if (error instanceof Error) {
                    console.error(`Validation failed for row`, unvalidRecord, error)
                } else {
                    console.error(`Unexpected error during import`, error)
                }
                results.errors++
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
                    const sourceId = record['Book Id'] || null
                    const starRating = record['My Rating'] || 0
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
                } catch (error) {
                    const rawTitle = item['Title']
                    const title = typeof rawTitle === 'string' ? rawTitle : "Unknown Title"
                    console.error(`Failed to import book: ${title}`, error)
                    results.errors++
                }
            }

            return results
        }, { timeout: 30000 })

    }
}

export const goodreadsImportService = new GoodreadsImportService()