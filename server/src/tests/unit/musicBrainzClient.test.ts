import { jest } from "@jest/globals"
import {
    RateLimiter,
    LruCache,
    MusicBrainzClient,
    MusicBrainzHttpError,
    isMusicTrack,
} from "@/services/search/musicBrainzClient.js"

describe("MusicBrainzClient unit tests", () => {
    afterEach(() => {
        jest.restoreAllMocks()
        jest.useRealTimers()
    })

    test("RateLimiter spaces calls >= 1 s apart (fake timers)", async () => {
        jest.useFakeTimers()
        const limiter = new RateLimiter(1000)
        const timestamps: number[] = []

        const p1 = limiter.schedule(async () => {
            timestamps.push(Date.now())
            return "one"
        })
        const p2 = limiter.schedule(async () => {
            timestamps.push(Date.now())
            return "two"
        })

        // Give microtasks a turn to schedule
        await Promise.resolve()
        expect(timestamps).toHaveLength(1)

        // Advance 500 ms - second call must not run yet
        jest.advanceTimersByTime(500)
        await Promise.resolve()
        expect(timestamps).toHaveLength(1)

        // Advance remaining 500 ms (total 1000 ms)
        jest.advanceTimersByTime(500)
        await Promise.resolve()
        expect(timestamps).toHaveLength(2)

        const [r1, r2] = await Promise.all([p1, p2])
        expect(r1).toBe("one")
        expect(r2).toBe("two")
        expect(timestamps[1] - timestamps[0]).toBeGreaterThanOrEqual(1000)
    })

    test("LruCache evicts oldest item when exceeding max size", () => {
        const cache = new LruCache<string, string>(2)
        cache.set("a", "1")
        cache.set("b", "2")
        expect(cache.get("a")).toBe("1") // "a" accessed, "b" is now oldest
        cache.set("c", "3") // evicts "b"
        expect(cache.has("b")).toBe(false)
        expect(cache.get("a")).toBe("1")
        expect(cache.get("c")).toBe("3")
    })

    test("releaseGroupCache prevents a second lookup for the same release id", async () => {
        const client = new MusicBrainzClient()
        const fetchSpy = jest.spyOn(client, "fetchJson").mockResolvedValue({
            releases: [
                {
                    id: "release-abc",
                    "release-group": { id: "rg-xyz" },
                },
            ],
        })

        const firstResult = await client.resolveReleaseGroups(["release-abc"])
        expect(firstResult.groups.get("release-abc")).toBe("rg-xyz")
        expect(firstResult.failed.size).toBe(0)
        expect(fetchSpy).toHaveBeenCalledTimes(1)

        // Second lookup for same id: should hit memory cache and not call fetchJson
        const secondResult = await client.resolveReleaseGroups(["release-abc"])
        expect(secondResult.groups.get("release-abc")).toBe("rg-xyz")
        expect(secondResult.failed.size).toBe(0)
        expect(fetchSpy).toHaveBeenCalledTimes(1)
    })

    test("resolveReleaseGroups tracks failed mbids in failed set on network error and does not cache them", async () => {
        const client = new MusicBrainzClient()
        jest.spyOn(client, "fetchJson").mockRejectedValue(new Error("MusicBrainz 500 Server Error"))

        const res = await client.resolveReleaseGroups(["rel-fail"])
        expect(res.failed.has("rel-fail")).toBe(true)
        expect(res.groups.has("rel-fail")).toBe(false)
        expect(client.releaseGroupCache.has("rel-fail")).toBe(false)
    })

    test("resolveReleaseGroupForRelease looks the release up directly: found, none (404), or failed", async () => {
        const client = new MusicBrainzClient()
        const fetchSpy = jest.spyOn(client, "fetchJson").mockImplementation(async (url: string) => {
            if (url.includes("/release/rel-found")) return { id: "rel-found", "release-group": { id: "rg-100" } }
            if (url.includes("/release/rel-not-in-mb")) throw new MusicBrainzHttpError(404)
            throw new MusicBrainzHttpError(503)
        })

        expect(await client.resolveReleaseGroupForRelease("rel-found")).toEqual({ status: "found", releaseGroupId: "rg-100" })
        expect(String(fetchSpy.mock.calls[0][0])).not.toContain("query=")
        expect(await client.resolveReleaseGroupForRelease("rel-not-in-mb")).toEqual({ status: "none" })
        expect(await client.resolveReleaseGroupForRelease("rel-down")).toEqual({ status: "failed" })
        expect(client.releaseGroupCache.has("rel-down")).toBe(false)

        // found ids are cached
        await client.resolveReleaseGroupForRelease("rel-found")
        expect(fetchSpy).toHaveBeenCalledTimes(3)
    })

    test("a merged release id resolves through the redirect; the search batch leaves it null and uncached", async () => {
        const client = new MusicBrainzClient()
        jest.spyOn(client, "fetchJson").mockImplementation(async (url: string) => {
            // fetch follows MusicBrainz's 301, so a direct lookup of the old id returns the surviving release
            if (url.includes("/release/old-merged-id")) return { id: "surviving-id", "release-group": { id: "rg-damn" } }
            return { releases: [] }
        })

        const search = await client.resolveReleaseGroups(["old-merged-id"])
        expect(search.groups.get("old-merged-id")).toBeNull()
        expect(client.releaseGroupCache.has("old-merged-id")).toBe(false)

        expect(await client.resolveReleaseGroupForRelease("old-merged-id")).toEqual({ status: "found", releaseGroupId: "rg-damn" })
    })

    test("resolveTrackCover prefers official release whose release group primary type is Album, then EP/Single", async () => {
        const client = new MusicBrainzClient()
        jest.spyOn(client, "fetchJson").mockResolvedValue({
            recordings: [
                {
                    id: "rec-1",
                    title: "Avril 14th",
                    releases: [
                        {
                            id: "rel-comp",
                            status: "Promotion",
                            "release-group": { id: "rg-promo-album", "primary-type": "Album" },
                        },
                        {
                            id: "rel-druzq",
                            status: "Official",
                            "release-group": { id: "rg-official-album", "primary-type": "Album" },
                        },
                        {
                            id: "rel-single",
                            status: "Official",
                            "release-group": { id: "rg-official-single", "primary-type": "Single" },
                        },
                    ],
                },
            ],
        })

        const cover = await client.resolveTrackCover("Aphex Twin", "Avril 14th")
        expect(cover).toEqual({
            status: "found",
            imageUrl: "https://coverartarchive.org/release-group/rg-official-album/front-250",
        })
    })

    test("resolveTrackCover returns none when no releases or recordings match", async () => {
        const client = new MusicBrainzClient()
        jest.spyOn(client, "fetchJson").mockResolvedValue({
            recordings: [],
        })

        const cover = await client.resolveTrackCover("Unknown Artist", "Unknown Track")
        expect(cover).toEqual({ status: "none" })
    })

    test("resolveTrackCover handles network/parsing errors gracefully by returning failed", async () => {
        const client = new MusicBrainzClient()
        jest.spyOn(client, "fetchJson").mockRejectedValue(new Error("MusicBrainz 503 Service Unavailable"))

        const cover = await client.resolveTrackCover("Artist", "Track")
        expect(cover).toEqual({ status: "failed" })
    })

    test("isMusicTrack: older track rows with only the Media.kind column (or a /_/ Last.fm URL) count as tracks", () => {
        // Avril 14th: logged before metadata.kind existed
        expect(isMusicTrack({ kind: "track", sourceId: "076205ee-7f45-3325-a5a4-38d27ceabd61" }, {})).toBe(true)
        expect(isMusicTrack({ kind: null, sourceId: "https://www.last.fm/music/Radiohead/_/15+Steps" }, {})).toBe(true)
        expect(isMusicTrack({ kind: null, sourceId: "abc" }, { url: "https://www.last.fm/music/Aphex+Twin/_/Avril+14th" })).toBe(true)
        expect(isMusicTrack({ kind: "album", sourceId: "503c4a0f" }, {})).toBe(false)
        expect(isMusicTrack({ kind: null, sourceId: "lastfm:07d02411#3" }, {})).toBe(true)
        expect(isMusicTrack({ kind: null, sourceId: "09a09037" }, { kind: "album" })).toBe(false)
    })

    test("track lookup: finds the studio recording despite spelling drift, preferring a studio album over a compilation", async () => {
        const client = new MusicBrainzClient()
        const fetchSpy = jest.spyOn(client, "fetchJson").mockImplementation(async () => ({
            recordings: [
                { id: "rec-comp", score: 100, title: "15 Step", releases: [
                    { id: "r1", status: "Official", "release-group": { id: "rg-comp", "primary-type": "Album", "secondary-types": ["Compilation"] } },
                ] },
                { id: "rec-studio", score: 99, title: "15 Step", length: 237000, releases: [
                    { id: "r2", status: "Official", "release-group": { id: "rg-in-rainbows", "primary-type": "Album" } },
                ] },
                { id: "rec-other-song", score: 60, title: "Steps", releases: [
                    { id: "r3", status: "Official", "release-group": { id: "rg-wrong", "primary-type": "Album" } },
                ] },
            ],
        }))

        const res = await client.resolveTrackRecording("Radiohead", "15 Steps")
        expect(res).toMatchObject({ status: "found", recordingId: "rec-studio", releaseGroupId: "rg-in-rainbows", title: "15 Step" })
        const firstQuery = new URL(String(fetchSpy.mock.calls[0][0])).searchParams.get("query") ?? ""
        expect(firstQuery).toContain("status:official")
        expect(firstQuery).toContain("NOT secondarytype:live")
        expect(fetchSpy).toHaveBeenCalledTimes(1)
    })

    test("track lookup: falls back to the exact-title search when no official non-live release matches", async () => {
        const client = new MusicBrainzClient()
        const fetchSpy = jest.spyOn(client, "fetchJson")
            .mockResolvedValueOnce({ recordings: [] })
            .mockResolvedValueOnce({ recordings: [
                { id: "rec-live", score: 100, title: "Rare Song", releases: [
                    { id: "r1", status: "Bootleg", "release-group": { id: "rg-live", "primary-type": "Album", "secondary-types": ["Live"] } },
                ] },
            ] })

        const res = await client.resolveTrackRecording("Artist", "Rare Song")
        expect(res).toMatchObject({ status: "found", recordingId: "rec-live", releaseGroupId: "rg-live" })
        expect(fetchSpy).toHaveBeenCalledTimes(2)
        expect(new URL(String(fetchSpy.mock.calls[1][0])).searchParams.get("query")).toContain('recording:"Rare Song"')
    })
})
