import { describe, expect, it } from "@jest/globals"
import {
    bookDetailsSchema,
    albumDetailsSchema,
    trackDetailsSchema,
    movieDetailsSchema,
    showDetailsSchema,
    seasonDetailsSchema,
    animeDetailsSchema,
    mangaDetailsSchema,
    gameDetailsSchema,
    boardgameDetailsSchema,
    customDetailsSchema,
    validateDetails,
} from "@/schemas/detailsSchemas.js"

describe("detailsSchemas acceptance criteria", () => {
    describe("bookDetailsSchema", () => {
        it("accepts a full example", () => {
            const data = { pageCount: 420, publisher: "Penguin Classics" }
            expect(bookDetailsSchema.parse(data)).toEqual(data)
        })

        it("rejects unknown keys", () => {
            expect(() => bookDetailsSchema.parse({ pageCount: 420, extra: "foo" })).toThrow()
        })

        it("rejects id keys", () => {
            expect(() => bookDetailsSchema.parse({ pageCount: 420, openLibraryWorkKey: "OL123W" })).toThrow()
        })
    })

    describe("albumDetailsSchema", () => {
        it("accepts a full example", () => {
            const data = { format: "Album", formatTags: ["Compilation", "Remaster"] }
            expect(albumDetailsSchema.parse(data)).toEqual(data)
        })

        it("rejects unknown keys", () => {
            expect(() => albumDetailsSchema.parse({ format: "Album", unknown: 1 })).toThrow()
        })

        it("rejects id keys", () => {
            expect(() => albumDetailsSchema.parse({ format: "Album", mbReleaseGroupId: "rg-123" })).toThrow()
        })
    })

    describe("trackDetailsSchema", () => {
        it("accepts a full example", () => {
            const data = { durationSec: 215 }
            expect(trackDetailsSchema.parse(data)).toEqual(data)
        })

        it("rejects unknown keys", () => {
            expect(() => trackDetailsSchema.parse({ durationSec: 215, bpm: 120 })).toThrow()
        })

        it("rejects id keys", () => {
            expect(() => trackDetailsSchema.parse({ durationSec: 215, mbRecordingId: "rec-123" })).toThrow()
        })
    })

    describe("movieDetailsSchema", () => {
        it("accepts a full example", () => {
            const data = { durationSec: 7200, language: "en", score: 8.5, scoreScale: "tmdb_10" as const }
            expect(movieDetailsSchema.parse(data)).toEqual(data)
        })

        it("rejects unknown keys", () => {
            expect(() => movieDetailsSchema.parse({ durationSec: 7200, budget: 1000000 })).toThrow()
        })

        it("rejects id keys", () => {
            expect(() => movieDetailsSchema.parse({ durationSec: 7200, tmdbId: 12345 })).toThrow()
            expect(() => movieDetailsSchema.parse({ durationSec: 7200, imdbId: "tt12345" })).toThrow()
        })
    })

    describe("showDetailsSchema", () => {
        it("accepts a full example", () => {
            const data = {
                seasonCount: 5,
                episodeCount: 60,
                networks: ["HBO"],
                country: "US",
                airingStatus: "Ended",
                language: "en",
                score: 9.3,
                scoreScale: "tmdb_10" as const,
            }
            expect(showDetailsSchema.parse(data)).toEqual(data)
        })

        it("rejects unknown keys", () => {
            expect(() => showDetailsSchema.parse({ seasonCount: 5, cast: ["Actor"] })).toThrow()
        })

        it("rejects id keys", () => {
            expect(() => showDetailsSchema.parse({ seasonCount: 5, tmdbId: 123 })).toThrow()
        })
    })

    describe("seasonDetailsSchema", () => {
        it("accepts a full example", () => {
            const data = { episodeCount: 10 }
            expect(seasonDetailsSchema.parse(data)).toEqual(data)
        })

        it("rejects unknown keys", () => {
            expect(() => seasonDetailsSchema.parse({ episodeCount: 10, seasonNumber: 2 })).toThrow()
        })

        it("rejects id keys", () => {
            expect(() => seasonDetailsSchema.parse({ episodeCount: 10, tmdbId: 123 })).toThrow()
        })
    })

    describe("animeDetailsSchema", () => {
        it("accepts a full example", () => {
            const data = {
                format: "TV",
                episodeCount: 24,
                durationSec: 1440,
                score: 8.7,
                scoreScale: "mal_10" as const,
            }
            expect(animeDetailsSchema.parse(data)).toEqual(data)
        })

        it("rejects unknown keys", () => {
            expect(() => animeDetailsSchema.parse({ format: "TV", studio: "Mappa" })).toThrow()
        })

        it("rejects id keys", () => {
            expect(() => animeDetailsSchema.parse({ format: "TV", idMal: 123 })).toThrow()
        })
    })

    describe("mangaDetailsSchema", () => {
        it("accepts a full example", () => {
            const data = {
                format: "Manga",
                chapterCount: 100,
                volumeCount: 12,
                score: 85,
                scoreScale: "anilist_100" as const,
            }
            expect(mangaDetailsSchema.parse(data)).toEqual(data)
        })

        it("rejects unknown keys", () => {
            expect(() => mangaDetailsSchema.parse({ chapterCount: 100, magazine: "Jump" })).toThrow()
        })

        it("rejects id keys", () => {
            expect(() => mangaDetailsSchema.parse({ chapterCount: 100, idMal: 50 })).toThrow()
        })
    })

    describe("gameDetailsSchema", () => {
        it("accepts a full example", () => {
            const data = {
                platforms: ["PC", "PS5"],
                publishers: ["Sony"],
                score: 4.8,
                scoreScale: "rawg_5" as const,
                metacritic: 92,
                avgPlaytimeHours: 45.5,
            }
            expect(gameDetailsSchema.parse(data)).toEqual(data)
        })

        it("rejects unknown keys", () => {
            expect(() => gameDetailsSchema.parse({ score: 4.8, engine: "Unreal" })).toThrow()
        })

        it("rejects id keys", () => {
            expect(() => gameDetailsSchema.parse({ score: 4.8, rawgId: 10 })).toThrow()
        })
    })

    describe("boardgameDetailsSchema", () => {
        it("accepts a full example", () => {
            const data = {
                minPlayers: 2,
                maxPlayers: 4,
                playTimeMin: 60,
                minPlayTimeMin: 45,
                maxPlayTimeMin: 90,
                score: 8.1,
                scoreScale: "bgg_10" as const,
            }
            expect(boardgameDetailsSchema.parse(data)).toEqual(data)
        })

        it("rejects unknown keys", () => {
            expect(() => boardgameDetailsSchema.parse({ minPlayers: 2, mechanics: ["Drafting"] })).toThrow()
        })

        it("rejects id keys", () => {
            expect(() => boardgameDetailsSchema.parse({ minPlayers: 2, bggId: 13 })).toThrow()
        })
    })

    describe("customDetailsSchema", () => {
        it("accepts a full example", () => {
            const data = {
                durationSec: 3600,
                edition: "First Edition",
                language: "French",
                pageCount: 300,
                url: "https://example.com/item",
            }
            expect(customDetailsSchema.parse(data)).toEqual(data)
        })

        it("rejects unknown keys", () => {
            expect(() => customDetailsSchema.parse({ pageCount: 100, tags: "foo" })).toThrow()
        })

        it("rejects id keys", () => {
            expect(() => customDetailsSchema.parse({ pageCount: 100, isbn: "123456" })).toThrow()
        })
    })

    describe("validateDetails dispatcher", () => {
        it("uses subtype when present", () => {
            expect(validateDetails({ format: "Album" }, { subtype: "album", mediaTypeName: "music", hasProvider: true }))
                .toEqual({ format: "Album" })
        })

        it("uses mediaType when subtype is null", () => {
            expect(validateDetails({ pageCount: 120 }, { subtype: null, mediaTypeName: "book", hasProvider: true }))
                .toEqual({ pageCount: 120 })
        })

        it("uses custom schema when hasProvider is false", () => {
            expect(validateDetails({ edition: "Special" }, { subtype: null, mediaTypeName: "book", hasProvider: false }))
                .toEqual({ edition: "Special" })
        })
    })
})
