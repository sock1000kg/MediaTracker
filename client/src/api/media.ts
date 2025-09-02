import { apiFetch } from "./clientWrapper"

import type { Media } from "@/types/media"

export async function fetchMedias(): Promise<Media[]> {
  return apiFetch("/media")
}