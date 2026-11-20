import { apiFetch } from "./clientWrapper"

export interface PublicLimits {
  notes: {
    maxLength: number
  }
  logs: {
    maxEntriesPerLog: number
    entryNoteMaxLength: number
    entryNameMaxLength: number
  }
  tags: {
    maxLength: number
    maxPerLog: number
    maxPerUser: number
  }
  collections: {
    nameMaxLength: number
    descMaxLength: number
    maxPerUser: number
    maxItemsPerCollection: number
  }
  imports: {
    maxFileBytes: number
  }
  search: {
    queryMaxLength: number
  }
}

export interface PublicConfig {
  limits: PublicLimits
  demo: {
    username: string
    password: string
  } | null
}

export async function fetchConfig(): Promise<PublicConfig> {
  return apiFetch<PublicConfig>("/config", { auth: false })
}
