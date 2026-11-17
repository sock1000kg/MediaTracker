// @vitest-environment jsdom
import { SEARCH_PLACEHOLDER } from "@/lib/searchQuery"
import { describe, expect, it, vi, beforeEach } from "vitest"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { renderWithProviders } from "@/test/render"
import { MovieSearchSection } from "./MovieSearchSection"
import * as searchApi from "@/api/search"
import type { MovieResult } from "@/types/search"

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

describe("MovieSearchSection component", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("shows TMDB logo in attribution and searches movies", async () => {
    const user = userEvent.setup()

    const mockMovie: MovieResult = {
      source: "tmdb",
      mediaType: "movie",
      sourceId: "movie-348",
      title: "Alien",
      year: "1979",
      imageUrl: "https://image.tmdb.org/t/p/w342/alien.jpg",
      description: "In space no one can hear you scream.",
      metadata: { kind: "movie", score: 8.1, originalLanguage: "en" },
      inLibrary: false,
    }

    vi.mocked(searchApi.searchMovies).mockResolvedValue({
      results: [mockMovie],
      nextStartIndex: null,
    })

    renderWithProviders(<MovieSearchSection />)
    expect(screen.getByRole("img", { name: "TMDB" })).toBeInTheDocument()

    const input = screen.getByPlaceholderText(SEARCH_PLACEHOLDER)
    await user.type(input, "Alien{enter}")

    await waitFor(() => {
      expect(screen.getByText("Alien")).toBeInTheDocument()
    })
  })
})
