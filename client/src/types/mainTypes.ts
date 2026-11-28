export type DialogName = "mediaForm" | "mediaTypeForm" | "logForm" | "deleteConfirm" | null //Dialogs in homepage tabs
export type EditableEntity = Log | Media | MediaType

export const allowedSources = ["lastfm", "tmdb", "rawg", "bgg"] as const
export type AllowedSource = (typeof allowedSources)[number]


// MAIN TYPES
type JsonPrimitive = string | number | boolean | null
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }
export interface MediaDetails {
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
  provider?: string | null
  providerId?: string | null
  description: string | null
  details?: MediaDetails | null
  imageUrl?: string | null
  created_at: string
  parentId?: string | null
  position?: number | null
  subtype?: "album" | "track" | "show" | "season" | null
  originalTitle?: string | null
  releaseDate?: string | null
  syncedAt?: string | null
  syncCheckedAt?: string | null
  purgedAt?: string | null
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

// What the server accepts as an edition (strict: no other keys). Empty is stored as null.
export interface Edition {
  format?: string
  language?: string
}

/** One dated experience of an item: a read, watch, listen or play. */
export interface LogEntry {
  id: string
  logId: string
  startedAt: string | null
  finishedAt: string | null
  progressEpisodes: number | null // entry
  progressChapters: number | null // entry
  progressVolumes: number | null // entry
  /** What you read or watched this time (a title, or any label). */
  name: string | null
  note: string | null
  edition: Edition | null
  created_at: string
}

/** The fields an entry is created or edited with. Dates are YYYY-MM-DD; null clears, absent leaves. */
export interface EntryInput {
  startedAt?: string | null
  finishedAt?: string | null
  progressEpisodes?: number | null // entry
  progressChapters?: number | null // entry
  progressVolumes?: number | null // entry
  name?: string | null
  note?: string | null
  edition?: Edition | null
}

/** What a log save changes among the entries: staged in the journal dialog, committed together with the log. */
export interface EntriesChange {
  create?: EntryInput[]
  update?: (EntryInput & { id: string })[]
  delete?: string[]
}

export interface Log {
  id: string
  status: LogStatus
  rating: number | null
  notes: string
  logged_at: string
  /** Newest first. */
  entries: LogEntry[]
  entryCount: number
  /** Create form only: the first entry being drafted. Never part of a log from the server. */
  entry?: EntryInput
  media: Media
  genres?: string[]
  creators?: MediaCreatorItem[]
  externalIds?: Array<{ provider: string; externalId: string }>
  tags?: TagItem[]
  collectionIds?: string[]
  childSummary?: ChildSummary
  /** Letters to later on this log that haven't been opened. */
  letters?: { sealed: number; ready: number }
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