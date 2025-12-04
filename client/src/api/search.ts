import type { BookResult, MusicResult } from "@/types/search";
import { apiFetch } from "./clientWrapper";

export function searchBooks(params: string, startIndex: number = 0): 
    Promise<{ results: BookResult[], nextStartIndex: number | null }> 
{
    return apiFetch(`/search/books?q=${encodeURIComponent(params)}&startIndex=${startIndex}`, {
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