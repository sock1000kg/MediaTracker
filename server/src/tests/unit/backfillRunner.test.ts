import { jest } from "@jest/globals"

const backfillMusicCovers = jest.fn<() => Promise<{ processed: number; updated: number }>>()
const backfillMusicData = jest.fn<() => Promise<{ processed: number; updated: number }>>()
const syncOpenLibraryBooks = jest.fn<() => Promise<{ processed: number; updated: number }>>()

jest.unstable_mockModule("@/services/musicCoverBackfillService.js", () => ({ backfillMusicCovers, backfillMusicData }))
jest.unstable_mockModule("@/services/openLibrarySyncService.js", () => ({ syncOpenLibraryBooks }))

const { runBackfill, parseBackfillTarget } = await import("@/scripts/backfillRunner.js")

describe("backfill script runner", () => {
    beforeEach(() => {
        jest.clearAllMocks()
        backfillMusicCovers.mockResolvedValue({ processed: 2, updated: 1 })
        backfillMusicData.mockResolvedValue({ processed: 3, updated: 2 })
        syncOpenLibraryBooks.mockResolvedValue({ processed: 5, updated: 4 })
    })

    test("all runs both services and sums the music counts", async () => {
        const lines: string[] = []
        const res = await runBackfill("all", l => lines.push(l))
        expect(backfillMusicCovers).toHaveBeenCalledTimes(1)
        expect(backfillMusicData).toHaveBeenCalledTimes(1)
        expect(syncOpenLibraryBooks).toHaveBeenCalledTimes(1)
        expect(res).toEqual({ music: { processed: 5, updated: 3 }, openlibrary: { processed: 5, updated: 4 } })
        expect(lines).toHaveLength(2)
    })

    test("music runs only the music services", async () => {
        await runBackfill("music", () => {})
        expect(backfillMusicCovers).toHaveBeenCalledTimes(1)
        expect(backfillMusicData).toHaveBeenCalledTimes(1)
        expect(syncOpenLibraryBooks).not.toHaveBeenCalled()
    })

    test("openlibrary runs only the Open Library sync", async () => {
        await runBackfill("openlibrary", () => {})
        expect(syncOpenLibraryBooks).toHaveBeenCalledTimes(1)
        expect(backfillMusicCovers).not.toHaveBeenCalled()
        expect(backfillMusicData).not.toHaveBeenCalled()
    })

    test("a failing service rejects (the script exits non-zero)", async () => {
        backfillMusicData.mockRejectedValue(new Error("db down"))
        await expect(runBackfill("music", () => {})).rejects.toThrow("db down")
    })

    test("the target defaults to all and rejects unknown names", () => {
        expect(parseBackfillTarget(undefined)).toBe("all")
        expect(parseBackfillTarget("music")).toBe("music")
        expect(() => parseBackfillTarget("movies")).toThrow(/Unknown backfill target/)
    })
})
