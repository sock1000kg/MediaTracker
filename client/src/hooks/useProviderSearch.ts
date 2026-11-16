import { useInfiniteQuery, useQuery, type InfiniteData, type QueryKey } from "@tanstack/react-query"
import { fetchLogsQueryOptions } from "@/queryOptions/fetchLogsQueryOptions"
import { isResultLogged } from "@/lib/utils"
import { SEARCH_QUERY_OPTIONS } from "@/lib/searchQuery"
import type { MediaResult } from "@/types/search"

export type SearchPageData<T> = { results: T[]; nextStartIndex: number | null }

interface ProviderSearchOptions<T> {
  /** Cache key; include the query and every filter. */
  queryKey: QueryKey
  /** The submitted query; nothing is fetched while it is empty. */
  query: string
  fetchPage: (page: number) => Promise<SearchPageData<T>>
  hideLogged: boolean
}

/**
 * Paged provider search shared by the search pages: results are de-duplicated by sourceId
 * (providers repeat items across pages) and split into what to show when logged ones are hidden.
 */
export function useProviderSearch<T extends MediaResult>({ queryKey, query, fetchPage, hideLogged }: ProviderSearchOptions<T>) {
  const search = useInfiniteQuery<SearchPageData<T>, Error, InfiniteData<SearchPageData<T>, number>, QueryKey, number>({
    queryKey,
    ...SEARCH_QUERY_OPTIONS,
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    getNextPageParam: (lastPage) => lastPage.nextStartIndex,
    initialPageParam: 1,
    enabled: !!query,
  })

  const { data: logs = [] } = useQuery(fetchLogsQueryOptions())

  const results = Array.from(
    new Map((search.data?.pages ?? []).flatMap((p) => p.results).map((r) => [r.sourceId, r])).values()
  )
  const visibleResults = hideLogged ? results.filter((r) => !isResultLogged(logs, r)) : results

  return {
    ...search,
    logs,
    results,
    visibleResults,
    hiddenCount: results.length - visibleResults.length,
    /** True while a search or the next page is loading. */
    busy: search.isLoading || search.isFetchingNextPage,
  }
}
