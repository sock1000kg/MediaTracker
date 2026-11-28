// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useLimits, DEFAULT_LIMITS } from "./useLimits"
import * as configApi from "@/api/config"
import type { ReactNode } from "react"

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: Infinity,
      },
    },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

describe("useLimits hook", () => {
  it("returns defaults before fetch resolves and merged server values after", async () => {
    let resolvePromise: (value: configApi.PublicConfig) => void
    const pending = new Promise<configApi.PublicConfig>((resolve) => {
      resolvePromise = resolve
    })

    vi.spyOn(configApi, "fetchConfig").mockReturnValue(pending)

    const { result } = renderHook(() => useLimits(), { wrapper: createWrapper() })

    // Before fetch resolves, returns default limits
    expect(result.current).toEqual(DEFAULT_LIMITS)

    // Resolve with custom server limits
    resolvePromise!({
      limits: {
        notes: { maxLength: 99999 },
        logs: { maxEntriesPerLog: 50, entryNoteMaxLength: 5000, entryNameMaxLength: 200 },
        letters: { bodyMaxLength: 5000, maxSealedPerLog: 3, maxPerUser: 100 },
        tags: { maxLength: 50, maxPerLog: 30, maxPerUser: 600 },
        collections: {
          nameMaxLength: 90,
          descMaxLength: 2000,
          maxPerUser: 250,
          maxItemsPerCollection: 1500,
        },
        imports: { maxFileBytes: 25 * 1024 * 1024 },
        search: { queryMaxLength: 150 },
      },
      demo: null,
    })

    await waitFor(() => {
      expect(result.current.notes.maxLength).toBe(99999)
    })

    expect(result.current.tags.maxLength).toBe(50)
    expect(result.current.logs).toEqual({ maxEntriesPerLog: 50, entryNoteMaxLength: 5000, entryNameMaxLength: 200 })
    expect(result.current.collections.nameMaxLength).toBe(90)
    expect(result.current.imports.maxFileBytes).toBe(25 * 1024 * 1024)
    expect(result.current.search.queryMaxLength).toBe(150)
  })

  it("returns defaults when the server fetch fails", async () => {
    vi.spyOn(configApi, "fetchConfig").mockRejectedValue(new Error("Network error"))

    const { result } = renderHook(() => useLimits(), { wrapper: createWrapper() })

    // Initially defaults
    expect(result.current).toEqual(DEFAULT_LIMITS)

    // Remains defaults after failure
    await waitFor(() => {
      expect(result.current).toEqual(DEFAULT_LIMITS)
    })
  })
})
