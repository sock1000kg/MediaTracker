// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { renderWithProviders } from "@/test/render"
import { LogRow } from "./LogRow"
import type { Log } from "@/types/mainTypes"
import * as searchApi from "@/api/search"

vi.mock("@/api/search", () => ({
  getAlbumTracks: vi.fn().mockRejectedValue(new Error("Default test tracklist not loaded")),
}))

describe("LogRow component with children logs", () => {
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
      source: "lastfm",
      sourceId: "mbid-loveless",
      imageUrl: "https://cover.jpg",
      description: null,
      created_at: "2024-01-01T00:00:00.000Z",
      parentId: null,
      position: null,
      mediaType: dummyMediaType,
      metadata: { kind: "album" },
      childSummary: {
        rated: 2,
        avgRating: 96,
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
      source: "lastfm",
      sourceId: "track-1",
      imageUrl: null,
      description: null,
      created_at: "2024-01-01T00:00:00.000Z",
      parentId: "018f0000-0000-7000-8000-000000000100",
      position: 1,
      mediaType: dummyMediaType,
      metadata: { kind: "track", trackNumber: 1, durationSec: 257 },
    },
  }

  const childTrack2Log: Log = {
    id: "018f0000-0000-7000-8000-000000000030",
    rating: 92,
    status: "completed",
    notes: "",
    logged_at: "2024-01-18T22:10:00.000Z",
    started_at: null,
    finished_at: null,
    tags: [],
    media: {
      id: "018f0000-0000-7000-8000-000000000102",
      userId: "018f0000-0000-7000-8000-000000000001",
      title: "Loomer",
      creator: "my bloody valentine",
      year: 1991,
      source: "lastfm",
      sourceId: "track-2",
      imageUrl: null,
      description: null,
      created_at: "2024-01-01T00:00:00.000Z",
      parentId: "018f0000-0000-7000-8000-000000000100",
      position: 2,
      mediaType: dummyMediaType,
      metadata: { kind: "track", trackNumber: 2, durationSec: 158 },
    },
  }

  it("renders parent row with childSummary '2 tracks rated · avg 96' and expands children", async () => {
    const user = userEvent.setup()

    renderWithProviders(
      <LogRow
        log={parentAlbumLog}
        childrenLogs={[childTrack1Log, childTrack2Log]}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    )

    expect(screen.getByText("Loveless")).toBeInTheDocument()
    expect(screen.getByText("2 tracks rated · avg 96")).toBeInTheDocument()

    const expandBtn = screen.getByRole("button", { name: /expand/i })
    expect(expandBtn).toHaveAttribute("aria-expanded", "false")

    // Children not visible initially
    expect(screen.queryByText("Only Shallow")).not.toBeInTheDocument()
    expect(screen.queryByText("Loomer")).not.toBeInTheDocument()

    // Expand
    await user.click(expandBtn)
    expect(expandBtn).toHaveAttribute("aria-expanded", "true")

    expect(screen.getByText(/Only Shallow/)).toBeInTheDocument()
    expect(screen.getByText(/Loomer/)).toBeInTheDocument()
    expect(screen.getByText("100")).toBeInTheDocument()
    expect(screen.getByText("92")).toBeInTheDocument()

    // Collapse
    await user.click(expandBtn)
    expect(expandBtn).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByText("Only Shallow")).not.toBeInTheDocument()
  })

  it("shows 'from <album>' subtitle for child log when not grouped under parent", () => {
    renderWithProviders(
      <LogRow
        log={{
          ...childTrack1Log,
          media: {
            ...childTrack1Log.media,
            parent: {
              id: "10",
              title: "Loveless",
              creator: "my bloody valentine",
            },
          },
        }}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    )

    expect(screen.getByText("Only Shallow")).toBeInTheDocument()
    expect(screen.getByText("from Loveless")).toBeInTheDocument()
  })

  it("an album with no rated tracks can still be expanded; a book has no Expand", async () => {
    const user = userEvent.setup()
    const unratedAlbum: Log = { ...parentAlbumLog, media: { ...parentAlbumLog.media, childSummary: undefined } }
    renderWithProviders(<LogRow log={unratedAlbum} onEdit={onEdit} onDelete={onDelete} childrenLogs={[]} />)
    expect(screen.queryByText(/tracks rated/)).toBeNull()
    await user.click(screen.getByRole("button", { name: /expand/i }))
    expect(screen.getByText("No tracks logged yet.")).toBeTruthy()

    const book: Log = {
      ...parentAlbumLog,
      id: "018f0000-0000-7000-8000-000000000099",
      media: { ...parentAlbumLog.media, id: "018f0000-0000-7000-8000-000000000999", metadata: {}, childSummary: undefined, mediaType: { ...dummyMediaType, name: "book" } },
    }
    renderWithProviders(<LogRow log={book} onEdit={onEdit} onDelete={onDelete} />)
    expect(screen.getAllByRole("button", { name: /expand|hide/i })).toHaveLength(1)
  })

  it("T2: renders categories from media.genres for a synced Goodreads book", () => {
    const syncedBookLog: Log = {
      id: "log-book-1",
      rating: 90,
      status: "completed",
      notes: "",
      logged_at: "2024-01-01T00:00:00.000Z",
      started_at: null,
      finished_at: null,
      tags: [],
      media: {
        id: "media-book-1",
        userId: "user-1",
        title: "Dune",
        creator: "Frank Herbert",
        year: 1965,
        source: "goodreads",
        sourceId: "gr-dune",
        imageUrl: "https://cover.jpg",
        description: null,
        created_at: "2024-01-01T00:00:00.000Z",
        parentId: null,
        position: null,
        mediaType: { ...dummyMediaType, name: "book" },
        metadata: {
          url: "https://www.goodreads.com/book/show/gr-dune",
          openLibraryWorkKey: "/works/OL893415W",
          olSyncedAt: "2024-01-01T12:00:00.000Z",
        },
        genres: ["Science Fiction", "Space Opera"],
      },
    }

    renderWithProviders(<LogRow log={syncedBookLog} onEdit={onEdit} onDelete={onDelete} />)
    expect(screen.getByText("Science Fiction")).toBeInTheDocument()
    expect(screen.getByText("Space Opera")).toBeInTheDocument()
  })

  describe("T2: Expanded Album Tracklist and TV Seasons", () => {
    const dummyTvType = {
      id: "018f0000-0000-7000-8000-000000000002",
      userId: "018f0000-0000-7000-8000-000000000001",
      name: "tv",
      created_at: "2024-01-01T00:00:00.000Z",
    }

    const mock5Tracks = {
      album: {
        mediaType: "music" as const,
        title: "Loveless",
        creator: "my bloody valentine",
        source: "musicbrainz",
        sourceId: "rg-loveless-123",
        imageUrl: null,
        metadata: { kind: "album" as const, mbReleaseGroupId: "rg-loveless-123" },
      },
      tracks: [
        {
          mediaType: "music" as const,
          title: "Only Shallow",
          creator: "my bloody valentine",
          source: "musicbrainz",
          sourceId: "mb-track-1",
          imageUrl: null,
          metadata: { kind: "track" as const, trackNumber: 1 },
        },
        {
          mediaType: "music" as const,
          title: "Loomer",
          creator: "my bloody valentine",
          source: "musicbrainz",
          sourceId: "mb-track-2",
          imageUrl: null,
          metadata: { kind: "track" as const, trackNumber: 2 },
        },
        {
          mediaType: "music" as const,
          title: "Touched",
          creator: "my bloody valentine",
          source: "musicbrainz",
          sourceId: "mb-track-3",
          imageUrl: null,
          metadata: { kind: "track" as const, trackNumber: 3 },
        },
        {
          mediaType: "music" as const,
          title: "To Here Knows When",
          creator: "my bloody valentine",
          source: "musicbrainz",
          sourceId: "mb-track-4",
          imageUrl: null,
          metadata: { kind: "track" as const, trackNumber: 4 },
        },
        {
          mediaType: "music" as const,
          title: "When You Sleep",
          creator: "my bloody valentine",
          source: "musicbrainz",
          sourceId: "mb-track-5",
          imageUrl: null,
          metadata: { kind: "track" as const, trackNumber: 5 },
        },
      ],
      provider: "musicbrainz" as const,
    }

    it("an expanded album with 2 of 5 tracks logged shows 5 rows: 2 with ratings, 3 with '–', and every row has the same 'Edit' button. 'Edit' on an unlogged track opens the log dialog for that track", async () => {
      const user = userEvent.setup()
      vi.mocked(searchApi.getAlbumTracks).mockResolvedValueOnce(mock5Tracks)

      renderWithProviders(
        <LogRow
          log={parentAlbumLog}
          childrenLogs={[childTrack1Log, childTrack2Log]}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      )

      const expandBtn = screen.getByRole("button", { name: /expand/i })
      await user.click(expandBtn)

      // 5 track titles
      expect(await screen.findByText(/1\. Only Shallow/)).toBeInTheDocument()
      expect(screen.getByText(/2\. Loomer/)).toBeInTheDocument()
      expect(screen.getByText(/3\. Touched/)).toBeInTheDocument()
      expect(screen.getByText(/4\. To Here Knows When/)).toBeInTheDocument()
      expect(screen.getByText(/5\. When You Sleep/)).toBeInTheDocument()

      // Ratings: 2 with ratings (100, 92), 3 with "–"
      expect(screen.getByText("100")).toBeInTheDocument()
      expect(screen.getByText("92")).toBeInTheDocument()
      const dashes = screen.getAllByText("–")
      expect(dashes.length).toBeGreaterThanOrEqual(3)

      // Every row has the same "Edit" button (5 track rows + 1 album action menu)
      const editButtons = screen.getAllByRole("button", { name: "Edit" })
      expect(editButtons).toHaveLength(5)

      // "Edit" on an unlogged track (Track 3: Touched) opens the log dialog
      await user.click(editButtons[2])
      expect(await screen.findByRole("dialog")).toBeInTheDocument()
      expect(screen.getByText(/Logging for/i)).toBeInTheDocument()
      expect(screen.getByText("Touched")).toBeInTheDocument()
    })

    it("a logged bonus track not on the tracklist is listed at the end", async () => {
      const user = userEvent.setup()
      vi.mocked(searchApi.getAlbumTracks).mockResolvedValueOnce(mock5Tracks)

      const bonusTrackLog: Log = {
        id: "log-bonus-track",
        rating: 88,
        status: "completed",
        notes: "",
        logged_at: "2024-01-18T22:30:00.000Z",
        started_at: null,
        finished_at: null,
        tags: [],
        media: {
          id: "media-bonus-track",
          userId: "018f0000-0000-7000-8000-000000000001",
          title: "Sugar (Bonus Track)",
          creator: "my bloody valentine",
          year: 1991,
          source: "lastfm",
          sourceId: "track-bonus",
          imageUrl: null,
          description: null,
          created_at: "2024-01-01T00:00:00.000Z",
          parentId: parentAlbumLog.media.id,
          position: 99,
          mediaType: dummyMediaType,
          metadata: { kind: "track", trackNumber: 99 },
        },
      }

      renderWithProviders(
        <LogRow
          log={parentAlbumLog}
          childrenLogs={[childTrack1Log, childTrack2Log, bonusTrackLog]}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      )

      await user.click(screen.getByRole("button", { name: /expand/i }))

      // 5 tracklist tracks
      expect(await screen.findByText(/1\. Only Shallow/)).toBeInTheDocument()
      expect(screen.getByText(/5\. When You Sleep/)).toBeInTheDocument()

      // Bonus track listed at the end
      expect(screen.getByText(/Sugar \(Bonus Track\)/)).toBeInTheDocument()
      expect(screen.getByText("88")).toBeInTheDocument()

      // Total 6 rows with Edit buttons
      const editButtons = screen.getAllByRole("button", { name: "Edit" })
      expect(editButtons).toHaveLength(6)
    })

    it("a failed tracklist falls back to the logged tracks with the note", async () => {
      const user = userEvent.setup()
      vi.mocked(searchApi.getAlbumTracks).mockRejectedValueOnce(new Error("MusicBrainz 503"))

      renderWithProviders(
        <LogRow
          log={parentAlbumLog}
          childrenLogs={[childTrack1Log, childTrack2Log]}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      )

      await user.click(screen.getByRole("button", { name: /expand/i }))

      expect(await screen.findByText(/Couldn't load the full tracklist/i)).toBeInTheDocument()
      expect(screen.getByText(/1\. Only Shallow/)).toBeInTheDocument()
      expect(screen.getByText(/2\. Loomer/)).toBeInTheDocument()
      expect(screen.getByText("100")).toBeInTheDocument()
      expect(screen.getByText("92")).toBeInTheDocument()
      expect(screen.queryByText(/Touched/)).not.toBeInTheDocument()
    })

    it("a show with seasonCount: 3 and season 2 logged shows 3 rows. 'Edit' on season 1 opens the log dialog for season 1", async () => {
      const user = userEvent.setup()

      const parentShowLog: Log = {
        id: "log-show-1",
        rating: 90,
        status: "completed",
        notes: "",
        logged_at: "2024-01-01T00:00:00.000Z",
        started_at: null,
        finished_at: null,
        tags: [],
        media: {
          id: "media-show-1",
          userId: "user-1",
          title: "Severance",
          creator: "Dan Erickson",
          year: 2022,
          source: "tmdb",
          sourceId: "tv:95396",
          imageUrl: "https://cover.jpg",
          description: null,
          created_at: "2024-01-01T00:00:00.000Z",
          parentId: null,
          position: null,
          mediaType: dummyTvType,
          metadata: { kind: "show", tmdbId: 95396, seasonCount: 3 },
        },
      }

      const childSeason2Log: Log = {
        id: "log-season-2",
        rating: 96,
        status: "completed",
        notes: "",
        logged_at: "2024-01-02T00:00:00.000Z",
        started_at: null,
        finished_at: null,
        tags: [],
        media: {
          id: "media-season-2",
          userId: "user-1",
          title: "Severance: Season 2",
          creator: "Dan Erickson",
          year: 2025,
          source: "tmdb",
          sourceId: "tv:95396:s2",
          imageUrl: null,
          description: null,
          created_at: "2024-01-02T00:00:00.000Z",
          parentId: "media-show-1",
          position: 2,
          mediaType: dummyTvType,
          metadata: { kind: "season", tmdbId: 95396, seasonNumber: 2 },
        },
      }

      // Render show with 3 seasons and season 2 logged
      renderWithProviders(
        <LogRow
          log={parentShowLog}
          childrenLogs={[childSeason2Log]}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      )

      const expandBtn = screen.getByRole("button", { name: /expand/i })
      await user.click(expandBtn)

      // Shows 3 rows: Season 1, Season 2, Season 3
      expect(await screen.findByText("Season 1")).toBeInTheDocument()
      expect(screen.getByText("Season 2")).toBeInTheDocument()
      expect(screen.getByText("Season 3")).toBeInTheDocument()

      // Season 2 has rating 96, seasons 1 and 3 show "–"
      expect(screen.getByText("96")).toBeInTheDocument()

      const editButtons = screen.getAllByRole("button", { name: "Edit" })
      expect(editButtons).toHaveLength(3)

      // "Edit" on season 1 opens the log dialog for season 1
      await user.click(editButtons[0])
      expect(await screen.findByRole("dialog")).toBeInTheDocument()
      expect(screen.getByText(/Logging for/i)).toBeInTheDocument()
      expect(screen.getByText(/Severance: Season 1/i)).toBeInTheDocument()
    })

    it("a show with 0 seasons shows 'No seasons' when expanded", async () => {
      const user = userEvent.setup()

      const zeroSeasonsShowLog: Log = {
        id: "log-show-0",
        rating: 80,
        status: "completed",
        notes: "",
        logged_at: "2024-01-01T00:00:00.000Z",
        started_at: null,
        finished_at: null,
        tags: [],
        media: {
          id: "media-show-0",
          userId: "user-1",
          title: "Mini Doc",
          creator: "Creator",
          year: 2024,
          source: "tmdb",
          sourceId: "tv:11111",
          imageUrl: null,
          description: null,
          created_at: "2024-01-01T00:00:00.000Z",
          parentId: null,
          position: null,
          mediaType: dummyTvType,
          metadata: { kind: "show", tmdbId: 11111, seasonCount: 0 },
        },
      }

      renderWithProviders(
        <LogRow
          log={zeroSeasonsShowLog}
          childrenLogs={[]}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      )

      const expandBtn = screen.getByRole("button", { name: /expand/i })
      await user.click(expandBtn)

      expect(await screen.findByText("No seasons")).toBeInTheDocument()
    })
  })
})
