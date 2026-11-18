// @vitest-environment jsdom
import { SEARCH_PLACEHOLDER } from "@/lib/searchQuery"
import { describe, expect, it, vi, beforeEach } from "vitest"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { renderWithProviders } from "@/test/render"
import GameSearchSection from "./GameSearchSection"
import * as searchApi from "@/api/search"
import type { BoardGameResult, GameResult } from "@/types/search"

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

describe("GameSearchSection", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("switching to Board games calls searchBoardGames and hides Platform/Sort; switching back calls searchGames", async () => {
    const user = userEvent.setup()

    const mockGame: GameResult = {
      source: "rawg",
      mediaType: "game",
      sourceId: "game-1",
      title: "Hades",
      year: "2020",
      details: { score: 4.5 },
    }

    const mockBoardGame: BoardGameResult = {
      source: "bgg",
      mediaType: "boardgame",
      sourceId: "13",
      title: "Catan",
      year: "1995",
      details: { minPlayers: 3, maxPlayers: 4, score: 7.12 },
    }

    vi.mocked(searchApi.searchGames).mockResolvedValue({ results: [mockGame], nextStartIndex: null })
    vi.mocked(searchApi.searchBoardGames).mockResolvedValue({ results: [mockBoardGame], nextStartIndex: null })

    renderWithProviders(<GameSearchSection />)

    // Platform and Sort are visible initially
    expect(screen.getByRole("combobox", { name: "Platform" })).toBeInTheDocument()
    expect(screen.getByRole("combobox", { name: "Sort" })).toBeInTheDocument()

    // Type query and search
    const input = screen.getByPlaceholderText(SEARCH_PLACEHOLDER)
    await user.type(input, "test{enter}")

    await waitFor(() => {
      expect(searchApi.searchGames).toHaveBeenCalledWith("test", 1, expect.any(Object))
    })

    // Switch to Board games mode
    const modeSelect = screen.getByRole("combobox", { name: "Video or board games" })
    await user.click(modeSelect)
    const boardOption = await screen.findByRole("option", { name: "Board games" })
    await user.click(boardOption)

    // Platform and Sort should now be hidden
    expect(screen.queryByRole("combobox", { name: "Platform" })).not.toBeInTheDocument()
    expect(screen.queryByRole("combobox", { name: "Sort" })).not.toBeInTheDocument()
    // BGG's terms: the "Powered by BGG" logo shows with its data
    expect(screen.getByRole("img", { name: "Powered by BGG" })).toBeInTheDocument()

    // It should have called searchBoardGames
    await waitFor(() => {
      expect(searchApi.searchBoardGames).toHaveBeenCalledWith("test", 1)
    })

    // Switch back to Video games
    await user.click(modeSelect)
    const videoOption = await screen.findByRole("option", { name: "Video games" })
    await user.click(videoOption)

    // Platform and Sort should be visible again
    expect(screen.getByRole("combobox", { name: "Platform" })).toBeInTheDocument()
    expect(screen.getByRole("combobox", { name: "Sort" })).toBeInTheDocument()
    expect(screen.queryByRole("img", { name: "Powered by BGG" })).not.toBeInTheDocument()

    await waitFor(() => {
      expect(searchApi.searchGames).toHaveBeenCalledWith("test", 1, expect.any(Object))
    })
  })
})
