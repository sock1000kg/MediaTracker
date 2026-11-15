import { musicSearchService } from "@/services/search/lastFmSearchService.js"
import { BookSearchFilters } from "@/schemas/search/bookSchemas.js"
import { AnimeSearchFilters } from "@/schemas/search/animeSchemas.js"
import { anilistSearchService } from "./anilistSearchService.js"
import { tmdbSearchService } from "./tmdbSearchService.js"
import { rawgSearchService } from "./rawgSearchService.js"
import { GameSearchFilters } from "@/schemas/search/gameSchemas.js"
import { openLibraryService } from "./openLibrarySearchService.js"

export class SearchService {
    async searchBooks(userId: number, q: string, page: number = 1, filters?: BookSearchFilters) {
        // return googleBooksService.searchBooksGGBooks(userId, q, startIndex)
        return openLibraryService.searchBooksOpenLib(userId, q, page, filters)
    }

    async searchTracks(userId: number, q: string, page: number = 1) {
        return musicSearchService.searchTracksLastFm(userId, q, page)
    }

    async searchAblums(userId: number, q: string, page: number = 1) {
        return musicSearchService.searchAlbumsLastFm(userId, q, page)
    }

    async getAlbumTracks(userId: number, artist: string, album: string, mbid?: string) {
        return musicSearchService.fetchAlbumTracks(userId, artist, album, mbid)
    }

    async searchAnime(_userId: number, q: string, page: number = 1, filters?: AnimeSearchFilters) {
        return anilistSearchService.search("anime", q, page, filters)
    }

    async searchManga(_userId: number, q: string, page: number = 1, filters?: AnimeSearchFilters) {
        return anilistSearchService.search("manga", q, page, filters)
    }

    async searchMovies(userId: number, q: string, page: number = 1, filters?: { year?: number }) {
        return tmdbSearchService.searchMoviesTmdb(userId, q, page, filters)
    }

    async searchTv(userId: number, q: string, page: number = 1, filters?: { year?: number }) {
        return tmdbSearchService.searchTvTmdb(userId, q, page, filters)
    }

    async getTvSeasons(userId: number, tmdbId: number) {
        return tmdbSearchService.fetchTvSeasons(userId, tmdbId)
    }

    async searchGames(userId: number, q: string, page: number = 1, filters?: GameSearchFilters) {
        return rawgSearchService.searchGamesRawg(userId, q, page, filters)
    }
}

export const searchService = new SearchService()
