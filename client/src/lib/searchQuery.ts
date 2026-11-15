// Provider searches (TMDB, RAWG, AniList…) are slow and rate-limited: reuse results for 10 minutes and
// don't re-run them when the window regains focus. Logging a result invalidates explicitly when needed.
export const SEARCH_QUERY_OPTIONS = {
  staleTime: 10 * 60 * 1000,
  refetchOnWindowFocus: false,
} as const
