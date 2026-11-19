// @vitest-environment jsdom
import { SEARCH_PLACEHOLDER } from "@/lib/searchQuery"
import { describe, expect, it, vi, beforeEach } from "vitest"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { renderWithProviders } from "@/test/render"
import MusicSearchSection from "./MusicSearchSection"
import * as searchApi from "@/api/search"
import * as mediaApi from "@/api/media"
import type { MusicResult, MusicTrackResult } from "@/types/search"

vi.mock("@/api/search")
vi.mock("@/api/logs", () => ({
  fetchLogs: vi.fn().mockResolvedValue([]),
  editLog: vi.fn().mockResolvedValue({}),
}))
vi.mock("@/api/media", () => ({
  fetchMedias: vi.fn().mockResolvedValue([]),
  createMediaAndLog: vi.fn().mockResolvedValue({}),
  getMediaChildren: vi.fn().mockResolvedValue({ children: [] }),
}))
vi.mock("@/api/user", () => ({
  fetchMe: vi.fn().mockResolvedValue({ preferences: {} }),
  updatePreferences: vi.fn().mockResolvedValue({}),
}))

describe("MusicSearchSection component", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const mockAlbum: MusicResult = {
    source: "lastfm",
    mediaType: "music",
    sourceId: "mbid-loveless",
    title: "Loveless",
    creator: "my bloody valentine",
    year: "1991",
    imageUrl: "https://cover.jpg",
    description: "Classic album",
    subtype: "album",
    details: { url: "https://last.fm/music/Loveless" },
    inLibrary: false,
  }

  const mockTracks: MusicTrackResult[] = [
    {
      source: "lastfm",
      mediaType: "music",
      subtype: "track",
      sourceId: "track-1",
      title: "Only Shallow",
      creator: "my bloody valentine",
      year: "1991",
      imageUrl: null,
      details: {
        durationSec: 257,
      },
      inLibrary: false,
      myLog: null,
    },
    {
      source: "lastfm",
      mediaType: "music",
      subtype: "track",
      sourceId: "track-2",
      title: "Loomer",
      creator: "my bloody valentine",
      year: "1991",
      imageUrl: null,
      details: {
        durationSec: 158,
      },
      inLibrary: false,
      myLog: null,
    },
  ]

  it("credits Last.fm for data and the Cover Art Archive for covers, each with its own link", () => {
    renderWithProviders(<MusicSearchSection />)
    expect(screen.getByRole("link", { name: "Data from Last.fm" })).toHaveAttribute("href", "https://www.last.fm")
    expect(screen.getByRole("link", { name: "Covers from the Cover Art Archive" })).toHaveAttribute("href", "https://coverartarchive.org")
  })

  it("expands tracks disclosure once with aria-expanded toggle", async () => {
    const user = userEvent.setup()

    vi.mocked(searchApi.searchAlbums).mockResolvedValue({
      results: [mockAlbum],
      nextStartIndex: null,
    })
    vi.mocked(searchApi.getAlbumTracks).mockResolvedValue({
      album: mockAlbum,
      tracks: mockTracks,
      provider: "lastfm",
    })

    renderWithProviders(<MusicSearchSection />)

    const input = screen.getByPlaceholderText(SEARCH_PLACEHOLDER)
    await user.type(input, "Loveless{enter}")

    await waitFor(() => {
      expect(screen.getByText("Loveless")).toBeInTheDocument()
    })

    const tracksBtn = screen.getByRole("button", { name: /tracks/i })
    expect(tracksBtn).toHaveAttribute("aria-expanded", "false")
    expect(searchApi.getAlbumTracks).not.toHaveBeenCalled()

    // Expand
    await user.click(tracksBtn)
    expect(tracksBtn).toHaveAttribute("aria-expanded", "true")

    await waitFor(() => {
      expect(screen.getByText("Only Shallow")).toBeInTheDocument()
      expect(screen.getByText("Loomer")).toBeInTheDocument()
    })

    expect(searchApi.getAlbumTracks).toHaveBeenCalledTimes(1)
    expect(searchApi.getAlbumTracks).toHaveBeenCalledWith({
      artist: "my bloody valentine",
      album: "Loveless",
      mbid: "mbid-loveless",
    })

    // Collapse
    await user.click(tracksBtn)
    expect(tracksBtn).toHaveAttribute("aria-expanded", "false")
    expect(searchApi.getAlbumTracks).toHaveBeenCalledTimes(1)
  })

  it("inline rates a track, calling createMediaAndLog with parent album and showing value", async () => {
    const user = userEvent.setup()

    vi.mocked(searchApi.searchAlbums).mockResolvedValue({
      results: [mockAlbum],
      nextStartIndex: null,
    })
    vi.mocked(searchApi.getAlbumTracks).mockResolvedValue({
      album: mockAlbum,
      tracks: mockTracks,
      provider: "lastfm",
    })
    vi.mocked(mediaApi.createMediaAndLog).mockResolvedValue({
      id: "018f0000-0000-7000-8000-000000000101",
      rating: 100,
      status: "completed",
    } as never)

    renderWithProviders(<MusicSearchSection />)

    const input = screen.getByPlaceholderText(SEARCH_PLACEHOLDER)
    await user.type(input, "Loveless{enter}")

    await waitFor(() => {
      expect(screen.getByText("Loveless")).toBeInTheDocument()
    })

    const tracksBtn = screen.getByRole("button", { name: /tracks/i })
    await user.click(tracksBtn)

    await waitFor(() => {
      expect(screen.getByText("Only Shallow")).toBeInTheDocument()
    })

    const rateInput = screen.getByLabelText("Rate Only Shallow")
    expect(rateInput).toHaveValue(null)

    // Type 100 and blur / press enter
    await user.type(rateInput, "100{enter}")

    await waitFor(() => {
      expect(mediaApi.createMediaAndLog).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Only Shallow",
          sourceId: "track-1",
          mediaType: "music",
        }),
        expect.objectContaining({
          rating: 100,
          status: "completed",
        }),
        expect.objectContaining({
          title: "Loveless",
          sourceId: "mbid-loveless",
        })
      )
    })

    expect(rateInput).toHaveValue(100)
  })

  it("rolls back rating and shows toast on failed save", async () => {
    const user = userEvent.setup()

    vi.mocked(searchApi.searchAlbums).mockResolvedValue({
      results: [mockAlbum],
      nextStartIndex: null,
    })
    vi.mocked(searchApi.getAlbumTracks).mockResolvedValue({
      album: mockAlbum,
      tracks: mockTracks,
      provider: "lastfm",
    })
    vi.mocked(mediaApi.createMediaAndLog).mockRejectedValue(new Error("Network error"))

    renderWithProviders(<MusicSearchSection />)

    const input = screen.getByPlaceholderText(SEARCH_PLACEHOLDER)
    await user.type(input, "Loveless{enter}")

    await waitFor(() => {
      expect(screen.getByText("Loveless")).toBeInTheDocument()
    })

    const tracksBtn = screen.getByRole("button", { name: /tracks/i })
    await user.click(tracksBtn)

    await waitFor(() => {
      expect(screen.getByText("Only Shallow")).toBeInTheDocument()
    })

    const rateInput = screen.getByLabelText("Rate Only Shallow")
    await user.type(rateInput, "90{enter}")

    // Rating should roll back and toast alert should be shown
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Network error")
    })

    expect(rateInput).toHaveValue(null)
  })
})
