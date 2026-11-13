import { fetchMe } from "@/api/user"
import type { UserProfile } from "@/types/user"
import type { UseQueryOptions } from "@tanstack/react-query"

export const fetchMeQueryOptions = (): UseQueryOptions<UserProfile, Error> => ({
  queryKey: ["me"],
  queryFn: fetchMe,
  staleTime: 5 * 60_000,
})
