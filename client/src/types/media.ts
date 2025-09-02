export type DialogName = "mediaTypeForm" | "logForm" | "mediaForm" | "editForm" | "deleteConfirm" | null //Dialogs in homepage tabs
export type Tab = "logs" | "medias" | "mediaTypes" //Tabs in homepage
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
  description?: string
  pages?: number
}
export interface Media {
  id: number
  userId: number
  title: string
  mediaType: MediaType
  creator?: string | null
  year?: number | null
  metadata?: MediaMetadata
  created_at: string
}

export interface Log {
  id: number
  status: string
  rating: number
  notes: string
  logged_at: string
  media: Media
}