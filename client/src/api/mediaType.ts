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