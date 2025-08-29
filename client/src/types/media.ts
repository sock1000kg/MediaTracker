export interface MediaType {
  id: number
  name: string
}

export interface Media {
  id: number
  title: string
  creator: string
  year: number
  mediaType: MediaType
}

export interface Log {
  id: number
  status: string
  rating: number
  notes: string
  logged_at: string
  media: Media
}