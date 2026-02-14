import { musicSearchService } from "@/services/search/lastFmSearchService.js"
import { openLibraryService } from "./openLibrarySearchService.js"

export class SearchService {
    async searchBooks(userId: number, q: string, page: number = 1) {
        // return googleBooksService.searchBooksGGBooks(userId, q, startIndex)
        return openLibraryService.searchBooksOpenLib(userId, q, page)
    }

    async searchTracks(userId: number, q: string, page: number = 1) {
        return musicSearchService.searchTracksLastFm(userId, q, page)
    }

    async searchAblums(userId: number, q: string, page: number = 1) {
        return musicSearchService.searchAlbumsLastFm(userId, q, page)
    }
}

export const searchService = new SearchService()
