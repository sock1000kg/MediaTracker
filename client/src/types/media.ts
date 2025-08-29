export type DialogName = "mediaTypeForm" | "logForm" | "mediaForm" | null

export interface MediaType {
  id: number
  name: string
}

type JsonPrimitive = string | number | boolean | null
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }
export interface MediaMetadata {
  [key: string]: JsonValue | undefined
  description?: string
  pages?: number
}
export interface Media {
  id: number
  title: string
  mediaType: MediaType
  creator?: string | null
  year?: number | null
  metadata?: MediaMetadata
}

export interface Log {
  id: number
  status: string
  rating: number
  notes: string
  logged_at: string
  media: Media
}