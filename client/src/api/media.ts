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

export function editMedia(media: Partial<Media>): Promise<Media> {
  return apiFetch(`/media/${media.id}`, {
    method: "PUT",
    body: JSON.stringify({
      title: media.title,
      mediaType: media.mediaType,
      creator: media.creator,
      year: media.year,
      metadata: media.metadata
    })
  })
}
