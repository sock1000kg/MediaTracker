// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { renderWithProviders } from "@/test/render"
import CollectionsSection from "./CollectionsSection"
import * as collectionsApi from "@/api/collections"
import * as logsApi from "@/api/logs"
import type { CollectionDetail, CollectionSummary, Log } from "@/types/mainTypes"

vi.mock("@/api/collections")
vi.mock("@/api/logs", () => ({
  editLog: vi.fn().mockResolvedValue({}),
  deleteLog: vi.fn().mockResolvedValue({}),
  deleteWarningLog: vi.fn().mockResolvedValue({}),
  fetchLogs: vi.fn().mockResolvedValue([]),
}))
vi.mock("@/api/tags", () => ({
  fetchTags: vi.fn().mockResolvedValue([]),
}))

const mockLog1: Log = {
  id: "018f0000-0000-7000-8000-000000000101",
  rating: 80,
  status: "completed",
  logged_at: "2026-11-01T12:00:00Z",
  entries: [{ id: "e1", logId: "l1", startedAt: "2026-11-01T12:00:00Z", finishedAt: "2026-11-02T12:00:00Z", progressEpisodes: null, progressChapters: null, progressVolumes: null, note: null, edition: null, created_at: "2026-11-02T12:00:00Z" }],
  entryCount: 1,
  displayTitle: "",
  notes: "",
  tags: [],
  media: {
    id: "018f0000-0000-7000-8000-000000000001",
    userId: "018f0000-0000-7000-8000-000000000999",
    title: "Alpha Movie",
    creator: "Director A",
    year: 2020,
    description: null,
    created_at: "2026-11-01T12:00:00Z",
    imageUrl: "https://example.com/alpha.jpg",
    provider: "tmdb",
    providerId: "movie:1",
    details: undefined,
    mediaType: { id: "018f0000-0000-7000-8000-000000000011", name: "movie", created_at: "2026-01-01T00:00:00Z", userId: "018f0000-0000-7000-8000-000000000999" },
  },
}

const mockLog2: Log = {
  id: "018f0000-0000-7000-8000-000000000102",
  rating: 90,
  status: "completed",
  logged_at: "2026-11-03T12:00:00Z",
  entries: [{ id: "e2", logId: "l2", startedAt: "2026-11-03T12:00:00Z", finishedAt: "2026-11-04T12:00:00Z", progressEpisodes: null, progressChapters: null, progressVolumes: null, note: null, edition: null, created_at: "2026-11-04T12:00:00Z" }],
  entryCount: 1,
  displayTitle: "",
  notes: "",
  tags: [],
  media: {
    id: "018f0000-0000-7000-8000-000000000002",
    userId: "018f0000-0000-7000-8000-000000000999",
    title: "Beta Book",
    creator: "Author B",
    year: 2021,
    description: null,
    created_at: "2026-11-01T12:00:00Z",
    imageUrl: "https://example.com/beta.jpg",
    provider: "openlibrary",
    providerId: "book:2",
    details: undefined,
    mediaType: { id: "018f0000-0000-7000-8000-000000000012", name: "book", created_at: "2026-01-01T00:00:00Z", userId: "018f0000-0000-7000-8000-000000000999" },
  },
}

const mockCollectionSummary: CollectionSummary = {
  id: "018f0000-0000-7000-8000-000000000201",
  name: "Top Picks",
  description: "My favorites",
  ranked: true,
  count: 2,
  updated_at: "2026-11-01T12:00:00Z",
  covers: ["https://example.com/alpha.jpg", "https://example.com/beta.jpg"],
}

const mockCollectionDetail: CollectionDetail = {
  id: "018f0000-0000-7000-8000-000000000201",
  name: "Top Picks",
  description: "My favorites",
  ranked: true,
  created_at: "2026-11-01T12:00:00Z",
  updated_at: "2026-11-01T12:00:00Z",
  items: [
    {
      position: 0,
      added_at: "2026-11-01T12:00:00Z",
      log: mockLog1,
    },
    {
      position: 1,
      added_at: "2026-11-02T12:00:00Z",
      log: mockLog2,
    },
  ],
}

