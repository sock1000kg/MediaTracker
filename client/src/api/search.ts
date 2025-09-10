import type { BookResult } from "@/types/searchResults";
import { apiFetch } from "./clientWrapper";
import type { Log, Media } from "@/types/main";

export function createMediaAndLog(mediaData: Partial<Media>, logData: Partial<Log>): Promise<Log>{
    return apiFetch(`/search/media-log`, {
        method: "PUT",
        body: JSON.stringify({
            mediaData,
            logData
        })
    })
}

export function searchBooks(params: string, startIndex: number = 0): Promise<BookResult[]> {
    return apiFetch(`/search/books?q=${encodeURIComponent(params)}&startIndex=${startIndex}}`, {
        method: "GET"
    })
}
