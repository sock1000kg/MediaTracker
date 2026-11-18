// @vitest-environment jsdom
import { SEARCH_PLACEHOLDER } from "@/lib/searchQuery"
import { describe, expect, it, vi, beforeEach } from "vitest"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { renderWithProviders } from "@/test/render"
import TvSearchSection from "./TvSearchSection"
import * as searchApi from "@/api/search"
import * as mediaApi from "@/api/media"
import type { TvResult, TvSeasonResult } from "@/types/search"

vi.mock("@/api/search")
vi.mock("@/api/logs", () => ({
  fetchLogs: vi.fn().mockResolvedValue([]),
  editLog: vi.fn().mockResolvedValue({}),
}))
vi.mock("@/api/media", () => ({
  fetchMedias: vi.fn().mockResolvedValue([]),
  createMediaAndLog: vi.fn().mockResolvedValue({}),
}))
vi.mock("@/api/user", () => ({
  fetchMe: vi.fn().mockResolvedValue({ preferences: {} }),
  updatePreferences: vi.fn().mockResolvedValue({}),
}))

describe("TvSearchSection component", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("searches TV shows and expands seasons once with log season buttons and aria-expanded toggle", async () => {
    const user = userEvent.setup()

    const mockShow: TvResult = {
      source: "tmdb",
      mediaType: "tv",
      sourceId: "tv:60625",
      title: "Rick and Morty",
      year: "2013",
      imageUrl: "https://image.tmdb.org/t/p/w342/rick.jpg",
      description: "An animated sci-fi series",
      subtype: "show",
      details: { seasonCount: 2, episodeCount: 21 },
      inLibrary: false,
    }

    const mockSeasonsData: { show: TvResult; seasons: TvSeasonResult[] } = {
      show: mockShow,
      seasons: [
        {
          source: "tmdb",
          mediaType: "tv",
          subtype: "season",
          sourceId: "tv:60625:s1",
          title: "Rick and Morty: Season 1",
          year: "2013",
          imageUrl: "https://image.tmdb.org/t/p/w342/s1.jpg",
          details: {
            showTitle: "Rick and Morty",
            seasonNumber: 1,
            episodeCount: 11,
          },
          inLibrary: false,
        },
        {
          source: "tmdb",
          mediaType: "tv",
          subtype: "season",
          sourceId: "tv:60625:s2",
          title: "Rick and Morty: Season 2",
          year: "2015",
          imageUrl: "https://image.tmdb.org/t/p/w342/s2.jpg",
          details: {
            showTitle: "Rick and Morty",
            seasonNumber: 2,
            episodeCount: 10,
          },
          inLibrary: false,
        },
      ],
    }

    vi.mocked(searchApi.searchTv).mockResolvedValue({
      results: [mockShow],
      nextStartIndex: null,
    })
    vi.mocked(searchApi.getTvSeasons).mockResolvedValue(mockSeasonsData)

    renderWithProviders(<TvSearchSection />)
    expect(screen.getByRole("img", { name: "TMDB" })).toBeInTheDocument()

    const input = screen.getByPlaceholderText(SEARCH_PLACEHOLDER)
    await user.type(input, "Rick{enter}")

    await waitFor(() => {
      expect(screen.getByText("Rick and Morty")).toBeInTheDocument()
    })

    const seasonsBtn = screen.getByRole("button", { name: /seasons/i })
    expect(seasonsBtn).toHaveAttribute("aria-expanded", "false")
    expect(searchApi.getTvSeasons).not.toHaveBeenCalled()

    // Click to expand seasons
    await user.click(seasonsBtn)

    expect(seasonsBtn).toHaveAttribute("aria-expanded", "true")

    await waitFor(() => {
      expect(screen.getByText("Season 1")).toBeInTheDocument()
      expect(screen.getByText("Season 2")).toBeInTheDocument()
    })

    const logSeasonButtons = screen.getAllByRole("button", { name: "Log season" })
    expect(logSeasonButtons).toHaveLength(2)
    expect(searchApi.getTvSeasons).toHaveBeenCalledTimes(1)
    expect(searchApi.getTvSeasons).toHaveBeenCalledWith(60625)

    // Click to collapse
    await user.click(seasonsBtn)
    expect(seasonsBtn).toHaveAttribute("aria-expanded", "false")
    // Should not call getTvSeasons again
    expect(searchApi.getTvSeasons).toHaveBeenCalledTimes(1)
  })

  it("logs a show with the mediaType the server sent", async () => {
    const user = userEvent.setup()
    const show: TvResult = {
      source: "tmdb",
      mediaType: "tv",
      sourceId: "tv:1",
      title: "Regular Show",
      year: "2010",
      imageUrl: null,
      subtype: "show",
      details: { seasonCount: 8, episodeCount: 261 },
      inLibrary: false,
    }
    vi.mocked(searchApi.searchTv).mockResolvedValue({ results: [show], nextStartIndex: null })

    renderWithProviders(<TvSearchSection />)
    await user.type(screen.getByPlaceholderText(SEARCH_PLACEHOLDER), "Regular{enter}")
    await user.click((await screen.findAllByRole("button", { name: "Log show" }))[0])
    await user.click(await screen.findByRole("button", { name: "Create" }))

    await waitFor(() => {
      expect(mediaApi.createMediaAndLog).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Regular Show", mediaType: "tv" }),
        expect.anything(),
        undefined
      )
    })
  })
})
