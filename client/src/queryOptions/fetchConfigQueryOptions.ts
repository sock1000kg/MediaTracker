import { queryOptions } from "@tanstack/react-query"
import { fetchConfig } from "@/api/config"

/** Public server config (limits, demo login). Fetched once per page load and kept for the session. */
export const fetchConfigQueryOptions = () =>
  queryOptions({
    queryKey: ["config"],
    queryFn: fetchConfig,
    staleTime: Infinity,
    gcTime: Infinity,
  })
