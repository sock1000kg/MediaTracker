import { musicSearchService } from "@/services/search/lastFmSearchService.js"
import { BookSearchFilters } from "@/schemas/search/bookSchemas.js"
import { AnimeSearchFilters } from "@/schemas/search/animeSchemas.js"
import { anilistSearchService } from "./anilistSearchService.js"
import { tmdbSearchService } from "./tmdbSearchService.js"
import { rawgSearchService } from "./rawgSearchService.js"
import { GameSearchFilters } from "@/schemas/search/gameSchemas.js"
import { openLibraryService } from "./openLibrarySearchService.js"
import { bggSearchService } from "./bggSearchService.js"

export class SearchService {
    async searchBooks(userId: string, q: string, page: number = 1, filters?: BookSearchFilters) {
        // return googleBooksService.searchBooksGGBooks(userId, q, startIndex)
        return openLibraryService.searchBooksOpenLib(userId, q, page, filters)
    }

    async searchTracks(userId: string, q: string, page: number = 1) {
        return musicSearchService.searchTracksLastFm(userId, q, page)
    }

    async searchAlbums(userId: string, q: string, page: number = 1) {
        return musicSearchService.searchAlbumsLastFm(userId, q, page)
    }

    async searchAblums(userId: string, q: string, page: number = 1) {
        return this.searchAlbums(userId, q, page)
    }

    async getAlbumTracks(userId: string, artist: string, album: string, mbid?: string, releaseGroupId?: string) {
        return musicSearchService.fetchAlbumTracks(userId, artist, album, mbid, releaseGroupId)
    }

    async searchAnime(_userId: string, q: string, page: number = 1, filters?: AnimeSearchFilters) {
        return anilistSearchService.search("anime", q, page, filters)
    }

    async searchManga(_userId: string, q: string, page: number = 1, filters?: AnimeSearchFilters) {
        return anilistSearchService.search("manga", q, page, filters)
    }

    async searchMovies(userId: string, q: string, page: number = 1, filters?: { year?: number }) {
        return tmdbSearchService.searchMoviesTmdb(userId, q, page, filters)
    }

    async searchTv(userId: string, q: string, page: number = 1, filters?: { year?: number }) {
        return tmdbSearchService.searchTvTmdb(userId, q, page, filters)
    }

    async getTvSeasons(userId: string, tmdbId: number) {
        return tmdbSearchService.fetchTvSeasons(userId, tmdbId)
    }

    async searchGames(userId: string, q: string, page: number = 1, filters?: GameSearchFilters) {
        return rawgSearchService.searchGamesRawg(userId, q, page, filters)
    }

    async searchBoardGames(userId: string, q: string, page: number = 1) {
        return bggSearchService.searchBoardGames(userId, q, page)
    }
}

export const searchService = new SearchService()
