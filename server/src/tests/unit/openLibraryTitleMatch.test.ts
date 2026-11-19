import { jest, describe, test, expect, afterEach } from "@jest/globals"
import { openLibraryService, mainTitle } from "@/services/search/openLibrarySearchService.js"

const respond = (docs: unknown[]) =>
    jest.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ numFound: docs.length, docs }), { status: 200, headers: { "Content-Type": "application/json" } })
    )

describe("Open Library title + author lookup", () => {
    afterEach(() => { jest.restoreAllMocks() })

    test("mainTitle ignores case, punctuation, a leading article and a subtitle", () => {
        expect(mainTitle("The Myth of Sisyphus, and Other Essays")).toBe(mainTitle("The myth of Sisyphus and other essays"))
        expect(mainTitle("The Rebel: An Essay on Man in Revolt")).toBe("rebel")
        expect(mainTitle("L’Étranger")).toBe(mainTitle("L'etranger"))
        expect(mainTitle("Empire of the Sun (Empire of the Sun, #1)")).toBe("empire of the sun")
    })

    test("sends only the first author, and finds a classic filed under its original title by its edition", async () => {
        const spy = respond([
            { key: "/works/OL498463W", title: "Der Proceß", editions: { docs: [{ title: "The Trial" }] } },
        ])
        const doc = await openLibraryService.findByTitleAuthor("The Trial", "Franz Kafka, Edwin Muir, Willa Muir, Max Brod")
        expect(doc?.key).toBe("/works/OL498463W")
        const url = new URL(String(spy.mock.calls[0][0]))
        expect(url.searchParams.get("q")).toBe("The Trial")
        expect(url.searchParams.get("author")).toBe("Franz Kafka")
    })

    test("retries once with spaced initials only when the author as written finds nothing", async () => {
        const spy = jest.spyOn(globalThis, "fetch")
            .mockResolvedValueOnce(new Response(JSON.stringify({ numFound: 0, docs: [] }), { status: 200 }))
            .mockResolvedValueOnce(new Response(JSON.stringify({ numFound: 1, docs: [{ key: "/works/OL261889W", title: "Empire of the Sun" }] }), { status: 200 }))
        const doc = await openLibraryService.findByTitleAuthor("Empire of the Sun (Empire of the Sun, #1)", "J.G. Ballard")
        expect(doc?.key).toBe("/works/OL261889W")
        const authors = spy.mock.calls.map(c => new URL(String(c[0])).searchParams.get("author"))
        expect(authors).toEqual(["J.G. Ballard", "J. G. Ballard"])
    })

    test("a hit whose titles don't match isn't taken (a misspelt title stays unmatched)", async () => {
        respond([
            { key: "/works/OL1230755W", title: "Collected fiction", editions: { docs: [{ title: "The collected fiction of Albert Camus" }] } },
        ])
        expect(await openLibraryService.findByTitleAuthor("The Plauge", "Albert Camus")).toBeNull()
    })
})
