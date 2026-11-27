import { queryOptions, type QueryClient } from "@tanstack/react-query"
import { fetchLetters, fetchLetterSummary } from "@/api/letters"

export const lettersQueryOptions = () => queryOptions({ queryKey: ["letters"], queryFn: fetchLetters })

export const letterSummaryQueryOptions = () => queryOptions({ queryKey: ["letters", "summary"], queryFn: fetchLetterSummary })

/** After sealing, opening, tearing up or logging again: letters, their summary and the logs' chips. */
export function invalidateLetters(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: ["letters"] })
  // The logs query doesn't refetch on mount, so it has to be refetched even while unused
  queryClient.refetchQueries({ queryKey: ["logs"] })
  queryClient.invalidateQueries({ queryKey: ["collection"] })
}
