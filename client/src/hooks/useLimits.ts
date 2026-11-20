import { useQuery } from "@tanstack/react-query"
import { fetchConfig, type PublicLimits } from "@/api/config"

// The server stays the enforcer. DEFAULT_LIMITS is only a fallback for the moment before the fetch finishes, or if it fails.
export const DEFAULT_LIMITS: PublicLimits = {
  notes: {
    maxLength: 50_000,
  },
  logs: {
    maxEntriesPerLog: 100,
    entryNoteMaxLength: 10_000,
  },
  tags: {
    maxLength: 40,
    maxPerLog: 20,
    maxPerUser: 500,
  },
  collections: {
    nameMaxLength: 80,
    descMaxLength: 1000,
    maxPerUser: 200,
    maxItemsPerCollection: 1000,
  },
  imports: {
    maxFileBytes: 10 * 1024 * 1024,
  },
  search: {
    queryMaxLength: 100,
  },
}

export function useLimits(): PublicLimits {
  const { data } = useQuery({
    queryKey: ["config"],
    queryFn: fetchConfig,
    staleTime: Infinity,
    gcTime: Infinity,
  })

  const serverLimits = data?.limits

  return {
    notes: {
      ...DEFAULT_LIMITS.notes,
      ...(serverLimits?.notes ?? {}),
    },
    logs: {
      ...DEFAULT_LIMITS.logs,
      ...(serverLimits?.logs ?? {}),
    },
    tags: {
      ...DEFAULT_LIMITS.tags,
      ...(serverLimits?.tags ?? {}),
    },
    collections: {
      ...DEFAULT_LIMITS.collections,
      ...(serverLimits?.collections ?? {}),
    },
    imports: {
      ...DEFAULT_LIMITS.imports,
      ...(serverLimits?.imports ?? {}),
    },
    search: {
      ...DEFAULT_LIMITS.search,
      ...(serverLimits?.search ?? {}),
    },
  }
}
