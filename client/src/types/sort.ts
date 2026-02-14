export type SortDirection = "asc" | "desc"
export type SortField = "title" | "creator" | "rating" | "status" | "date" | "pageCount" | "categories"

export interface SortCriterion {
  id: string
  field: SortField
  direction: SortDirection
}

export const AVAILABLE_SORT_FIELDS_LOGS: { label: string; value: SortField }[] = [
  { label: "Title", value: "title" },
  { label: "Creator", value: "creator" },
  { label: "Rating", value: "rating" },
  { label: "Date Logged", value: "date" },
  { label: "Page Count", value: "pageCount" },
  { label: "Categories", value: "categories" },
]

export const AVAILABLE_SORT_FIELDS_MEDIAS: { label: string; value: SortField }[] = [
  { label: "Title", value: "title" },
  { label: "Creator", value: "creator" },
  { label: "Date Created", value: "date" },
  { label: "Page Count", value: "pageCount" },
  { label: "Categories", value: "categories" },
]