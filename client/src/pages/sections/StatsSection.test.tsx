// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { renderWithProviders } from "@/test/render"
import StatsSection from "./StatsSection"
import * as logsApi from "@/api/logs"
import { dudeSay } from "@/lib/dude"
import type { Log } from "@/types/mainTypes"

vi.mock("@/lib/dude", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/dude")>()
  return {
    ...actual,
    dudeSay: vi.fn(),
  }
})

vi.mock("@/api/logs", () => ({
  fetchLogs: vi.fn(),
}))

const mockLogs: Log[] = [
  {
    id: "1",
    rating: 90,
    status: "completed",
    logged_at: "2026-10-15T12:00:00Z",
    started_at: "2026-10-10T12:00:00Z",
    finished_at: "2026-10-15T12:00:00Z",
    notes: "Great watch",
    tags: [],
    media: {
      id: "1",
      userId: "1",
      title: "Inception",
      creator: "Christopher Nolan",
      year: 2010,
      description: null,
      created_at: "2026-10-10T12:00:00Z",
      imageUrl: null,
      provider: "tmdb",
      providerId: "movie:1",
      details: { durationSec: 148 * 60 },
      mediaType: { id: "1", name: "movie", created_at: "2026-01-01T00:00:00Z", userId: "1" },
    },
  },
  {
    id: "2",
    rating: 50,
    status: "completed",
    logged_at: "2026-10-20T12:00:00Z",
    started_at: "2026-10-18T12:00:00Z",
    finished_at: "2026-10-20T12:00:00Z",
    notes: "Average book",
    tags: [],
    media: {
      id: "2",
      userId: "1",
      title: "Dune",
      creator: "Frank Herbert",
      year: 1965,
      description: null,
      created_at: "2026-10-10T12:00:00Z",
      imageUrl: null,
      provider: "openlibrary",
      providerId: "book:2",
      details: { pageCount: 412 },
      mediaType: { id: "2", name: "book", created_at: "2026-01-01T00:00:00Z", userId: "1" },
    },
  },
]

describe("StatsSection component", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    vi.mocked(logsApi.fetchLogs).mockResolvedValue(mockLogs)
  })

  it("calls dudeSay once per line, doesn't re-call on plain re-render, calls on type tab change, and has no inline dude", async () => {
    const user = userEvent.setup()

    const { rerender } = renderWithProviders(<StatsSection />)

    // Wait for stats content
    await waitFor(() => {
      expect(screen.getByText("Your stats")).toBeInTheDocument()
    })

    // 1. Verify no blue dude or poke button is rendered inside StatsSection
    expect(screen.queryByLabelText(/blue guy/i)).not.toBeInTheDocument()
    expect(screen.queryByRole("img", { name: /blue dude/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /poke/i })).not.toBeInTheDocument()

    // 2. dudeSay called once with the overall stats line
    await waitFor(() => {
      expect(dudeSay).toHaveBeenCalledTimes(1)
    })
    const firstCallArg = vi.mocked(dudeSay).mock.calls[0][0]
    expect(typeof firstCallArg).toBe("string")
    expect(firstCallArg.length).toBeGreaterThan(0)

    // 3. Re-render with identical data does not call dudeSay again
    rerender(<StatsSection />)
    expect(dudeSay).toHaveBeenCalledTimes(1)

    // 4. Changing type tab (e.g. to "Movie") produces a new line and calls dudeSay again
    const movieTab = await screen.findByRole("tab", { name: "Movie" })
    await user.click(movieTab)

    await waitFor(() => {
      expect(dudeSay).toHaveBeenCalledTimes(2)
    })
    const secondCallArg = vi.mocked(dudeSay).mock.calls[1][0]
    expect(secondCallArg).not.toBe(firstCallArg)
  })
})
