export type DialogName = "mediaForm" | "mediaTypeForm" | "logForm" | "deleteConfirm" | null //Dialogs in homepage tabs
export type EditableEntity = Log | Media | MediaType

export const allowedSources = ["google_books", "lastfm", "tmdb", "rawg", "bgg"] as const
export type AllowedSource = (typeof allowedSources)[number]


// MAIN TYPES
type JsonPrimitive = string | number | boolean | null
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }
export interface MediaMetadata {
  [key: string]: JsonValue | undefined
}
export interface ChildSummary {
  rated: number
  avgRating: number | null
}

export interface MediaCreatorItem {
  name: string
  role: string
}

export interface Media {
  id: string
  userId: string
  title: string
  mediaType: MediaType
  creator?: string | null
  year?: number | null
  source?: string | null
  sourceId: string | null
  description: string | null
  metadata?: MediaMetadata
  imageUrl?: string | null
  created_at: string
  parentId?: string | null
  position?: number | null
  kind?: string | null
  originalTitle?: string | null
  genres?: string[]
  creators?: MediaCreatorItem[]
  externalIds?: Array<{ provider: string; externalId: string }>
  parent?: {
    id: string
    title: string
    creator?: string | null
  } | null
  childSummary?: ChildSummary
}

export interface TagItem {
  id: string
  name: string
}

export interface TagWithCount {
  id: string
  name: string
  count: number
}

export type Tag = TagWithCount

export type LogStatus = "completed" | "in progress" | "wishlist" | "dropped"
export interface Log {
  id: string
  status: LogStatus
  rating: number | null
  notes: string
  started_at?: string | null
  finished_at?: string | null
  logged_at: string
  progress?: Record<string, unknown> | null
  media: Media
  genres?: string[]
  creators?: MediaCreatorItem[]
  externalIds?: Array<{ provider: string; externalId: string }>
  tags?: TagItem[]
  collectionIds?: string[]
  childSummary?: ChildSummary
}

export interface CollectionSummary {
  id: string
  name: string
  description: string | null
  ranked: boolean
  count: number
  updated_at: string
  covers: string[]
}

export interface CollectionItem {
  position: number
  added_at: string
  log: Log
}

export interface CollectionDetail {
  id: string
  name: string
  description: string | null
  ranked: boolean
  created_at: string
  updated_at: string
  items: CollectionItem[]
}

export interface CreateCollectionInput {
  name: string
  description?: string | null
  ranked?: boolean
}

export interface UpdateCollectionInput {
  name?: string
  description?: string | null
  ranked?: boolean
}

//MEDIA TYPES
export interface MediaType {
  id: string
  name: string
  created_at: string
  userId: string | null
}

//API KEY
export interface ApiKey {
  key: string
  service: AllowedSource
}