import type { MediaResult } from "@/types/search"
import { apiFetch } from "./clientWrapper"

import type { Log, Media } from "@/types/mainTypes"

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
      description: newMedia.description, 
      imageUrl: newMedia.imageUrl,
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
      description: media.description, 
      imageUrl: media.imageUrl,
      metadata: media.metadata
    })
  })
}

export function createMediaAndLog(mediaData: MediaResult, logData: Partial<Log>): Promise<Log>{
    return apiFetch(`/media/media-log`, {
        method: "PUT",
        body: JSON.stringify({
            mediaData,
            logData
        })
    })
}