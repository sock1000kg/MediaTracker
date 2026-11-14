// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { renderWithProviders } from "@/test/render"
import { ImportsForm } from "./ImportsForm"
import * as importsApi from "@/api/imports"
import * as jobsApi from "@/api/jobs"

vi.mock("@/api/imports", () => ({
    startGoodreadsImport: vi.fn(),
    startMalImport: vi.fn(),
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

describe("ImportsForm component", () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it("renders both Goodreads and MyAnimeList cards with correct help text and accept attributes", () => {
        renderWithProviders(<ImportsForm />)

        expect(screen.getByText("Goodreads")).toBeInTheDocument()
        expect(screen.getByText("MyAnimeList")).toBeInTheDocument()
        expect(screen.getByText(/Export from myanimelist\.net\/panel\.php\?go=export/)).toBeInTheDocument()

        const fileInputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="file"]'))
        expect(fileInputs).toHaveLength(2)
        const malInput = document.querySelector('input[accept*=".xml"]')
        expect(malInput).not.toBeNull()
        expect(malInput?.getAttribute("accept")).toBe(".xml,.gz,application/xml,application/gzip")
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
})
