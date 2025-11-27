export type MediaResult<T extends string = string> = {
  source: string
  mediaType: T
  creator?: string | null
  year?: string | null
  sourceId: string
  title: string
  description?: string | null
  imageUrl?: string | null
  metadata?: Record<string, unknown>
}

export type BookResult = MediaResult<"book"> & {
  metadata: {
    pageCount?: number
    categories?: string[]
    publisher?: string
  }
}

