import { apiFetch } from "./clientWrapper"

import type { MediaType } from "@/types/media"


export async function fetchMediaTypes(): Promise<MediaType[]> {
  return apiFetch("/media-type")
}


export function createMediaType(name: string): Promise<MediaType> {
  return apiFetch("/media-type", {
    method: "POST",
    body: JSON.stringify({ name }),
  })
}

export function deleteMediaType(mediaType: MediaType, confirm: boolean): Promise<{ message: string }> {
  return apiFetch(`/media-type/${encodeURIComponent(mediaType.name)}`, {
    method: "DELETE",
    body: JSON.stringify({ confirm })
  })
}

export function editMediaType(mediaType: MediaType, newMediaType: MediaType): Promise<MediaType> {
  return apiFetch(`/media-type/${mediaType.name}`, {
    method: "PUT",
    body: JSON.stringify({ newName: newMediaType.name })
  })
}