export type DialogName = "mediaForm" | "mediaTypeForm" | "logForm" | "deleteConfirm" | null //Dialogs in homepage tabs
export type Tab = "logs" | "medias" | "mediaTypes" | "search" //Tabs in homepage
export type EditableEntity = Log | Media | MediaType


// MAIN TYPES
export interface MediaType {
  id: number
  name: string
  created_at: string
  userId: number
}

type JsonPrimitive = string | number | boolean | null
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }
export interface MediaMetadata {
  [key: string]: JsonValue | undefined
}
export interface Media {
  id: number
  userId: number
  title: string
  mediaType: MediaType
  creator?: string | null
  year?: number | null
  source?: string | null
  sourceId: string | null
  sourceRating: number | null
  ratingsCount: number | null
  description: string | null
  metadata?: MediaMetadata
  imageUrl?: string | null
  created_at: string
}

export type LogStatus = "completed" | "in progress" | "wishlist"
export interface Log {
  id: number
  status: LogStatus
  rating: number
  notes: string
  logged_at: string
  media: Media
}

//MEDIA TYPES
export const Book: MediaType = {
  id: 1,
  name: "book",
  userId: 0,
  created_at: "1970-01-01T00:00:00.000Z" //placeholder
}