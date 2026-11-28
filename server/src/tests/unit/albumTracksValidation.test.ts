import { jest } from "@jest/globals"
import type { Request, Response } from "express"
import { getAlbumTracks } from "@/api/controllers/searchControllers.js"
import { searchService } from "@/services/search/searchService.js"

const UUID = "0f0a4a3e-7d1e-4c8e-9a8b-1b2c3d4e5f60"

function run(query: Record<string, string>) {
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() } as unknown as Response
    const next = jest.fn()
    const req = { userId: "u1", query } as unknown as Request
    return getAlbumTracks(req, res, next).then(() => ({ res, next }))
}

describe("GET /search/music/albums/tracks id validation", () => {
    let spy: ReturnType<typeof jest.spyOn>
    beforeEach(() => {
        spy = jest.spyOn(searchService, "getAlbumTracks").mockResolvedValue({ album: {}, tracks: [], provider: null } as never)
    })
    afterEach(() => spy.mockRestore())

    test.each([
        [{ releaseGroupId: "not-a-uuid" }],
        [{ mbReleaseGroupId: "rg-1" }],
        [{ mbid: "123" }],
        [{ artist: "A", album: "B", mbid: "../../etc/passwd" }],
    ])("%j -> 400 and the provider is never called", async (query) => {
        const { res } = await run(query)
        expect(res.status).toHaveBeenCalledWith(400)
        expect(spy).not.toHaveBeenCalled()
    })

    test("valid UUIDs pass through", async () => {
        const { res } = await run({ releaseGroupId: UUID, mbid: UUID })
        expect(res.status).toHaveBeenCalledWith(200)
        expect(spy).toHaveBeenCalledWith("u1", "", "", UUID, UUID)
    })

    test("artist and album alone still work, without ids", async () => {
        const { res } = await run({ artist: "Slowdive", album: "Souvlaki" })
        expect(res.status).toHaveBeenCalledWith(200)
        expect(spy).toHaveBeenCalledWith("u1", "Slowdive", "Souvlaki", undefined, undefined)
    })
})
