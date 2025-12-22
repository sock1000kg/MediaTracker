import { SearchResult } from "@/schemas/search/searchSchemas.js"

export interface ISearchService {
    getUserApiKey(userId: number): Promise<string | undefined>
    mapResults(items: unknown[]): SearchResult[]

    // Search functions return Promise<{ results: SearchResult[], nextStartIndex: number | null}>
}
