import { describe, expect, it } from "vitest"
import { providerLinks } from "./providerLinks"
import { CLIENT_PROVIDERS } from "./providers"

describe("providerLinks (G5, T2)", () => {
  describe("URL generation from IDs alone for each provider", () => {
    it("generates TMDB movie link from IDs alone", () => {
      const links = providerLinks({
        provider: "tmdb",
        providerId: "550",
        mediaType: "movie",
      })
      expect(links).toEqual([
        { label: "View on TMDB", href: "https://www.themoviedb.org/movie/550" },
      ])
    })

    it("generates TMDB show link from IDs alone", () => {
      const links = providerLinks({
        provider: "tmdb",
        providerId: "1399",
        mediaType: "tv",
      })
      expect(links).toEqual([
        { label: "View on TMDB", href: "https://www.themoviedb.org/tv/1399" },
      ])
    })

    it("generates RAWG link using slug when available", () => {
      const links = providerLinks({
        provider: "rawg",
        providerId: "3498",
        details: { slug: "grand-theft-auto-v" },
      })
      expect(links).toEqual([
        { label: "View on RAWG", href: "https://rawg.io/games/grand-theft-auto-v" },
      ])
    })

    it("generates RAWG link falling back to providerId when no slug", () => {
      const links = providerLinks({
        provider: "rawg",
        providerId: "3498",
      })
      expect(links).toEqual([
        { label: "View on RAWG", href: "https://rawg.io/games/3498" },
      ])
    })

    it("generates Open Library link from work key or providerId", () => {
      const links = providerLinks({
        provider: "openlibrary",
        providerId: "OL123W",
      })
      expect(links).toEqual([
        { label: "View on Open Library", href: "https://openlibrary.org/works/OL123W" },
      ])
    })

    it("generates Goodreads link from providerId alone", () => {
      const links = providerLinks({
        provider: "goodreads",
        providerId: "2767052",
      })
      expect(links).toEqual([
        { label: "View on Goodreads", href: "https://www.goodreads.com/book/show/2767052" },
      ])
    })

    it("generates BoardGameGeek link from providerId alone", () => {
      const links = providerLinks({
        provider: "bgg",
        providerId: "13",
      })
      expect(links).toEqual([
        { label: "View on BoardGameGeek", href: "https://boardgamegeek.com/boardgame/13" },
      ])
    })

    it("generates AniList link from providerId alone", () => {
      const links = providerLinks({
        provider: "anilist",
        providerId: "1",
      })
      expect(links).toEqual([
        { label: "View on AniList", href: "https://anilist.co/anime/1" },
      ])
    })

    it("generates MusicBrainz release-group link when releaseGroupId is present", () => {
      const links = providerLinks({
        provider: "musicbrainz",
        details: { releaseGroupId: "uuid-rg" },
      })
      expect(links).toEqual([
        { label: "View on MusicBrainz", href: "https://musicbrainz.org/release-group/uuid-rg" },
      ])
    })

    it("generates MusicBrainz recording link falling back to details.recordingId", () => {
      const links = providerLinks({
        provider: "musicbrainz",
        details: { recordingId: "uuid-rec" },
      })
      expect(links).toEqual([
        { label: "View on MusicBrainz", href: "https://musicbrainz.org/recording/uuid-rec" },
      ])
    })

    it("generates MusicBrainz link falling back to providerId as release-group", () => {
      const links = providerLinks({
        provider: "musicbrainz",
        providerId: "uuid-source",
      })
      expect(links).toEqual([
        { label: "View on MusicBrainz", href: "https://musicbrainz.org/release-group/uuid-source" },
      ])
    })
  })

  describe("Fallback to details.url on legacy records", () => {
    it("uses details.url ONLY if no id can be built", () => {
      // With providerId, dynamic URL is built even if legacy url is different
      const linksWithId = providerLinks({
        provider: "tmdb",
        providerId: "550",
        mediaType: "movie",
        details: { url: "https://legacy.example.com/custom-tmdb-link" },
      })
      expect(linksWithId).toEqual([
        { label: "View on TMDB", href: "https://www.themoviedb.org/movie/550" },
      ])

      // Without source or provider id builder, falls back to details.url
      const linksLegacy = providerLinks({
        provider: "legacy-source",
        details: { url: "https://legacy.example.com/item/42" },
      })
      expect(linksLegacy).toEqual([
        { label: "View on legacy.example.com", href: "https://legacy.example.com/item/42" },
      ])
    })
  })

  describe("Search credit lines and client registry attributions", () => {
    it("verifies attributions exist and contain required URLs for all search providers", () => {
      expect(CLIENT_PROVIDERS.tmdb.attribution.text).toContain("TMDB")
      expect(CLIENT_PROVIDERS.tmdb.attribution.href).toBe("https://www.themoviedb.org")

      expect(CLIENT_PROVIDERS.rawg.attribution.text).toContain("RAWG")
      expect(CLIENT_PROVIDERS.rawg.attribution.href).toBe("https://rawg.io")

      expect(CLIENT_PROVIDERS.bgg.attribution.text).toContain("BoardGameGeek")
      expect(CLIENT_PROVIDERS.bgg.attribution.href).toBe("https://boardgamegeek.com")

      expect(CLIENT_PROVIDERS.openlibrary.attribution.text).toContain("Open Library")
      expect(CLIENT_PROVIDERS.openlibrary.attribution.href).toBe("https://openlibrary.org")

      expect(CLIENT_PROVIDERS.anilist.attribution.text).toContain("AniList")
      expect(CLIENT_PROVIDERS.anilist.attribution.href).toBe("https://anilist.co")

      expect(CLIENT_PROVIDERS.musicbrainz.attribution.text).toContain("MusicBrainz")
      expect(CLIENT_PROVIDERS.musicbrainz.attribution.href).toBe("https://musicbrainz.org")

      expect(CLIENT_PROVIDERS.lastfm.attribution.text).toContain("Last.fm")
      expect(CLIENT_PROVIDERS.lastfm.attribution.href).toBe("https://www.last.fm")
    })
  })

  describe("Existing Goodreads / Open Library sync links", () => {
    it("returns 'View on Goodreads' for an unsynced Goodreads book", () => {
      const links = providerLinks({
        provider: "goodreads",
        providerId: "12345",
        title: "Test Book",
        creator: "Test Author",
      })

      expect(links).toEqual([
        { label: "View on Goodreads", href: "https://www.goodreads.com/book/show/12345" },
      ])
    })

    it("returns both 'View on Goodreads' and 'View on Open Library' once synced via openLibraryWorkKey", () => {
      const links = providerLinks({
        provider: "goodreads",
        providerId: "12345",
        title: "Test Book",
        creator: "Test Author",
        details: {
          openLibraryWorkKey: "/works/OL45804W",
        },
      })

      expect(links).toEqual([
        { label: "View on Goodreads", href: "https://www.goodreads.com/book/show/12345" },
        { label: "View on Open Library", href: "https://openlibrary.org/works/OL45804W" },
      ])
    })

    it("returns both 'View on Goodreads' and 'View on Open Library' when openlibrary is in externalIds", () => {
      const links = providerLinks({
        provider: "goodreads",
        providerId: "12345",
        title: "Test Book",
        creator: "Test Author",
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

    it("does not duplicate 'View on Open Library' for standard openlibrary provider", () => {
      const links = providerLinks({
        provider: "openlibrary",
        providerId: "/works/OL45804W",
        title: "Fantastic Mr Fox",
        creator: "Roald Dahl",
      })

      expect(links).toHaveLength(1)
      expect(links[0]).toEqual({
        label: "View on Open Library",
        href: "https://openlibrary.org/works/OL45804W",
      })
    })
  })
})
