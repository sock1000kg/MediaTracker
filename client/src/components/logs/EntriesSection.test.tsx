// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { renderWithProviders } from "@/test/render"
import { EntriesSection } from "./EntriesSection"
import type { Log, LogEntry } from "@/types/mainTypes"
import * as logsApi from "@/api/logs"

vi.mock("@/api/logs", () => ({
  fetchLogs: vi.fn().mockResolvedValue([]),
  addLogEntry: vi.fn(),
  editLogEntry: vi.fn(),
  deleteLogEntry: vi.fn(),
}))

const entry = (over: Partial<LogEntry> = {}): LogEntry => ({
  id: "e1", logId: "l1",
  startedAt: "2024-03-12T00:00:00.000Z", finishedAt: "2024-04-02T00:00:00.000Z",
  progressEpisodes: null, progressChapters: null, progressVolumes: null,
  note: "liked it more this time\nsecond line", edition: { title: "L'étranger", format: "Paperback" },
  created_at: "2024-04-02T00:00:00.000Z", ...over,
})

const updatedLog = { id: "l1", status: "in progress", entries: [], entryCount: 0 } as unknown as Log
const media = { mediaType: { name: "book" } }

describe("EntriesSection", () => {
  beforeEach(() => vi.clearAllMocks())

  it("lists entries newest first with dates, edition chips and the first line of the note", () => {
    const entries = [entry({ id: "old", startedAt: null, finishedAt: "2020-01-05T00:00:00.000Z", note: null, edition: null }), entry()]
    renderWithProviders(<EntriesSection logId="l1" entries={entries} media={media} onLogChange={vi.fn()} />)
    const rows = screen.getAllByRole("listitem")
    expect(rows).toHaveLength(2)
    expect(within(rows[0]).getByText("12 Mar 2024 → 2 Apr 2024")).toBeInTheDocument()
    expect(within(rows[0]).getByText("L'étranger")).toBeInTheDocument()
    expect(within(rows[0]).getByText("Paperback")).toBeInTheDocument()
    expect(within(rows[0]).getByText("liked it more this time")).toBeInTheDocument()
    expect(within(rows[0]).queryByText(/second line/)).not.toBeInTheDocument()
    expect(within(rows[1]).getByText("Finished 5 Jan 2020")).toBeInTheDocument()
  })

  it("an open entry reads \"Started …\"", () => {
    renderWithProviders(<EntriesSection logId="l1" entries={[entry({ finishedAt: null })]} media={media} onLogChange={vi.fn()} />)
    expect(screen.getByText("Started 12 Mar 2024")).toBeInTheDocument()
  })

  it("Add entry opens the editor and posts the entry with its edition to POST /logs/:id/entries", async () => {
    vi.mocked(logsApi.addLogEntry).mockResolvedValue(updatedLog)
    const onLogChange = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(<EntriesSection logId="l1" entries={[]} media={media} onLogChange={onLogChange} />)

    await user.click(screen.getByRole("button", { name: "Add entry" }))
    await user.type(screen.getByLabelText("Edition title"), "The Stranger")
    await user.type(screen.getByLabelText("Format"), "Kindle")
    await user.type(screen.getByLabelText("Language"), "English")
    await user.type(screen.getByLabelText("Entry note"), "again")
    await user.click(screen.getByRole("button", { name: "Save entry" }))

    await waitFor(() => expect(logsApi.addLogEntry).toHaveBeenCalledTimes(1))
    const [logId, body] = vi.mocked(logsApi.addLogEntry).mock.calls[0]
    expect(logId).toBe("l1")
    expect(body).toMatchObject({
      note: "again",
      edition: { title: "The Stranger", format: "Kindle", language: "English" },
    })
    expect(body?.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/) // the editor starts today
    await waitFor(() => expect(onLogChange).toHaveBeenCalledWith(updatedLog))
  })

  it("offers per-type format suggestions", async () => {
    const user = userEvent.setup()
    const { container } = renderWithProviders(<EntriesSection logId="l1" entries={[]} media={media} onLogChange={vi.fn()} />)
    await user.click(screen.getByRole("button", { name: "Add entry" }))
    const options = Array.from(container.querySelectorAll("datalist option")).map((o) => o.getAttribute("value"))
    expect(options).toEqual(expect.arrayContaining(["Paperback", "Hardcover", "Kindle", "eBook", "Audiobook"]))
  })

  it("deleting asks to confirm first, then calls DELETE", async () => {
    vi.mocked(logsApi.deleteLogEntry).mockResolvedValue(updatedLog)
    const user = userEvent.setup()
    renderWithProviders(<EntriesSection logId="l1" entries={[entry()]} media={media} onLogChange={vi.fn()} />)

    await user.click(screen.getByRole("button", { name: /Delete entry 12 Mar 2024/ }))
    expect(logsApi.deleteLogEntry).not.toHaveBeenCalled()
    const dialog = await screen.findByRole("alertdialog")
    expect(within(dialog).getByText("Delete this entry?")).toBeInTheDocument()

    await user.click(within(dialog).getByRole("button", { name: "Delete entry" }))
    await waitFor(() => expect(logsApi.deleteLogEntry).toHaveBeenCalledWith("l1", "e1"))
  })

  it("editing an entry puts to PUT /logs/:id/entries/:entryId with the changed fields", async () => {
    vi.mocked(logsApi.editLogEntry).mockResolvedValue(updatedLog)
    const user = userEvent.setup()
    renderWithProviders(<EntriesSection logId="l1" entries={[entry()]} media={media} onLogChange={vi.fn()} />)

    await user.click(screen.getByRole("button", { name: /Edit entry 12 Mar 2024/ }))
    const format = screen.getByLabelText("Format")
    await user.clear(format)
    await user.type(format, "Hardcover")
    await user.click(screen.getByRole("button", { name: "Save entry" }))

    await waitFor(() => expect(logsApi.editLogEntry).toHaveBeenCalledTimes(1))
    const [logId, entryId, body] = vi.mocked(logsApi.editLogEntry).mock.calls[0]
    expect([logId, entryId]).toEqual(["l1", "e1"])
    expect(body.edition).toEqual({ title: "L'étranger", format: "Hardcover" })
    expect(body.startedAt).toBe("2024-03-12")
    expect(body.finishedAt).toBe("2024-04-02")
  })

  it("disables Add entry at the cap and says why", () => {
    const many = Array.from({ length: 100 }, (_, i) => entry({ id: `e${i}` }))
    renderWithProviders(<EntriesSection logId="l1" entries={many} media={media} onLogChange={vi.fn()} />)
    expect(screen.getByRole("button", { name: "Add entry" })).toBeDisabled()
    expect(screen.getByText(/up to 100 entries/)).toBeInTheDocument()
  })

  it("a finish date before the start date is refused before anything is sent", async () => {
    const user = userEvent.setup()
    renderWithProviders(<EntriesSection logId="l1" entries={[]} media={media} onLogChange={vi.fn()} />)
    await user.click(screen.getByRole("button", { name: "Add entry" }))
    const finished = screen.getByLabelText("Finished")
    await user.type(finished, "2000-01-01")
    await user.click(screen.getByRole("button", { name: "Save entry" }))
    expect(await screen.findAllByText("Finished date can't be before the start date")).not.toHaveLength(0)
    expect(logsApi.addLogEntry).not.toHaveBeenCalled()
  })
})
