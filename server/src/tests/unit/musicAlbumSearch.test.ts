import { jest } from "@jest/globals"
import { musicSearchService } from "@/services/search/lastFmSearchService.js"
import { musicBrainzClient } from "@/services/search/musicBrainzClient.js"

describe("Album search with release-group covers", () => {
    afterEach(() => {
        jest.restoreAllMocks()
        musicBrainzClient.releaseGroupCache.clear()
        musicBrainzClient.limiter.reset()
    })

    test("three albums: MusicBrainz returns release groups for two in one request; third gets null", async () => {
        jest.spyOn(musicSearchService, "getUserApiKey").mockResolvedValue("test-api-key")

        // Mock Last.fm album.search returning 3 albums with mbids
        const mockLastFmResponse = {
            results: {
                "opensearch:totalResults": "3",
                albummatches: {
                    album: [
                        { name: "Carrie & Lowell", artist: "Sufjan Stevens", mbid: "mbid-carrie", url: "https://last.fm/carrie" },
                        { name: "Drukqs", artist: "Aphex Twin", mbid: "mbid-drukqs", url: "https://last.fm/drukqs" },
                        { name: "Rare Album", artist: "Unknown Artist", mbid: "mbid-rare", url: "https://last.fm/rare" },
                    ],
                },
            },
        }

        // Mock global.fetch for Last.fm API
        const originalFetch = global.fetch
        global.fetch = jest.fn<typeof fetch>().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => mockLastFmResponse,
        } as Response)

        // Mock MusicBrainz batch search returning release groups for 2 of the 3 in ONE request
        const mbSpy = jest.spyOn(musicBrainzClient, "fetchJson").mockResolvedValue({
            releases: [
                {
                    id: "mbid-carrie",
                    "release-group": { id: "rg-carrie-123", "primary-type": "Album" },
                },
                {
                    id: "mbid-drukqs",
                    "release-group": { id: "rg-drukqs-456", "primary-type": "Album" },
                },
                // mbid-rare is NOT returned by MusicBrainz
            ],
        })

        const { results } = await musicSearchService.searchAlbumsLastFm("user-1", "ambient")

        expect(results).toHaveLength(3)

        // MusicBrainz was called exactly ONCE with a batch query containing the IDs
        expect(mbSpy).toHaveBeenCalledTimes(1)
        const calledUrl = decodeURIComponent(mbSpy.mock.calls[0][0])
        expect(calledUrl).toContain("reid:")
        expect(calledUrl).toContain("mbid-carrie")
        expect(calledUrl).toContain("mbid-drukqs")
        expect(calledUrl).toContain("mbid-rare")

        // The two found albums get release-group URLs
        expect(results[0].title).toBe("Carrie & Lowell")
        expect(results[0].imageUrl).toBe("https://coverartarchive.org/release-group/rg-carrie-123/front-250")

        expect(results[1].title).toBe("Drukqs")
        expect(results[1].imageUrl).toBe("https://coverartarchive.org/release-group/rg-drukqs-456/front-250")

        // The third album whose release was not found gets null
        expect(results[2].title).toBe("Rare Album")
        expect(results[2].imageUrl).toBeNull()

        global.fetch = originalFetch
    })

    test("a MusicBrainz failure still returns results with null covers without failing search", async () => {
        jest.spyOn(musicSearchService, "getUserApiKey").mockResolvedValue("test-api-key")

        const mockLastFmResponse = {
            results: {
                "opensearch:totalResults": "2",
                albummatches: {
                    album: [
                        { name: "Album 1", artist: "Artist 1", mbid: "mbid-1", url: "https://last.fm/1" },
                        { name: "Album 2", artist: "Artist 2", mbid: "mbid-2", url: "https://last.fm/2" },
                    ],
                },
            },
        }

        const originalFetch = global.fetch
        global.fetch = jest.fn<typeof fetch>().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => mockLastFmResponse,
        } as Response)

        // MusicBrainz throws 503 or network failure
        jest.spyOn(musicBrainzClient, "fetchJson").mockRejectedValue(new Error("MusicBrainz 503 Gateway Timeout"))

        const { results } = await musicSearchService.searchAlbumsLastFm("user-1", "rock")

        expect(results).toHaveLength(2)
        expect(results[0].imageUrl).toBeNull()
        expect(results[1].imageUrl).toBeNull()

        global.fetch = originalFetch
    })
})
