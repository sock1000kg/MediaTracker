// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { renderWithProviders } from "@/test/render"
import { MediaActions } from "./MediaActions"
import * as mediaApi from "@/api/media"
import type { Media } from "@/types/mainTypes"

vi.mock("@/api/media", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/media")>()
  return {
    ...actual,
    refreshMedia: vi.fn(),
  }
})

describe("MediaActions component (T2)", () => {
  const onEdit = vi.fn()
  const onDelete = vi.fn()
  const onLog = vi.fn()

  const providerMedia: Media = {
    id: "media-provider-2",
    userId: "user-1",
    title: "Catan",
    creator: "Klaus Teuber",
    year: 1995,
    source: "bgg",
    sourceId: "13",
    imageUrl: "https://cf.geekdo-images.com/test.jpg",
    description: "In Catan...",
    created_at: "2024-01-01T00:00:00.000Z",
    parentId: null,
    position: null,
    mediaType: { id: "mt-2", name: "boardgame", created_at: "2024-01-01T00:00:00.000Z", userId: "user-1" },
    metadata: { kind: "boardgame" },
  }

  const customMedia: Media = {
    id: "media-custom-2",
    userId: "user-1",
    title: "My DIY Game",
    creator: "Me",
    year: 2024,
    source: "custom",
    sourceId: "custom-2",
    imageUrl: null,
    description: null,
    created_at: "2024-01-01T00:00:00.000Z",
    parentId: null,
    position: null,
    mediaType: { id: "mt-2", name: "boardgame", created_at: "2024-01-01T00:00:00.000Z", userId: "user-1" },
    metadata: undefined,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("shows 'Refresh from provider' for provider media and calls the endpoint", async () => {
    const user = userEvent.setup()
    vi.mocked(mediaApi.refreshMedia).mockResolvedValue(providerMedia)

    renderWithProviders(
      <MediaActions media={providerMedia} logged={false} onEdit={onEdit} onDelete={onDelete} onLog={onLog} />
    )

    const menuBtn = screen.getByRole("button", { name: `Actions for ${providerMedia.title}` })
    await user.click(menuBtn)

    const refreshItem = screen.getByText("Refresh from provider")
    expect(refreshItem).toBeInTheDocument()

    await user.click(refreshItem)
    expect(mediaApi.refreshMedia).toHaveBeenCalledWith("media-provider-2")
  })

  it("does not show 'Refresh from provider' for custom media", async () => {
    const user = userEvent.setup()

    renderWithProviders(
      <MediaActions media={customMedia} logged={false} onEdit={onEdit} onDelete={onDelete} onLog={onLog} />
    )

    const menuBtn = screen.getByRole("button", { name: `Actions for ${customMedia.title}` })
    await user.click(menuBtn)

    expect(screen.queryByText("Refresh from provider")).not.toBeInTheDocument()
  })

  it("shows error toast with server error message on refresh failure", async () => {
    const user = userEvent.setup()
    vi.mocked(mediaApi.refreshMedia).mockRejectedValue(new Error("Provider is unavailable"))

    renderWithProviders(
      <MediaActions media={providerMedia} logged={false} onEdit={onEdit} onDelete={onDelete} onLog={onLog} />
    )

    const menuBtn = screen.getByRole("button", { name: `Actions for ${providerMedia.title}` })
    await user.click(menuBtn)

    const refreshItem = screen.getByText("Refresh from provider")
    await user.click(refreshItem)

    await waitFor(() => {
      const alert = screen.getByRole("alert")
      expect(alert).toHaveTextContent("Provider is unavailable")
    })
  })
})
