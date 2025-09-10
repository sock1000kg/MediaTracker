import type { Media } from "./main"

export type MediaResults = BookResult

export type BookResult = Partial<Media> & {
  source: "google_books"
  creator: string | null
  year: string | null
  sourceRating: number | null
  ratingsCount: number | null
  sourceId: string
  title: string
  description: string | null
  imageUrl: string | null
  metadata: {
    pageCount?: number
    categories?: string[]
    publisher?: string
  }
}