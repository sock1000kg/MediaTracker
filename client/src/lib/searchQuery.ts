import type { KeyboardEvent } from "react"

// Provider searches (TMDB, RAWG, AniList…) are slow and rate-limited: reuse results for 10 minutes and
// don't re-run them when the window regains focus. Logging a result invalidates explicitly when needed.
export const SEARCH_QUERY_OPTIONS = {
  staleTime: 10 * 60 * 1000,
  refetchOnWindowFocus: false,
} as const

/** Placeholder for every search page's main input. */
export const SEARCH_PLACEHOLDER = "Type a name..."

/** Server errors for a missing per-user provider key → the provider to tell the user about. */
export const MISSING_KEY_PROVIDERS: Record<string, string> = {
  "Missing Music API Key": "Last.fm",
  "Missing Movie API Key": "TMDB",
  "Missing TV API Key": "TMDB",
  "Missing Game API Key": "RAWG",
  "Missing Board Game API Key": "BoardGameGeek",
}

/** onKeyDown for any search control: Enter runs the search. */
export function searchOnEnter(onSearch: () => void) {
  return (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault()
      onSearch()
    }
  }
}

/** "2014" → "2014"; anything that isn't a four-digit year → "". */
export function parseYear(input: string): string {
  const y = input.trim()
  return /^\d{4}$/.test(y) ? y : ""
}
