import { apiFetch } from "./clientWrapper"

import type { Media } from "@/types/media"

export function fetchMedias(): Promise<Media[]> {
  return apiFetch("/media")
}

export function createMedia(newMedia: Partial<Media>): Promise<Media> {
  return apiFetch("/media",  {
    method: "POST",
    body: JSON.stringify({
      title: newMedia.title,
      mediaType: newMedia.mediaType,
      creator: newMedia.creator,
      year: newMedia.year,
      metadata: newMedia.metadata
    })
  })
}

export function deleteMedia(media: Media, confirm: boolean): Promise<{ message: string }> {
  return apiFetch(`/media/${media.id}`,{
    method: "DELETE",
    body: JSON.stringify({ confirm })
  })
}
