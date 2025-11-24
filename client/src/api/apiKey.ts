import type { ApiKey } from "@/types/mainTypes";
import { apiFetch } from "./clientWrapper"

export function getApiKeys(): Promise<ApiKey[]> {
    return apiFetch(`/api-key`)
}

export function addApiKey(apiKey: ApiKey): Promise<ApiKey> {
    return apiFetch(`/api-key`, {
        method: "POST",
        body: JSON.stringify({
            key: apiKey.key,
            service: apiKey.service
        })
    })
}

export function updateApiKey(apiKey: ApiKey): Promise<ApiKey> {
    return apiFetch(`/api-key`, {
        method: "PUT",
        body: JSON.stringify({
            key: apiKey.key,
            service: apiKey.service
        })
    })
}

export function deleteApiKey(apiKey: ApiKey): Promise<{ message: string }> {
    return apiFetch(`/api-key`, {
        method: "DELETE",
        body: JSON.stringify({
            service: apiKey.service
        })
    })
}