describe("CollectionsSection component", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    vi.mocked(collectionsApi.fetchCollections).mockResolvedValue([mockCollectionSummary])
    vi.mocked(collectionsApi.fetchCollection).mockResolvedValue(mockCollectionDetail)
    vi.mocked(collectionsApi.reorderCollection).mockResolvedValue({ message: "reordered" })
    vi.mocked(collectionsApi.removeCollectionItem).mockResolvedValue()
  })

  it("handles navigation, view switching, reordering, editing, and collection removal", async () => {
    const user = userEvent.setup()

    renderWithProviders(<CollectionsSection />)

    // Wait for collections cards
    await waitFor(() => {
      expect(screen.getByText("Top Picks")).toBeInTheDocument()
    })

    // Click collection card to view detail
    const card = screen.getByRole("button", { name: /Top Picks/i })
    await user.click(card)

    // Wait for detail view items
    await waitFor(() => {
      expect(screen.getByText("Alpha Movie")).toBeInTheDocument()
      expect(screen.getByText("Beta Book")).toBeInTheDocument()
    })

    // 1. Ranked: each item has a rank box with its position
    const alphaRank = screen.getByRole("textbox", { name: "Rank of Alpha Movie, 1 to 2" })
    expect(alphaRank).toHaveValue("1")
    expect(screen.getByRole("textbox", { name: "Rank of Beta Book, 1 to 2" })).toHaveValue("2")

    // 2. Typing a rank + Enter moves the item, calls reorder and announces the new position
    await user.click(alphaRank)
    await user.keyboard("2{Enter}")

    expect(collectionsApi.reorderCollection).toHaveBeenCalledWith(mockCollectionDetail.id, [mockLog2.id, mockLog1.id])
    const liveRegion = screen.getByRole("status")
    expect(liveRegion).toHaveTextContent("Moved Alpha Movie to position 2")

    // 3. Switching to Grid persists collections.view in localStorage
    const gridBtn = screen.getByRole("button", { name: /grid/i })
    await user.click(gridBtn)

    expect(localStorage.getItem("collections.view")).toBe("grid")

    // 4. Edit opens the log edit form for that log
    const actionsButtons = screen.getAllByRole("button", { name: /actions for/i })
    await user.click(actionsButtons[0])

    const editMenuItem = await screen.findByRole("menuitem", { name: "Edit log" })
    await user.click(editMenuItem)

    await waitFor(() => {
      expect(screen.getByText(/Logging for/i)).toBeInTheDocument()
      expect(screen.getByText("Alpha Movie")).toBeInTheDocument()
    })

    // Close log edit dialog
    const cancelBtn = screen.getByRole("button", { name: "Cancel" })
    await user.click(cancelBtn)

    // 5. "Remove from collection" calls removeCollectionItem and NOT deleteLog
    await user.click(actionsButtons[0])
    const removeMenuItem = await screen.findByRole("menuitem", { name: "Remove from collection" })
    await user.click(removeMenuItem)

    expect(collectionsApi.removeCollectionItem).toHaveBeenCalledWith(mockCollectionDetail.id, mockLog2.id)
    expect(logsApi.deleteLog).not.toHaveBeenCalled()
  })

  it("rank box clamps out-of-range numbers and Escape cancels without moving", async () => {
    const user = userEvent.setup()
    renderWithProviders(<CollectionsSection />)
    await user.click(await screen.findByRole("button", { name: /Top Picks/i }))

    const betaRank = await screen.findByRole("textbox", { name: "Rank of Beta Book, 1 to 2" })
    await user.click(betaRank)
    await user.keyboard("9{Escape}")
    expect(collectionsApi.reorderCollection).not.toHaveBeenCalled()
    expect(betaRank).toHaveValue("2")

    await user.click(betaRank)
    await user.keyboard("0{Enter}")
    expect(collectionsApi.reorderCollection).toHaveBeenCalledWith(mockCollectionDetail.id, [mockLog2.id, mockLog1.id])
  })

  it("unranked collections show no rank numbers or reorder controls", async () => {
    vi.mocked(collectionsApi.fetchCollections).mockResolvedValue([{ ...mockCollectionSummary, ranked: false }])
    vi.mocked(collectionsApi.fetchCollection).mockResolvedValue({ ...mockCollectionDetail, ranked: false })
    const user = userEvent.setup()
    renderWithProviders(<CollectionsSection />)
    await user.click(await screen.findByRole("button", { name: /Top Picks/i }))

    await screen.findByText("Alpha Movie")
    expect(screen.queryAllByRole("textbox", { name: /^Rank of/ })).toHaveLength(0)
    expect(screen.queryByRole("button", { name: /^Move / })).toBeNull()

    await user.click(screen.getByRole("button", { name: /grid/i }))
    expect(screen.queryAllByRole("textbox", { name: /^Rank of/ })).toHaveLength(0)
  })
})
