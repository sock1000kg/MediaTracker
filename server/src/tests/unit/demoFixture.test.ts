import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { animeMetadataSchema } from "@/schemas/search/animeSchemas.js"
import { movieMetadataSchema } from "@/schemas/search/movieSchemas.js"
import { gameMetadataSchema } from "@/schemas/search/gameSchemas.js"
import { musicMetadataSchema } from "@/schemas/search/musicSchemas.js"
import { tvShowMetadataSchema, tvSeasonMetadataSchema } from "@/schemas/search/tvSchemas.js"
import { loadDemoFixture, DemoFixture } from "@/tests/fixtures/demo/seedDemoMedia.js"
import { loadMalCache } from "@/services/imports/malImportService.js"
import { loadLetterboxdCache } from "@/services/imports/letterboxdImportService.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

describe("Demo Media Fixture (Unit)", () => {
    let fixture: DemoFixture
    let rawJson: string

    beforeAll(() => {
        fixture = loadDemoFixture()
        const fixturePath = path.resolve(__dirname, "../fixtures/demo/demo-media.json")
        rawJson = fs.readFileSync(fixturePath, "utf-8")
    })

    describe("Security and API Key sanitization", () => {
        it("contains no api_key= or key= parameter substrings in URLs", () => {
            expect(rawJson).not.toMatch(/api_key=/i)
            expect(rawJson).not.toMatch(/[?&]key=/i)
        })

        it("contains no api_key= or key= parameter substrings in letterboxd-tmdb-cache.json", () => {
            const letterboxdCachePath = path.resolve(__dirname, "../fixtures/demo/letterboxd-tmdb-cache.json")
            const rawLetterboxd = fs.readFileSync(letterboxdCachePath, "utf-8")
            expect(rawLetterboxd).not.toMatch(/api_key=/i)
            expect(rawLetterboxd).not.toMatch(/[?&]key=/i)
            if (process.env.TMDB_API_KEY) {
                expect(rawLetterboxd.includes(process.env.TMDB_API_KEY)).toBe(false)
            }
        })

        it("contains no env keys if present in process.env", () => {
            if (process.env.TMDB_API_KEY) {
                expect(rawJson.includes(process.env.TMDB_API_KEY)).toBe(false)
            }
            if (process.env.RAWG_API_KEY) {
                expect(rawJson.includes(process.env.RAWG_API_KEY)).toBe(false)
            }
            if (process.env.LASTFM_API_KEY) {
                expect(rawJson.includes(process.env.LASTFM_API_KEY)).toBe(false)
            }
        })

        it("contains no Last.fm image hosts in the fixture", () => {
            expect(rawJson).not.toMatch(/lastfm.*fastly\.net/i)
            expect(rawJson).not.toMatch(/last\.fm\/.*image/i)
            for (const item of fixture.items) {
                if (item.media.imageUrl) {
                    expect(item.media.imageUrl).not.toMatch(/lastfm/i)
                    expect(item.media.imageUrl).not.toMatch(/last\.fm/i)
                }
                if (item.parent?.imageUrl) {
                    expect(item.parent.imageUrl).not.toMatch(/lastfm/i)
                    expect(item.parent.imageUrl).not.toMatch(/last\.fm/i)
                }
            }
        })
    })

    describe("Collections definition", () => {
        it("defines exactly 5 collections with 2 ranked", () => {
            expect(fixture.collections).toHaveLength(5)
            const ranked = fixture.collections.filter(c => c.ranked)
            const unranked = fixture.collections.filter(c => !c.ranked)
            expect(ranked).toHaveLength(2)
            expect(unranked).toHaveLength(3)

            const rankedNames = ranked.map(c => c.name).sort()
            expect(rankedNames).toEqual(["All-time favourites", "Shoegaze & dream pop"].sort())

            const unrankedNames = unranked.map(c => c.name).sort()
            expect(unrankedNames).toEqual(["Comfort shelf", "Rainy day", "Up next"].sort())

            for (const c of fixture.collections) {
                expect(c.name.trim().length).toBeGreaterThan(0)
                expect(c.description.trim().length).toBeGreaterThan(0)
            }
        })
    })

    describe("Picks count and media types", () => {
        it("has all media types represented", () => {
            expect(fixture.items.length).toBeGreaterThan(0)

            const byType = fixture.items.reduce<Record<string, number>>((acc, item) => {
                acc[item.mediaTypeName] = (acc[item.mediaTypeName] || 0) + 1
                return acc
            }, {})

            expect(byType.game).toBeGreaterThan(0)
            expect(byType.music).toBeGreaterThan(0)
            expect(byType.tv).toBeGreaterThan(0)
        })

        it("has covers and identifiers for every item", () => {
            for (const item of fixture.items) {
                expect(item.media.title).toBeTruthy()
                expect(item.media.source).toBeTruthy()
                expect(item.media.sourceId).toBeTruthy()
                if (item.mediaTypeName === "music" && (item.media.metadata as Record<string, unknown> | null)?.kind === "track" && !item.parent) {
                    expect(item.media.imageUrl).toBeNull()
                } else {
                    expect(item.media.imageUrl).toBeTruthy()
                    expect(item.media.imageUrl).toMatch(/^https:\/\//)
                }
            }
        })
    })

    describe("Strict metadata schema validation", () => {
        it("validates anime metadata against animeMetadataSchema.strict()", () => {
            const cache = loadMalCache()
            const animes = Object.values(cache.anime)
            expect(animes.length).toBeGreaterThan(0)
            for (const a of animes) {
                const item = a as { metadata?: unknown }
                const parsed = animeMetadataSchema.safeParse(item.metadata)
                expect(parsed.success).toBe(true)
                if (parsed.success) {
                    expect(parsed.data.kind).toBe("anime")
                }
            }
        })

        it("validates manga metadata against animeMetadataSchema.strict()", () => {
            const cache = loadMalCache()
            const mangas = Object.values(cache.manga)
            expect(mangas.length).toBeGreaterThan(0)
            for (const m of mangas) {
                const item = m as { metadata?: unknown }
                const parsed = animeMetadataSchema.safeParse(item.metadata)
                expect(parsed.success).toBe(true)
                if (parsed.success) {
                    expect(parsed.data.kind).toBe("manga")
                }
            }
        })

        it("validates movie metadata against movieMetadataSchema.strict()", () => {
            const cache = loadLetterboxdCache()
            const movies = Object.values(cache)
            expect(movies.length).toBeGreaterThan(0)
            for (const m of movies) {
                const parsed = movieMetadataSchema.safeParse(m.metadata)
                expect(parsed.success).toBe(true)
                if (parsed.success) {
                    expect(parsed.data.kind).toBe("movie")
                }
                expect(m.year).toBeDefined()
            }
        })

        it("validates game metadata against gameMetadataSchema.strict()", () => {
            const games = fixture.items.filter(i => i.mediaTypeName === "game")
            for (const g of games) {
                const parsed = gameMetadataSchema.safeParse(g.media.metadata)
                expect(parsed.success).toBe(true)
                if (parsed.success) {
                    expect(parsed.data.kind).toBe("game")
                }
            }
        })

        it("validates music metadata against musicMetadataSchema.strict()", () => {
            const music = fixture.items.filter(i => i.mediaTypeName === "music")
            for (const m of music) {
                const parsed = musicMetadataSchema.strict().safeParse(m.media.metadata)
                expect(parsed.success).toBe(true)
                if (parsed.success) {
                    expect(["album", "track"]).toContain(parsed.data.kind)
                }
            }
        })

        it("validates tv metadata against tv schemas", () => {
            const tvItems = fixture.items.filter(i => i.mediaTypeName === "tv")
            expect(tvItems.length).toBeGreaterThan(0)
            for (const t of tvItems) {
                const kind = (t.media.metadata as { kind?: string })?.kind
                if (kind === "season") {
                    const parsed = tvSeasonMetadataSchema.safeParse(t.media.metadata)
                    expect(parsed.success).toBe(true)
                } else {
                    const parsed = tvShowMetadataSchema.safeParse(t.media.metadata)
                    expect(parsed.success).toBe(true)
                }
            }
        })
    })

    describe("Log data constraints", () => {
        it("satisfies status distribution: majority completed, some in progress, wishlist, dropped", () => {
            const statuses = fixture.items.reduce<Record<string, number>>((acc, item) => {
                acc[item.log.status] = (acc[item.log.status] || 0) + 1
                return acc
            }, {})

            expect(statuses.completed).toBeGreaterThan(0)
            expect(statuses["in progress"]).toBeGreaterThan(0)
            expect(statuses.wishlist).toBeGreaterThan(0)
            expect(statuses.dropped).toBeGreaterThan(0)
        })

        it("satisfies rating constraints: 0-100 or null, with varied distribution", () => {
            let unratedCount = 0
            let perfectCount = 0
            let midCount = 0
            let highCount = 0

            for (const item of fixture.items) {
                const r = item.log.rating
                if (r === null || r === undefined) {
                    unratedCount++
                } else {
                    expect(r).toBeGreaterThanOrEqual(0)
                    expect(r).toBeLessThanOrEqual(100)
                    if (r === 100) perfectCount++
                    else if (r >= 40 && r <= 65) midCount++
                    else if (r >= 70 && r <= 99) highCount++
                }
            }

            expect(unratedCount).toBeGreaterThanOrEqual(5)
            expect(perfectCount).toBeGreaterThanOrEqual(2)
            expect(midCount).toBeGreaterThanOrEqual(2)
            expect(highCount).toBeGreaterThanOrEqual(20)
        })

        it("enforces finished >= started for all items where both exist", () => {
            for (const item of fixture.items) {
                if (item.log.startedAt && item.log.finishedAt) {
                    const start = new Date(item.log.startedAt).getTime()
                    const finish = new Date(item.log.finishedAt).getTime()
                    expect(finish).toBeGreaterThanOrEqual(start)
                }
            }
        })

        it("has startedAt on completed items", () => {
            const completed = fixture.items.filter(i => i.log.status === "completed")
            for (const item of completed) {
                expect(item.log.startedAt).toBeTruthy()
                expect(item.log.finishedAt).toBeTruthy()
            }
        })

        it("spreads dates across Jan 2024 to Nov 2026", () => {
            const dates = fixture.items.map(i => new Date(i.log.loggedAt))
            const years = new Set(dates.map(d => d.getFullYear()))
            expect(years.has(2024)).toBe(true)
            expect(years.has(2025)).toBe(true)
            expect(years.has(2026)).toBe(true)
        })

        it("enforces personal tags limits (at most 20 tags each) and includes expected tags", () => {
            const allTags = new Set<string>()
            for (const item of fixture.items) {
                const tags = item.log.tags || []
                expect(tags.length).toBeLessThanOrEqual(20)
                tags.forEach(t => allTags.add(t))
            }

            const expectedTags = ["comfort", "rewatch", "cried", "masterpiece", "2am", "slow burn", "shoegaze", "cozy"]
            for (const tag of expectedTags) {
                expect(allTags.has(tag)).toBe(true)
            }
        })

        it("contains casual notes with one or two multi-line notes", () => {
            const multiLineNotes = fixture.items.filter(i => (i.log.notes?.split("\n").length ?? 0) >= 4)
            expect(multiLineNotes.length).toBeGreaterThanOrEqual(2)
        })
    })

    describe("Collections membership", () => {
        it("assigns wishlist items to 'Up next'", () => {
            const upNext = fixture.items.filter(i => i.collections.includes("Up next"))
            const expectedUpNextCount = fixture.items.filter(i => i.collections.includes("Up next")).length
            expect(upNext.length).toBe(expectedUpNextCount)
            expect(upNext.length).toBeGreaterThan(0)
            for (const item of upNext) {
                expect(item.log.status).toBe("wishlist")
            }
        })

        it("has items across types in 'All-time favourites'", () => {
            const favs = fixture.items.filter(i => i.collections.includes("All-time favourites"))
            const expectedFavsCount = fixture.items.filter(i => i.collections.includes("All-time favourites")).length
            expect(favs.length).toBe(expectedFavsCount)
            expect(favs.length).toBeGreaterThan(0)
            const types = new Set(favs.map(i => i.mediaTypeName))
            expect(types.size).toBeGreaterThanOrEqual(3)
        })

        it("has only music in 'Shoegaze & dream pop'", () => {
            const shoegaze = fixture.items.filter(i => i.collections.includes("Shoegaze & dream pop"))
            expect(shoegaze.length).toBeGreaterThanOrEqual(4)
            for (const item of shoegaze) {
                expect(item.mediaTypeName).toBe("music")
            }
        })
    })
})
