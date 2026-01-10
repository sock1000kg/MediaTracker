import type { ImportResult } from "@/types/imports";
import { apiFetch } from "./clientWrapper";

export function importGoodReads(file: File): Promise<ImportResult> {
    const formData = new FormData()
    formData.append('file', file) // Must match the backend field name ("file")
    return apiFetch('/imports/goodreads', {
        method: 'POST',
        body: formData
    })
}