import { apiFetch } from "./clientWrapper"

import type { Media } from "@/types/main"

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
      source: newMedia.source, 
      sourceId: newMedia.sourceId, 
      sourceRating: newMedia.sourceRating,
      ratingsCount: newMedia.ratingsCount, 
      description: newMedia.description, 
      metadata: newMedia.metadata
    })
  })
}

export function deleteMedia(media: Media): Promise<{ message: string }> {
  return apiFetch(`/media/${media.id}`,{
    method: "DELETE",
    body: JSON.stringify({ confirm: true })
  })
}
export function deleteWarningMedia(media: Media): Promise<{ message: string }> {
  return apiFetch(`/media/${media.id}`,{
    method: "DELETE",
    body: JSON.stringify({ confirm: false })
  })
}

//Partial cus it's using the same form as creating
export function editMedia(media: Partial<Media>): Promise<Media> {
  return apiFetch(`/media/${media.id}`, {
    method: "PUT",
    body: JSON.stringify({
      title: media.title,
      mediaType: media.mediaType,
      creator: media.creator,
      year: media.year,
      source: media.source, 
      sourceId: media.sourceId, 
      sourceRating: media.sourceRating,
      ratingsCount: media.ratingsCount, 
      description: media.description, 
      metadata: media.metadata
    })
  })
}
