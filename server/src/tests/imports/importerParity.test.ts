import { jest } from "@jest/globals"
import { tmdbSearchService } from "@/services/search/tmdbSearchService.js"
import { resolveLetterboxdFilmsWithKey, letterboxdFilmKey } from "@/services/imports/letterboxdImportService.js"

describe("Importer parity (P8, T1)", () => {
    afterEach(() => {
        jest.restoreAllMocks()
    })

    test("Letterboxd importer and TMDB search produce identical provider fields for the same movie", async () => {
        const mockSearchResult = {
            id: "550",
            source: "tmdb",
            sourceId: "550",
            title: "Fight Club",
            year: "1999",
            creator: "David Fincher",
            imageUrl: "https://image.tmdb.org/t/p/w500/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg",
            description: "An ticking-time-bomb insomniac...",
            mediaType: "movie" as const,
            metadata: {
                kind: "movie" as const,
                tmdbId: 550,
                imdbId: "tt0137523",
                runtime: 139,
                director: "David Fincher",
                cast: ["Brad Pitt", "Edward Norton"],
                genres: ["Drama"],
                ratingValue: 84,
                ratingCount: 26000,
                voteAverage: 8.4,
                voteCount: 26000,
            },
        }

        // Mock tmdbSearchService.findMovie directly to return the search result
        const findMovieSpy = jest.spyOn(tmdbSearchService, "findMovie").mockResolvedValue(mockSearchResult)

        // 1. Resolve via direct TMDB search service findMovie
        const searchResult = await tmdbSearchService.findMovie("Fight Club", 1999, { apiKey: "test-api-key" })

        // 2. Resolve via Letterboxd importer resolver helper
        const films = [{ name: "Fight Club", year: 1999 }]
        const letterboxdResolvedMap = await resolveLetterboxdFilmsWithKey(
            films,
            "test-api-key"
        )
        const letterboxdResult = letterboxdResolvedMap.get(letterboxdFilmKey("Fight Club", 1999))

        expect(findMovieSpy).toHaveBeenCalledTimes(2)
        expect(letterboxdResult).toBeDefined()
        expect(searchResult).toBeDefined()

        // Assert provider identity and metadata fields are strictly identical
        expect(letterboxdResult?.source).toBe(searchResult?.source)
        expect(letterboxdResult?.sourceId).toBe(searchResult?.sourceId)
        expect(letterboxdResult?.title).toBe(searchResult?.title)
        expect(letterboxdResult?.year).toBe(searchResult?.year)
        expect(letterboxdResult?.creator).toBe(searchResult?.creator)
        expect(letterboxdResult?.imageUrl).toBe(searchResult?.imageUrl)
        expect(letterboxdResult?.metadata).toEqual(searchResult?.metadata)
    })
})
