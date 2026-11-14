// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { renderWithProviders } from "@/test/render"
import { ImportsForm } from "./ImportsForm"
import * as importsApi from "@/api/imports"
import * as jobsApi from "@/api/jobs"
import * as apiKeyApi from "@/api/apiKey"

vi.mock("@/api/imports", () => ({
    startGoodreadsImport: vi.fn(),
    startMalImport: vi.fn(),
    startLetterboxdImport: vi.fn(),
    ImportAlreadyRunningError: class extends Error {
        jobId: string
        constructor(message: string, jobId: string) {
            super(message)
            this.name = "ImportAlreadyRunningError"
            this.jobId = jobId
        }
    },
}))

vi.mock("@/api/jobs", () => ({
    fetchJob: vi.fn(),
    fetchJobs: vi.fn().mockResolvedValue([]),
}))

vi.mock("@/api/logs", () => ({
    fetchLogs: vi.fn().mockResolvedValue([]),
}))

vi.mock("@/api/apiKey", () => ({
    getApiKeys: vi.fn().mockResolvedValue([]),
}))

describe("ImportsForm component", () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it("renders Goodreads, MyAnimeList, and Letterboxd cards with correct help text and accept attributes", async () => {
        renderWithProviders(<ImportsForm />)

        expect(screen.getByText("Goodreads")).toBeInTheDocument()
        expect(screen.getByText("MyAnimeList")).toBeInTheDocument()
        expect(screen.getByText("Letterboxd")).toBeInTheDocument()
        expect(screen.getByText(/Export from myanimelist\.net\/panel\.php\?go=export/)).toBeInTheDocument()
        expect(screen.getByText(/Export from letterboxd\.com → Settings → Data → Export your data, then upload the ZIP\./)).toBeInTheDocument()

        const fileInputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="file"]'))
        expect(fileInputs).toHaveLength(3)

        const malInput = document.querySelector('input[accept*=".xml"]')
        expect(malInput).not.toBeNull()
        expect(malInput?.getAttribute("accept")).toBe(".xml,.gz,application/xml,application/gzip")

        const boxdInput = document.querySelector('input[accept*=".zip"]')
        expect(boxdInput).not.toBeNull()
        expect(boxdInput?.getAttribute("accept")).toBe(".zip,application/zip")
    })

    it("shows a hint linking to Settings → API Keys when the user has no TMDB key", async () => {
        vi.mocked(apiKeyApi.getApiKeys).mockResolvedValueOnce([
            { service: "lastfm", key: "xxx" },
        ])

        renderWithProviders(<ImportsForm />)

        await waitFor(() => {
            expect(screen.getByText("Settings → API Keys")).toBeInTheDocument()
        })
    })

    it("uploads MAL file through mocked API and shows progress and results including note", async () => {
        const user = userEvent.setup()

        const mockJobResult = {
            id: "mal-job-1",
            name: "import.mal" as const,
            status: "completed" as const,
            progress: 100,
            result: {
                imported: 15,
                updated: 3,
                skipped: 2,
                failures: [],
                notes: ["1 entries had no AniList match and were imported without covers."],
            },
            error: null,
            userId: 1,
            createdAt: new Date().toISOString(),
            finishedAt: new Date().toISOString(),
        }

        vi.mocked(importsApi.startMalImport).mockResolvedValueOnce({ jobId: "mal-job-1" })
        vi.mocked(jobsApi.fetchJob).mockResolvedValue(mockJobResult)

        renderWithProviders(<ImportsForm />)

        const malInput = document.querySelectorAll('input[type="file"]')[1] as HTMLInputElement
        expect(malInput).toBeDefined()

        const testFile = new File(["<myanimelist></myanimelist>"], "mal-export.xml", { type: "application/xml" })
        await user.upload(malInput, testFile)

        const uploadButtons = screen.getAllByRole("button", { name: /upload/i })
        // Second upload button is for MAL
        await user.click(uploadButtons[1])

        await waitFor(() => {
            expect(importsApi.startMalImport).toHaveBeenCalledWith(testFile)
        })

        await waitFor(() => {
            expect(screen.getByText("15")).toBeInTheDocument()
            expect(screen.getByText("Imported")).toBeInTheDocument()
            expect(screen.getByText("3")).toBeInTheDocument()
            expect(screen.getByText("Updated")).toBeInTheDocument()
            expect(screen.getByText("1 entries had no AniList match and were imported without covers.")).toBeInTheDocument()
        })
    })

    it("uploads Letterboxd ZIP file through mocked API and shows results including unmatched note", async () => {
        const user = userEvent.setup()

        const mockJobResult = {
            id: "boxd-job-1",
            name: "import.letterboxd" as const,
            status: "completed" as const,
            progress: 100,
            result: {
                imported: 12,
                updated: 0,
                skipped: 1,
                unmatched: 2,
                failures: [],
                notes: ["2 films couldn't be matched to TMDB and were added by title."],
            },
            error: null,
            userId: 1,
            createdAt: new Date().toISOString(),
            finishedAt: new Date().toISOString(),
        }

        vi.mocked(importsApi.startLetterboxdImport).mockResolvedValueOnce({ jobId: "boxd-job-1" })
        vi.mocked(jobsApi.fetchJob).mockResolvedValue(mockJobResult)

        renderWithProviders(<ImportsForm />)

        const boxdInput = document.querySelectorAll('input[type="file"]')[2] as HTMLInputElement
        expect(boxdInput).toBeDefined()

        const testFile = new File(["fake zip content"], "letterboxd-export.zip", { type: "application/zip" })
        await user.upload(boxdInput, testFile)

        const uploadButtons = screen.getAllByRole("button", { name: /upload/i })
        // Third upload button is for Letterboxd
        await user.click(uploadButtons[2])

        await waitFor(() => {
            expect(importsApi.startLetterboxdImport).toHaveBeenCalledWith(testFile)
        })

        await waitFor(() => {
            expect(screen.getByText("12")).toBeInTheDocument()
            expect(screen.getByText("Imported")).toBeInTheDocument()
            expect(screen.getByText("1")).toBeInTheDocument()
            expect(screen.getByText("Skipped")).toBeInTheDocument()
            expect(screen.getByText("2 films couldn't be matched to TMDB and were added by title.")).toBeInTheDocument()
        })
    })
})
