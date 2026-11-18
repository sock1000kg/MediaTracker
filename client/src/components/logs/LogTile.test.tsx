// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { renderWithProviders } from "@/test/render"
import { LogTile } from "./LogTile"
import type { Log } from "@/types/mainTypes"
import * as searchApi from "@/api/search"

vi.mock("@/api/search", () => ({
  getAlbumTracks: vi.fn().mockRejectedValue(new Error("Default test tracklist not loaded")),
}))

describe("LogTile component with expanded children", () => {
  const onEdit = vi.fn()
  const onDelete = vi.fn()

  const dummyMediaType = {
    id: "018f0000-0000-7000-8000-000000000001",
    userId: "018f0000-0000-7000-8000-000000000001",
    name: "music",
    created_at: "2024-01-01T00:00:00.000Z",
  }

  const parentAlbumLog: Log = {
    id: "018f0000-0000-7000-8000-000000000010",
    rating: 98,
    status: "completed",
    notes: "Masterpiece",
    logged_at: "2024-01-18T22:00:00.000Z",
    started_at: null,
    finished_at: null,
    tags: [],
    media: {
      id: "018f0000-0000-7000-8000-000000000100",
      userId: "018f0000-0000-7000-8000-000000000001",
      title: "Loveless",
      creator: "my bloody valentine",
      year: 1991,
      provider: "lastfm",
      providerId: "mbid-loveless",
      imageUrl: "https://cover.jpg",
      description: null,
      created_at: "2024-01-01T00:00:00.000Z",
      parentId: null,
      position: null,
      mediaType: dummyMediaType,
      subtype: "album",
      details: { mbReleaseGroupId: "rg-loveless" },
      childSummary: {
        rated: 1,
        avgRating: 100,
      },
    },
  }

  const childTrack1Log: Log = {
    id: "018f0000-0000-7000-8000-000000000020",
    rating: 100,
    status: "completed",
    notes: "",
    logged_at: "2024-01-18T22:05:00.000Z",
    started_at: null,
    finished_at: null,
    tags: [],
    media: {
      id: "018f0000-0000-7000-8000-000000000101",
      userId: "018f0000-0000-7000-8000-000000000001",
      title: "Only Shallow",
      creator: "my bloody valentine",
      year: 1991,
      provider: "lastfm",
      providerId: "track-1",
      imageUrl: null,
      description: null,
      created_at: "2024-01-01T00:00:00.000Z",
      parentId: "018f0000-0000-7000-8000-000000000100",
      position: 1,
      mediaType: dummyMediaType,
      subtype: "track",
      details: { trackNumber: 1 },
    },
  }

  it("renders LogTile, expands album tracks, and shows Edit buttons", async () => {
    const user = userEvent.setup()
    vi.mocked(searchApi.getAlbumTracks).mockResolvedValueOnce({
      album: {
        mediaType: "music" as const,
        subtype: "album" as const,
        title: "Loveless",
        creator: "my bloody valentine",
        source: "musicbrainz",
        sourceId: "rg-loveless",
        imageUrl: null,
        details: {},
      },
      tracks: [
        {
          mediaType: "music" as const,
          subtype: "track" as const,
          title: "Only Shallow",
          creator: "my bloody valentine",
          source: "musicbrainz",
          sourceId: "track-1",
          imageUrl: null,
          details: { trackNumber: 1 },
        },
        {
          mediaType: "music" as const,
          subtype: "track" as const,
          title: "Loomer",
          creator: "my bloody valentine",
          source: "musicbrainz",
          sourceId: "track-2",
          imageUrl: null,
          details: { trackNumber: 2 },
        },
      ],
      provider: "musicbrainz" as const,
    })

    renderWithProviders(
      <LogTile
        log={parentAlbumLog}
        childrenLogs={[childTrack1Log]}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    )

    expect(screen.getByText("Loveless")).toBeInTheDocument()

    const expandBtn = screen.getByRole("button", { name: /1 track rated · avg 100/i })
    await user.click(expandBtn)

    expect(await screen.findByText(/1\. Only Shallow/)).toBeInTheDocument()
    expect(screen.getByText(/2\. Loomer/)).toBeInTheDocument()
    expect(screen.getByText("100")).toBeInTheDocument()
    expect(screen.getByText("–")).toBeInTheDocument()

    const editButtons = screen.getAllByRole("button", { name: "Edit" })
    expect(editButtons).toHaveLength(2)
  })
})
