import { musicSearchService } from "@/services/search/lastFmSearchService.js"
import { googleBooksService } from "./googleBooksSearchService.js"

export class SearchService {
    async searchBooks(userId: number, q: string, startIndex: number = 0) {
        return googleBooksService.searchBooksGGBooks(userId, q, startIndex)
    }

    async searchTracks(userId: number, q: string, page: number = 1) {
        return musicSearchService.searchTracksLastFm(userId, q)
    }

    async searchAblums(userId: number, q: string, page: number = 1) {
        return musicSearchService.searchAlbumsLastFm(userId, q)
    }
}

export const searchService = new SearchService()
