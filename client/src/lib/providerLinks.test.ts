import { describe, expect, it } from "vitest"
import { providerLinks } from "./providerLinks"

describe("providerLinks (G5, T2)", () => {
  it("returns 'View on Goodreads' for an unsynced Goodreads book", () => {
    const links = providerLinks({
      source: "goodreads",
      sourceId: "12345",
      title: "Test Book",
      creator: "Test Author",
      metadata: {
        url: "https://www.goodreads.com/book/show/12345",
      },
    })

    expect(links).toEqual([
      { label: "View on Goodreads", href: "https://www.goodreads.com/book/show/12345" },
    ])
  })

  it("returns both 'View on Goodreads' and 'View on Open Library' once synced via openLibraryWorkKey", () => {
    const links = providerLinks({
      source: "goodreads",
      sourceId: "12345",
      title: "Test Book",
      creator: "Test Author",
      metadata: {
        url: "https://www.goodreads.com/book/show/12345",
        openLibraryWorkKey: "/works/OL45804W",
        olSyncedAt: "2026-11-18T00:00:00.000Z",
      },
    })

    expect(links).toEqual([
      { label: "View on Goodreads", href: "https://www.goodreads.com/book/show/12345" },
      { label: "View on Open Library", href: "https://openlibrary.org/works/OL45804W" },
    ])
  })

  it("returns both 'View on Goodreads' and 'View on Open Library' when openlibrary is in externalIds", () => {
    const links = providerLinks({
      source: "goodreads",
      sourceId: "12345",
      title: "Test Book",
      creator: "Test Author",
      metadata: {
        url: "https://www.goodreads.com/book/show/12345",
      },
      externalIds: [
        { provider: "goodreads", externalId: "12345" },
        { provider: "openlibrary", externalId: "OL99999W" },
      ],
    })

    expect(links).toEqual([
      { label: "View on Goodreads", href: "https://www.goodreads.com/book/show/12345" },
      { label: "View on Open Library", href: "https://openlibrary.org/works/OL99999W" },
    ])
  })

  it("does not duplicate 'View on Open Library' for standard open_library source", () => {
    const links = providerLinks({
      source: "open_library",
      sourceId: "/works/OL45804W",
      title: "Fantastic Mr Fox",
      creator: "Roald Dahl",
      metadata: {
        url: "https://openlibrary.org/works/OL45804W",
      },
    })

    expect(links).toHaveLength(1)
    expect(links[0]).toEqual({
      label: "View on Open Library",
      href: "https://openlibrary.org/works/OL45804W",
    })
  })
})
