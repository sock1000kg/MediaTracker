// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { renderWithProviders } from "@/test/render"
import { LogRow } from "./LogRow"
import type { Log } from "@/types/mainTypes"

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
})
