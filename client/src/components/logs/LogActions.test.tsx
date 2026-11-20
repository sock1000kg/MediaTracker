// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { renderWithProviders } from "@/test/render"
import { LogActions } from "./LogActions"
import * as mediaApi from "@/api/media"
import type { Log } from "@/types/mainTypes"

vi.mock("@/api/media", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/media")>()
  return {
    ...actual,
    refreshMedia: vi.fn(),
  }
})

describe("LogActions component (T2)", () => {
  const onEdit = vi.fn()
  const onDelete = vi.fn()

  const providerLog: Log = {
    id: "log-1",
    rating: 90,
    status: "completed",
    notes: "",
    logged_at: "2024-01-01T00:00:00.000Z",
    entries: [],
    entryCount: 0,
    displayTitle: "",
    tags: [],
    media: {
      id: "media-provider-1",
      userId: "user-1",
      title: "Inception",
      creator: "Christopher Nolan",
      year: 2010,
      provider: "tmdb",
      providerId: "movie-27205",
      imageUrl: "https://image.tmdb.org/t/p/w500/test.jpg",
      description: "A thief...",
      created_at: "2024-01-01T00:00:00.000Z",
      parentId: null,
      position: null,
      mediaType: { id: "mt-1", name: "movie", created_at: "2024-01-01T00:00:00.000Z", userId: "user-1" },
      details: {},
    },
  }

  const customLog: Log = {
    id: "log-2",
    rating: 80,
    status: "completed",
    notes: "",
    logged_at: "2024-01-01T00:00:00.000Z",
    entries: [],
    entryCount: 0,
    displayTitle: "",
    tags: [],
    media: {
      id: "media-custom-1",
      userId: "user-1",
      title: "Home Video",
      creator: "Me",
      year: 2020,
      provider: null,
      providerId: null,
      imageUrl: null,
      description: null,
      created_at: "2024-01-01T00:00:00.000Z",
      parentId: null,
      position: null,
      mediaType: { id: "mt-1", name: "movie", created_at: "2024-01-01T00:00:00.000Z", userId: "user-1" },
      details: undefined,
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("shows 'Refresh from provider' for provider media and calls the endpoint", async () => {
    const user = userEvent.setup()
    vi.mocked(mediaApi.refreshMedia).mockResolvedValue(providerLog.media)

    renderWithProviders(
      <LogActions log={providerLog} onEdit={onEdit} onDelete={onDelete} />
    )

    const menuBtn = screen.getByRole("button", { name: `Actions for ${providerLog.media.title}` })
    await user.click(menuBtn)

    const refreshItem = screen.getByText("Refresh from provider")
    expect(refreshItem).toBeInTheDocument()

    await user.click(refreshItem)
    expect(mediaApi.refreshMedia).toHaveBeenCalledWith("media-provider-1")
  })

  it("does not show 'Refresh from provider' for custom media", async () => {
    const user = userEvent.setup()

    renderWithProviders(
      <LogActions log={customLog} onEdit={onEdit} onDelete={onDelete} />
    )

    const menuBtn = screen.getByRole("button", { name: `Actions for ${customLog.media.title}` })
    await user.click(menuBtn)

    expect(screen.queryByText("Refresh from provider")).not.toBeInTheDocument()
  })

  it("shows error toast with server error message on refresh failure", async () => {
    const user = userEvent.setup()
    vi.mocked(mediaApi.refreshMedia).mockRejectedValue(new Error("This item was refreshed recently. Please wait 10 minutes."))

    renderWithProviders(
      <LogActions log={providerLog} onEdit={onEdit} onDelete={onDelete} />
    )

    const menuBtn = screen.getByRole("button", { name: `Actions for ${providerLog.media.title}` })
    await user.click(menuBtn)

    const refreshItem = screen.getByText("Refresh from provider")
    await user.click(refreshItem)

    await waitFor(() => {
      const alert = screen.getByRole("alert")
      expect(alert).toHaveTextContent("This item was refreshed recently. Please wait 10 minutes.")
    })
  })

  it("T2: Goodreads book's menu shows 'View on Goodreads', and 'View on Open Library' once synced", async () => {
    const user = userEvent.setup()

    const syncedGoodreadsLog: Log = {
      id: "log-gr-1",
      rating: 90,
      status: "completed",
      notes: "",
      logged_at: "2024-01-01T00:00:00.000Z",
      entries: [],
      entryCount: 0,
      displayTitle: "",
      tags: [],
      media: {
        id: "media-gr-1",
        userId: "user-1",
        title: "The Hobbit",
        creator: "J.R.R. Tolkien",
        year: 1937,
        provider: "goodreads",
        providerId: "5907",
        imageUrl: "https://covers.openlibrary.org/b/id/101-M.jpg",
        description: null,
        created_at: "2024-01-01T00:00:00.000Z",
        parentId: null,
        position: null,
        mediaType: { id: "mt-book", name: "book", created_at: "2024-01-01T00:00:00.000Z", userId: "user-1" },
        details: {
          url: "https://www.goodreads.com/book/show/5907",
          openLibraryWorkKey: "/works/OL262758W",
        },
        syncedAt: "2024-01-01T12:00:00.000Z",
        genres: ["Fantasy", "Classics"],
      },
    }

    renderWithProviders(
      <LogActions log={syncedGoodreadsLog} onEdit={onEdit} onDelete={onDelete} />
    )

    const menuBtn = screen.getByRole("button", { name: `Actions for ${syncedGoodreadsLog.media.title}` })
    await user.click(menuBtn)

    const goodreadsLink = screen.getByRole("menuitem", { name: /View on Goodreads/i })
    expect(goodreadsLink).toBeInTheDocument()
    expect(goodreadsLink.closest("a")).toHaveAttribute("href", "https://www.goodreads.com/book/show/5907")

    const olLink = screen.getByRole("menuitem", { name: /View on Open Library/i })
    expect(olLink).toBeInTheDocument()
    expect(olLink.closest("a")).toHaveAttribute("href", "https://openlibrary.org/works/OL262758W")
  })
})
