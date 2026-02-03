import { ISearchService } from "@/services/search/searchServiceInterface.js"
import { SearchResult, searchResultsSchema } from "@/schemas/search/searchSchemas.js"
import { OpenLibraryBook, openLibraryResponseSchema } from "@/schemas/search/bookSchemas.js"
import { fetchAndParse, validateSchema } from "@/utilities.js"
import { AppError } from "@/api/domain/error.js"

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
                    categories: item.subject ? item.subject.slice(0, 3) : null,
                    publisher: item.publisher ? item.publisher[0] : null,
                    url: `https://openlibrary.org${item.key}`,
                    isbn: item.isbn ? item.isbn[0] : null
                }
            }
        })
    }

    async searchBooksOpenLib(userId: number, q: string, startIndex = 0): 
        Promise<{ results: SearchResult[], nextStartIndex: number | null}> 
    {
        // Convert 0-based 'startIndex' to 1-based 'page' number
        const page = Math.floor(startIndex / this.limit) + 1

        const url = new URL("https://openlibrary.org/search.json")
        url.searchParams.set("q", q) // 'q' searches title, author, and text
        url.searchParams.set("page", page.toString())
        url.searchParams.set("limit", this.limit.toString())

        const headers = {
            "User-Agent": "MediaTracker/0.1 (https://github.com/sock1000kg/MediaTracker)"
        }
        
        // console.log(url.toString())

        // Fields filtering (optional, but good for performance)
        url.searchParams.set("fields", "key,title,author_name,first_publish_year,cover_i,number_of_pages_median,publisher,subject")

        console.log(url.toString())

        const parsed = await fetchAndParse(
            url, 
            openLibraryResponseSchema, 
            "Open Library API error", 
            "Failed to fetch from Open Library",
            { headers }
        )

        const results = this.mapResults(parsed.docs)

        if (!results.length) {
            throw new AppError("No item found", 404)
        }

        // Calculate if there are more results
        // If the number of results returned matches the limit, there's likely a next page
        const nextStartIndex = results.length < this.limit 
            ? null 
            : startIndex + this.limit

        return { 
            results: validateSchema(searchResultsSchema, results), 
            nextStartIndex 
        }
    }
}

export const openLibraryService = new OpenLibraryService()