import { jest } from "@jest/globals"
import {
    RateLimiter,
    LruCache,
    MusicBrainzClient,
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

    test("resolveReleaseGroupForRelease returns found, none, or failed", async () => {
        const client = new MusicBrainzClient()
        jest.spyOn(client, "fetchJson").mockResolvedValue({
            releases: [
                { id: "rel-found", "release-group": { id: "rg-100" } },
            ],
        })

        const found = await client.resolveReleaseGroupForRelease("rel-found")
        expect(found).toEqual({ status: "found", releaseGroupId: "rg-100" })

        const none = await client.resolveReleaseGroupForRelease("rel-not-in-mb")
        expect(none).toEqual({ status: "none" })

        jest.spyOn(client, "fetchJson").mockRejectedValue(new Error("Network timeout"))
        const failed = await client.resolveReleaseGroupForRelease("rel-fail-net")
        expect(failed).toEqual({ status: "failed" })
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
})
