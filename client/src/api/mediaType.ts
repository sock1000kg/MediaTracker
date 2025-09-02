import { apiFetch } from "./clientWrapper"

import type { MediaType } from "@/types/media"


export function fetchMediaTypes(): Promise<MediaType[]> {
  return apiFetch("/media-type")
}


export function createMediaType(mediaType: Partial<MediaType>): Promise<MediaType> {
  return apiFetch("/media-type", {
    method: "POST",
    body: JSON.stringify({ name: mediaType.name }),
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