import {
    googleBooksResponseSchema,
    SearchResult,
    searchResultsSchema
} from "@/schemas/searchSchemas.js"

import { decryptKey, validateSchema } from "@/utilities.js"
import { findUserById } from "@/repositories/authRepository.js"

export class SearchService {
    async searchBooks(userId: number, q: string, startIndex: number = 0) {
        const user = await findUserById(userId)

        // decrypt API keys
        const decryptedApiKeys = user?.apiKeys.map(key => ({
            ...key,
            key: decryptKey(key.key)
        }))

        const key = decryptedApiKeys?.find(k => k.service === "google_books")?.key

        // build Google Books URL
        const url = new URL("https://www.googleapis.com/books/v1/volumes")
        url.searchParams.set("q", q)
        url.searchParams.set("startIndex", startIndex.toString())
        url.searchParams.set("maxResults", "15")

        if (key) url.searchParams.set("key", key)

        const response = await fetch(url.toString())
        if (!response.ok) {
            const errorBody = await response.json().catch(() => null)
            throw Object.assign(new Error("Google Books API error"), {
                status: response.status,
                message: errorBody?.error?.message ?? "Invalid or unauthorized API key"
            })
        }

        // Validate Google Books response
        const raw = await response.json()
        const parsed = validateSchema(googleBooksResponseSchema, raw)

        // Map -> SearchResult[]
        const rawResults: SearchResult[] =
            parsed.items?.map(item => {
                const v = item.volumeInfo
                return {
                    title: v.title,
                    creator: v.authors ? v.authors.join() : null,
                    year: v.publishedDate ? v.publishedDate.split("-")[0] : null,
                    description: v.description ?? null,
                    imageUrl: v.imageLinks ? v.imageLinks.thumbnail : null,
                    source: "google_books",
                    sourceId: item.id,
                    metadata: {
                        pageCount: v.pageCount,
                        categories: v.categories,
                        publisher: v.publisher,
                    }
                }
            }) ?? []

        if (!rawResults.length) {
            throw Object.assign(new Error("No item found"), { status: 404 })
        }

        // Validate results array to match search schema
        return validateSchema(searchResultsSchema, rawResults)
    }
}

export const searchService = new SearchService()
