// services/search/googleBooksService.ts
import { ISearchService } from "@/services/search/searchServiceInterface.js"
import { SearchResult, searchResultsSchema } from "@/schemas/search/searchSchemas.js"
import { googleBooksResponseSchema } from "@/schemas/search/bookSchemas.js"
import { decryptKey, fetchAndParse, validateSchema } from "@/utilities.js"
import { findUserById } from "@/repositories/authRepository.js"
import { AppError } from "@/types/error.js"

export class GoogleBooksService implements ISearchService {
    maxResults = 20

    async getUserApiKey(userId: number): Promise<string | undefined> {
        const user = await findUserById(userId)
        if (!user) throw new AppError("Non-existent userId", 404)

        const decrypted = user.apiKeys.map(k => ({ ...k, key: decryptKey(k.key) }))
        return decrypted.find(k => k.service === "google_books")?.key
    }

    mapResults(items: any[]): SearchResult[] {
        return items.map(item => {
            const v = item.volumeInfo
            return {
                title: v.title,
                creator: v.authors ? v.authors.join(", ") : null,
                year: v.publishedDate ? v.publishedDate.split("-")[0] : null,
                description: v.description ?? null,
                imageUrl: v.imageLinks?.thumbnail ?? null,
                source: "google_books",
                sourceId: item.id,
                metadata: {
                    pageCount: v.pageCount,
                    categories: v.categories,
                    publisher: v.publisher,
                    url: v.infoLink
                }
            }
        })
    }

    async searchBooksGGBooks(userId: number, q: string, startIndex = 0): 
        Promise<{ results: SearchResult[], nextStartIndex: number | null}> 
    {
        const key = await this.getUserApiKey(userId)

        const url = new URL("https://www.googleapis.com/books/v1/volumes")
        url.searchParams.set("q", q)
        url.searchParams.set("startIndex", startIndex.toString())
        url.searchParams.set("maxResults", this.maxResults.toString())
        if (key) url.searchParams.set("key", key)

        const parsed = await fetchAndParse(url, googleBooksResponseSchema, "Google Books API error", "Failed to fetch from Google Books")
        console.log("PARSED: ", parsed)

        const results = this.mapResults(parsed.items ?? [])
        if (!results.length) {
            throw new AppError("No item found", 404)
        }

        const nextStartIndex = results.length < this.maxResults ? null : startIndex + this.maxResults

        return { 
            results: validateSchema(searchResultsSchema, results), 
            nextStartIndex 
        }
    }
}

export const googleBooksService = new GoogleBooksService()
