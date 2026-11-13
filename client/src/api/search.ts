import type { GameResult, GameSearchFilters, MovieResult, AnimeKind, AnimeResult, AnimeSearchFilters, BookResult, BookSearchFilters, MusicResult } from "@/types/search";
import { apiFetch } from "./clientWrapper";

export function searchBooks(params: string, page: number = 1, filters: BookSearchFilters = {}): 
    Promise<{ results: BookResult[], nextStartIndex: number | null }> 
{
    const qs = new URLSearchParams({ q: params, page: String(page) })
    for (const [key, value] of Object.entries(filters)) {
        if (value === undefined || value === null || value === "") continue
        qs.set(key, String(value))
    }
    return apiFetch(`/search/books?${qs.toString()}`, {
        method: "GET"
    })
}

export function searchAlbums(params: string, page: number = 1): 
    Promise<{ results: MusicResult[], nextStartIndex: number | null }> 
{
    return apiFetch(`/search/music/albums?q=${encodeURIComponent(params)}&page=${page}`, {
        method: "GET"
    })
}

export function searchTracks(params: string, page: number = 1): 
    Promise<{ results: MusicResult[], nextStartIndex: number | null }> 
{
    return apiFetch(`/search/music/tracks?q=${encodeURIComponent(params)}&page=${page}`, {
        method: "GET"
    })
}

export function searchAnime(params: string, page: number = 1, filters: AnimeSearchFilters = {}, kind: AnimeKind = "anime"):
    Promise<{ results: AnimeResult[], nextStartIndex: number | null }>
{
    const qs = new URLSearchParams({ q: params, page: String(page) })
    for (const [key, value] of Object.entries(filters)) {
        if (value === undefined || value === null || value === "") continue
        qs.set(key, String(value))
    }
    return apiFetch(`/search/${kind}?${qs.toString()}`, {
        method: "GET"
    })
}

export function searchManga(params: string, page: number = 1, filters: AnimeSearchFilters = {}):
    Promise<{ results: AnimeResult[], nextStartIndex: number | null }>
{
    return searchAnime(params, page, filters, "manga")
}

export function searchMovies(params: string, page: number = 1, filters: { year?: number } = {}):
    Promise<{ results: MovieResult[], nextStartIndex: number | null }>
{
    const qs = new URLSearchParams({ q: params, page: String(page) })
    if (filters.year !== undefined) qs.set("year", String(filters.year))
    return apiFetch(`/search/movies?${qs.toString()}`, {
        method: "GET"
    })
}

export function searchGames(params: string, page: number = 1, filters: GameSearchFilters = {}):
    Promise<{ results: GameResult[], nextStartIndex: number | null }>
{
    const qs = new URLSearchParams({ q: params, page: String(page) })
    if (filters.platform) qs.set("platform", filters.platform)
    if (filters.sort && filters.sort !== "relevance") qs.set("sort", filters.sort)
    return apiFetch(`/search/games?${qs.toString()}`, {
        method: "GET"
    })
}
