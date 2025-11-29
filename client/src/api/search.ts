import type { BookResult } from "@/types/search";
import { apiFetch } from "./clientWrapper";

export function searchBooks(params: string, startIndex: number = 0): 
    Promise<{ results: BookResult[], nextStartIndex: number | null }> 
{
    return apiFetch(`/search/books?q=${encodeURIComponent(params)}&startIndex=${startIndex}`, {
        method: "GET"
    })
}
