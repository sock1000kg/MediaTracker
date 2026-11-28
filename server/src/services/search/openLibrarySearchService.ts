import { ISearchService } from "@/services/search/searchServiceInterface.js"
import { SearchResult, searchResultsSchema } from "@/schemas/search/searchSchemas.js"
import { BookSearchFilters, OpenLibraryBook, openLibraryResponseSchema } from "@/schemas/search/bookSchemas.js"
import { validateSchema } from "@/utilities.js"
import { AppError } from "@/api/domain/error.js"
import { isJunkGenre, JUNK_BOOK_SUBJECTS } from "@/services/genreService.js"
import { providerFetch } from "@/providers/providerFetch.js"
import { getProviderEntry } from "@/providers/registry.js"

// Re-export for compatibility
export { JUNK_BOOK_SUBJECTS }
export const JUNK_SUBJECTS = JUNK_BOOK_SUBJECTS

export function isJunkSubject(subject: string): boolean {
    return isJunkGenre(subject, "book")
}

// Goodreads appends the series: "Empire of the Sun (Empire of the Sun, #1)"
const withoutSeries = (title: string) => title.replace(/\s*\([^()]*#[\d.]+\)\s*$/, "")

// "The Myth of Sisyphus, and Other Essays" and "The myth of Sisyphus and other essays" compare equal;
// a subtitle after ":" is ignored, and so is a leading article.
export function mainTitle(title: string): string {
    return withoutSeries(title)
        .split(":")[0]
        .normalize("NFKD").replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim()
        .replace(/^(the|a|an) /, "")
}

// Open Library language codes (MARC) for the common cases; anything else shows as its code
const LANGUAGE_NAMES: Record<string, string> = {
    eng: "English", fre: "French", fra: "French", ger: "German", deu: "German", spa: "Spanish",
    ita: "Italian", por: "Portuguese", rus: "Russian", jpn: "Japanese", chi: "Chinese", zho: "Chinese",
    kor: "Korean", dut: "Dutch", nld: "Dutch", swe: "Swedish", pol: "Polish", lat: "Latin", ara: "Arabic",
    heb: "Hebrew", tur: "Turkish", gre: "Greek", ell: "Greek", hin: "Hindi", vie: "Vietnamese",
}

/** "/languages/eng" or "eng" → "English" */
export function languageName(code: string): string {
    const bare = code.replace(/^\/languages\//, "").trim().toLowerCase()
    return LANGUAGE_NAMES[bare] ?? bare
}

// The edition Open Library matched the query to (it lists the best match first)
function matchedEdition(item: OpenLibraryBook): { title?: string; language?: string } | null {
    const docs = (item.editions as { docs?: { title?: string; language?: string[] }[] } | undefined)?.docs
    const first = docs?.[0]
    if (!first) return null
    const title = typeof first.title === "string" && first.title.trim() !== "" ? first.title.trim() : undefined
    const code = Array.isArray(first.language) ? first.language.find(l => typeof l === "string") : undefined
    const language = code ? languageName(code) : undefined
    return title || language ? { ...(title ? { title } : {}), ...(language ? { language } : {}) } : null
}

export class OpenLibraryService implements ISearchService {
    // Open Library uses 'limit' for page size
    limit = 20

    // Open Library is an open API, no user key needed
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async getUserApiKey(userId: string): Promise<string | undefined> {
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
            const creators = item.author_name?.length
                ? item.author_name.map(name => ({ name, role: "author" }))
                : undefined

            return {
                mediaType: "book",
                title: item.title,
                creator: item.author_name ? item.author_name.join(", ") : null,
                creators,
                year: item.first_publish_year ? item.first_publish_year.toString() : null,
                description: null, // Open Library Search API rarely returns descriptions in the list view
                imageUrl: imageUrl,
                source: "openlibrary",
                // The 'key' usually comes as "/works/OL123W", we can keep it as is or strip "/works/"
                sourceId: item.key, 
                genres: categories.length ? categories : undefined,
                details: {
                    pageCount: typeof item.number_of_pages_median === "number" && item.number_of_pages_median > 0
                        ? item.number_of_pages_median
                        : undefined,
                    publisher: item.publisher && item.publisher[0] ? item.publisher[0] : undefined,
                },
                ...(matchedEdition(item) ? { edition: matchedEdition(item) } : {}),
                ...(item.isbn && item.isbn[0] ? { externalIds: [{ provider: "isbn", id: item.isbn[0] }] } : {}),
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
        url.searchParams.set("fields", "key,title,author_name,first_publish_year,cover_i,number_of_pages_median,publisher,subject,isbn,editions,editions.title,editions.language")
        return url
    }

    async searchBooksOpenLib(userId: string, q: string, page = 1, filters?: BookSearchFilters):
        Promise<{ results: SearchResult[], nextStartIndex: number | null}>
    {
        const url = this.buildSearchUrl(q, page, filters)

        let raw: unknown
        try {
            const res = await providerFetch("openlibrary", url)
            raw = await res.json()
        } catch {
            throw new AppError("Failed to fetch from Open Library", 503)
        }

        const parsed = validateSchema(openLibraryResponseSchema, raw)
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

    async findByIsbns(isbns: string[]): Promise<Map<string, OpenLibraryBook>> {
        const result = new Map<string, OpenLibraryBook>()
        if (isbns.length === 0) return result

        const batchSize = getProviderEntry("openlibrary").batchSize ?? 50
        for (let i = 0; i < isbns.length; i += batchSize) {
            const batch = isbns.slice(i, i + batchSize)
            const u = new URL("https://openlibrary.org/search.json")
            u.searchParams.set("q", `isbn:(${batch.join(" OR ")})`)
            u.searchParams.set("fields", "key,isbn,title,author_name,cover_i,number_of_pages_median,publisher,subject,first_publish_year")
            u.searchParams.set("limit", String(Math.max(batch.length * 2, 50)))

            const res = await providerFetch("openlibrary", u)
            const raw = await res.json()
            const checked = openLibraryResponseSchema.safeParse(raw)
            if (checked.success && checked.data.docs) {
                for (const doc of checked.data.docs) {
                    if (Array.isArray(doc.isbn)) {
                        for (const isb of doc.isbn) {
                            const cleaned = isb.replace(/[^0-9X]/gi, "")
                            if (cleaned) result.set(cleaned, doc)
                        }
                    }
                }
            }
        }
        return result
    }

    // Classics are filed under their original title ("Der Proceß", "La Peste"), so a title= search
    // for "The Trial" misses the real work. q= also matches edition titles, and OL returns the
    // best-matching edition, which we use to check the hit really is this book.
    // Only the first author is sent: Goodreads lists translators too, and OL matches no one then.
    async findByTitleAuthor(title: string, author?: string | null): Promise<OpenLibraryBook | null> {
        const firstAuthor = author?.split(",")[0]?.trim() || null
        const found = await this.searchTitleAuthor(title, firstAuthor)
        if (found || !firstAuthor) return found
        // OL spells initials both ways ("J.R.R. Tolkien", "J. G. Ballard") and its author filter
        // doesn't always bridge them, so retry once with spaced initials when there was a miss.
        const spaced = firstAuthor.replace(/\.(?=\p{L})/gu, ". ")
        return spaced === firstAuthor ? null : this.searchTitleAuthor(title, spaced)
    }

    private async searchTitleAuthor(title: string, author: string | null): Promise<OpenLibraryBook | null> {
        const u = new URL("https://openlibrary.org/search.json")
        u.searchParams.set("q", withoutSeries(title))
        if (author) u.searchParams.set("author", author)
        u.searchParams.set("fields", "key,isbn,title,author_name,cover_i,number_of_pages_median,publisher,subject,first_publish_year,editions,editions.title")
        u.searchParams.set("limit", "5")

        const res = await providerFetch("openlibrary", u)
        const raw = await res.json()
        const checked = openLibraryResponseSchema.safeParse(raw)
        if (!checked.success) return null

        const wanted = mainTitle(title)
        return checked.data.docs.find(doc => {
            const editionTitles = (doc.editions as { docs?: { title?: string }[] } | undefined)?.docs?.map(e => e.title) ?? []
            return [doc.title, ...editionTitles].some(t => t != null && mainTitle(t) === wanted)
        }) ?? null
    }

    // The search doc of one work, by its work key. null when Open Library no longer has it.
    // Throws the standard AppError 503 when Open Library is unavailable.
    async findDocByWorkKey(key: string, fields?: string): Promise<OpenLibraryBook | null> {
        const keyQuery = key.startsWith("/works/") ? key : `/works/${key}`
        const u = new URL("https://openlibrary.org/search.json")
        u.searchParams.set("q", `key:"${keyQuery.replace(/["\\]/g, "\\$&")}"`)
        if (fields) u.searchParams.set("fields", fields)
        const res = await providerFetch("openlibrary", u, { allow404: true })
        if (res.status === 404) return null
        const checked = openLibraryResponseSchema.safeParse(await res.json().catch(() => null))
        if (!checked.success || checked.data.docs.length === 0) return null
        return checked.data.docs[0]
    }

    // The search doc of one edition by ISBN. null when Open Library has none.
    async findDocByIsbn(isbn: string, fields?: string): Promise<OpenLibraryBook | null> {
        const u = new URL("https://openlibrary.org/search.json")
        u.searchParams.set("q", `isbn:${isbn}`)
        if (fields) u.searchParams.set("fields", fields)
        u.searchParams.set("limit", "1")
        const res = await providerFetch("openlibrary", u, { allow404: true })
        if (res.status === 404) return null
        const checked = openLibraryResponseSchema.safeParse(await res.json().catch(() => null))
        if (!checked.success || checked.data.docs.length === 0) return null
        return checked.data.docs[0]
    }

    async getWork(key: string): Promise<unknown | null> {
        const cleanKey = key.startsWith("/works/") ? key.slice("/works/".length) : (key.startsWith("/") ? key.slice(1) : key)
        const u = new URL(`https://openlibrary.org/works/${cleanKey}.json`)
        try {
            const res = await providerFetch("openlibrary", u, { allow404: true })
            if (res.status === 404) return null
            return await res.json()
        } catch {
            return null
        }
    }
}

export const openLibraryService = new OpenLibraryService()