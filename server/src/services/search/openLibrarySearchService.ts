import { ISearchService } from "@/services/search/searchServiceInterface.js"
import { SearchResult, searchResultsSchema } from "@/schemas/search/searchSchemas.js"
import { BookSearchFilters, OpenLibraryBook, openLibraryResponseSchema } from "@/schemas/search/bookSchemas.js"
import { createUserAgentHeader, fetchAndParse, validateSchema } from "@/utilities.js"
import { AppError } from "@/api/domain/error.js"

// Subjects that are machine-generated or Open Library bookkeeping flags, not real genres
export const JUNK_SUBJECTS = [
    "accessible book",
    "protected daisy",
    "in library",
    "lending library",
    "large type books",
    "overdrive",
    "internet archive wishlist",
    "open library staff picks",
]

export function isJunkSubject(subject: string): boolean {
    const s = subject.trim().toLowerCase()
    // machine tags like "nyt:combined-print-and-e-book-fiction=2022-07-24"
    if (s.includes("=") || /:\S/.test(s)) return true
    return JUNK_SUBJECTS.includes(s)
}

export class OpenLibraryService implements ISearchService {
    // Open Library uses 'limit' for page size
    limit = 20

    // Open Library is an open API, no user key needed
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async getUserApiKey(userId: number): Promise<string | undefined> {
        return undefined 
    }

    mapResults(items: OpenLibraryBook[]): SearchResult[] {
        return items.map(item => {
            // Construct cover URL if cover_i exists
            // Size 'M' is medium. Options: S, M, L
            const imageUrl = item.cover_i 
                ? `https://covers.openlibrary.org/b/id/${item.cover_i}-M.jpg` 
                : null

            const categories = (item.subject ?? []).filter(s => !isJunkSubject(s)).slice(0, 3)

            return {
                title: item.title,
                creator: item.author_name ? item.author_name.join(", ") : null,
                year: item.first_publish_year ? item.first_publish_year.toString() : null,
                description: null, // Open Library Search API rarely returns descriptions in the list view
                imageUrl: imageUrl,
                source: "open_library",
                // The 'key' usually comes as "/works/OL123W", we can keep it as is or strip "/works/"
                sourceId: item.key, 
                metadata: {
                    pageCount: item.number_of_pages_median ?? null,
                    categories: categories.length ? categories : null,
                    publisher: item.publisher ? item.publisher[0] : null,
                    url: `https://openlibrary.org${item.key}`,
                    isbn: item.isbn ? item.isbn[0] : null
                }
            }
        })
    }

    buildSearchUrl(q: string, page = 1, filters: BookSearchFilters = { sort: "relevance" }): URL {
        const url = new URL("https://openlibrary.org/search.json")

        let query = q // 'q' searches title, author, and text
        if (filters.yearFrom !== undefined || filters.yearTo !== undefined) {
            query += ` first_publish_year:[${filters.yearFrom ?? "*"} TO ${filters.yearTo ?? "*"}]`
        }
        url.searchParams.set("q", query)
        if (filters.author) url.searchParams.set("author", filters.author)
        if (filters.subject) url.searchParams.set("subject", filters.subject)
        if (filters.language) url.searchParams.set("language", filters.language)
        if (filters.sort && filters.sort !== "relevance") url.searchParams.set("sort", filters.sort)

        url.searchParams.set("page", page.toString())
        url.searchParams.set("limit", this.limit.toString())
        // Fields filtering (optional, but good for performance)
        url.searchParams.set("fields", "key,title,author_name,first_publish_year,cover_i,number_of_pages_median,publisher,subject,isbn")
        return url
    }

    async searchBooksOpenLib(userId: number, q: string, page = 1, filters?: BookSearchFilters):
        Promise<{ results: SearchResult[], nextStartIndex: number | null}>
    {
        const url = this.buildSearchUrl(q, page, filters)

        const headers = createUserAgentHeader()

        const parsed = await fetchAndParse(
            url, 
            openLibraryResponseSchema, 
            "Open Library API error", 
            "Failed to fetch from Open Library",
            headers 
        )

        const results = this.mapResults(parsed.docs)

        if (!results.length) {
            throw new AppError("No item found", 404)
        }

        // Calculate if there are more results
        // If the number of results returned matches the limit, there's likely a next page
        const nextStartIndex = results.length < this.limit ? null : page + 1

        return { 
            results: validateSchema(searchResultsSchema, results), 
            nextStartIndex 
        }
    }
}

export const openLibraryService = new OpenLibraryService()