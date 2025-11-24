import type { BookResult } from "@/types/searchResults";
import { apiFetch } from "./clientWrapper";

export function searchBooks(params: string, startIndex: number = 0): Promise<BookResult[]> {
    return apiFetch(`/search/books?q=${encodeURIComponent(params)}&startIndex=${startIndex}}`, {
        method: "GET"
    })
}
