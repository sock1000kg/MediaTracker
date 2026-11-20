import type { MediaResult } from "@/types/search"
import { apiFetch } from "./clientWrapper"

import type { EntryInput, Log, Media } from "@/types/mainTypes"

export function fetchMedias(): Promise<Media[]> {
  return apiFetch("/media")
}

export function createMedia(newMedia: Partial<Media>): Promise<Media> {
  return apiFetch("/media",  {
    method: "POST",
    body: JSON.stringify({
      title: newMedia.title,
      mediaType: { 
        id: newMedia.mediaType?.id,
        name: newMedia.mediaType?.name,
        created_at: newMedia.mediaType?.created_at
      },
      creator: newMedia.creator,
      year: newMedia.year,
      provider: newMedia.provider, 
      providerId: newMedia.providerId, 
      description: newMedia.description, 
      imageUrl: newMedia.imageUrl,
      details: newMedia.details,
      subtype: newMedia.subtype,
      releaseDate: newMedia.releaseDate,
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
      provider: media.provider, 
      providerId: media.providerId, 
      description: media.description, 
      imageUrl: media.imageUrl,
      details: media.details,
      subtype: media.subtype,
      releaseDate: media.releaseDate,
    })
  })
}

export interface MediaLogResult {
    media: Media
    log: Log
    logCreated: boolean
    entryCreated: boolean
}

export function createMediaAndLog(mediaData: MediaResult, logData: Partial<Log>, parent?: MediaResult, entry?: EntryInput | null): Promise<MediaLogResult>{
    const tags = logData.tags !== undefined ? logData.tags.map((t) => t.name) : undefined
    return apiFetch(`/media/media-log`, {
        method: "PUT",
        body: JSON.stringify({
            mediaData,
            logData: {
                ...(logData.status !== undefined ? { status: logData.status } : {}),
                ...(logData.rating !== undefined ? { rating: logData.rating } : {}),
                ...(logData.notes !== undefined ? { notes: logData.notes } : {}),
                ...(tags !== undefined ? { tags } : {}),
            },
            ...(entry ? { entry } : {}),
            ...(parent ? { parent } : {})
        })
    })
}

export function getMediaChildren(mediaId: string): Promise<Array<Media & { log: Log | null }>> {
    return apiFetch(`/media/${mediaId}/children`, {
        method: "GET"
    })
}

export function refreshMedia(id: string): Promise<Media> {
    return apiFetch(`/media/${id}/refresh`, {
        method: "POST"
    })
}