// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { renderWithProviders } from "@/test/render"
import { LogJournalDialog, type JournalSave } from "./LogJournalDialog"
import { initialEntryOfResult, journalMediaOfResult } from "@/lib/journalDraft"
import { editLog } from "@/api/logs"
import { createMediaAndLog } from "@/api/media"
import { getTodayString } from "@/lib/logEntries"
import type { Log, LogEntry } from "@/types/mainTypes"
import type { MediaResult } from "@/types/search"

const apiFetch = vi.fn()
vi.mock("@/api/clientWrapper", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}))

const entry = (over: Partial<LogEntry> = {}): LogEntry => ({
  id: "e1", logId: "l1",
  startedAt: "2024-03-12T00:00:00.000Z", finishedAt: "2024-04-02T00:00:00.000Z",
  progressEpisodes: null, progressChapters: null, progressVolumes: null,
  name: "L'étranger", note: "liked it more this time", edition: { format: "Paperback" },
  created_at: "2024-04-02T00:00:00.000Z", ...over,
})

const baseLog = (over: Partial<Log> = {}): Log => ({
  id: "l1", status: "completed", rating: 70, notes: "main review", logged_at: "2024-01-01T00:00:00.000Z",
  entries: [entry()], entryCount: 1, tags: [], collectionIds: [],
  media: { id: "m1", title: "The Outsider", mediaType: { name: "book" } } as Log["media"],
  ...over,
})

const mediaOf = (log: Log) => ({ id: log.media.id, title: log.media.title, mediaType: { name: "book" } })

/** Calls of apiFetch that write (they carry a method); the tag list and the config are plain reads. */
const writes = () => apiFetch.mock.calls.filter(([, init]) => Boolean((init as { method?: string } | undefined)?.method))
const bodyOf = (call: unknown[]) => JSON.parse((call[1] as { body: string }).body)

function renderEdit(log: Log, onOpenChange = vi.fn()) {
  const utils = renderWithProviders(
    <LogJournalDialog
      open
      onOpenChange={onOpenChange}
      media={mediaOf(log)}
      log={log}
      onSave={(save: JournalSave) => editLog({ id: log.id, ...save.log }, save.entries)}
    />
  )
  return { ...utils, onOpenChange }
}

describe("LogJournalDialog", () => {
  beforeEach(() => {
    apiFetch.mockReset()
    apiFetch.mockImplementation(async (url: string) => (url === "/tags" ? [] : { id: "l1" }))
  })

  it("one Save sends the log change and the new entry (with name and note) in a single request", async () => {
    const user = userEvent.setup()
    const { onOpenChange } = renderEdit(baseLog())

    const rating = screen.getByLabelText("Rating")
    await user.clear(rating)
    await user.type(rating, "85")

    await user.click(screen.getByRole("button", { name: "Add entry" }))
    await user.type(screen.getByLabelText("Name"), "Reread")
    await user.type(screen.getByLabelText("Note"), "even better")
    await user.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(writes()).toHaveLength(1)
    const [url, init] = writes()[0] as [string, { method: string }]
    expect(url).toBe("/logs/l1")
    expect(init.method).toBe("PUT")
    const body = bodyOf(writes()[0])
    expect(body.rating).toBe(85)
    expect(body.entries.create).toEqual([expect.objectContaining({ name: "Reread", note: "even better", startedAt: getTodayString() })])
    expect(body.entries.update).toBeUndefined()
    expect(body.entries.delete).toBeUndefined()
    // adding an entry also set the status to in progress
    expect(body.status).toBe("in progress")
  })

  it("an edited entry and a deleted one go out as update and delete; Undo takes a delete back", async () => {
    const entries = [
      entry({ id: "e1", name: "First read", finishedAt: "2024-04-02T00:00:00.000Z" }),
      entry({ id: "e2", name: "Second read", startedAt: "2023-01-01T00:00:00.000Z", finishedAt: "2023-02-01T00:00:00.000Z", note: null }),
    ]
    const user = userEvent.setup()
    renderEdit(baseLog({ entries, entryCount: 2 }))

    await user.click(screen.getByRole("button", { name: "Edit entry First read" }))
    const name = screen.getByLabelText("Name")
    await user.clear(name)
    await user.type(name, "Renamed")
    await user.click(screen.getByRole("button", { name: "Done" }))

    await user.click(screen.getByRole("button", { name: "Delete entry Second read" }))
    expect(screen.getByText(/Will be deleted on save/)).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Undo" }))
    expect(screen.queryByText(/Will be deleted on save/)).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Delete entry Second read" }))

    await user.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(writes()).toHaveLength(1))
    const body = bodyOf(writes()[0])
    expect(body.entries.update).toEqual([expect.objectContaining({ id: "e1", name: "Renamed" })])
    expect(body.entries.delete).toEqual(["e2"])
    expect(body.entries.create).toBeUndefined()
    expect(body.rating).toBeUndefined() // untouched log fields are not sent
  })

  it("an undone delete sends nothing", async () => {
    const entries = [entry({ id: "e1", name: "First read" })]
    const user = userEvent.setup()
    const { onOpenChange } = renderEdit(baseLog({ entries }))
    await user.click(screen.getByRole("button", { name: "Delete entry First read" }))
    await user.click(screen.getByRole("button", { name: "Undo" }))
    await user.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(writes()).toHaveLength(0)
  })

  it("closing with staged changes asks first; closing without changes does not", async () => {
    const user = userEvent.setup()
    const { onOpenChange, unmount } = renderEdit(baseLog())
    await user.click(screen.getByRole("button", { name: "Cancel" }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    unmount()

    const second = vi.fn()
    renderEdit(baseLog(), second)
    await user.type(screen.getByLabelText("Main review"), " more")
    await user.click(screen.getByRole("button", { name: "Close" }))
    expect(second).not.toHaveBeenCalled()
    const confirm = await screen.findByRole("alertdialog")
    expect(within(confirm).getByText("Discard your changes?")).toBeInTheDocument()
    await user.click(within(confirm).getByRole("button", { name: "Keep editing" }))
    expect(second).not.toHaveBeenCalled()
    await user.keyboard("{Escape}")
    await user.click(await screen.findByRole("button", { name: "Discard" }))
    expect(second).toHaveBeenCalledWith(false)
    expect(writes()).toHaveLength(0)
  })

  it("a long note starts collapsed and Show more expands it", async () => {
    const note = Array.from({ length: 12 }, (_, i) => `line ${i + 1}`).join("\n")
    const user = userEvent.setup()
    renderEdit(baseLog({ entries: [entry({ note })] }))
    const toggle = screen.getByRole("button", { name: "Show more" })
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    await user.click(toggle)
    expect(screen.getByRole("button", { name: "Show less" })).toHaveAttribute("aria-expanded", "true")
  })

  it("a short note has no Show more button", () => {
    renderEdit(baseLog())
    expect(screen.queryByRole("button", { name: /Show more/ })).not.toBeInTheDocument()
    expect(screen.getByText("liked it more this time")).toBeInTheDocument()
  })

  it("an entry without a name shows its dates in its place", () => {
    renderEdit(baseLog({ entries: [entry({ name: null })] }))
    expect(screen.getByText("12 Mar 2024 → 2 Apr 2024")).toBeInTheDocument()
    expect(screen.queryByText(/Untitled/)).not.toBeInTheDocument()
  })

  it("setting the status to completed finishes the open entry today", async () => {
    const open = entry({ id: "open", name: "Current", startedAt: "2026-01-02T00:00:00.000Z", finishedAt: null, note: null })
    const user = userEvent.setup()
    renderEdit(baseLog({ status: "in progress", entries: [open] }))

    await user.click(screen.getByRole("combobox", { name: "Status" }))
    await user.click(await screen.findByRole("option", { name: "Completed" }))
    await user.click(screen.getByRole("button", { name: "Edit entry Current" }))
    expect(screen.getByLabelText("Finished")).toHaveValue(getTodayString())
  })

  it("setting the status to in progress with no open entry stages a new entry started today", async () => {
    const user = userEvent.setup()
    renderEdit(baseLog())
    await user.click(screen.getByRole("combobox", { name: "Status" }))
    await user.click(await screen.findByRole("option", { name: "In Progress" }))
    expect(screen.getByRole("heading", { name: "Entries (2)" })).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(writes()).toHaveLength(1))
    const body = bodyOf(writes()[0])
    expect(body.status).toBe("in progress")
    expect(body.entries.create).toEqual([expect.objectContaining({ startedAt: getTodayString() })])
  })

  it("a date error names the entry and blocks Save", async () => {
    const user = userEvent.setup()
    renderEdit(baseLog())
    await user.click(screen.getByRole("button", { name: "Edit entry L'étranger" }))
    const finished = screen.getByLabelText("Finished")
    await user.clear(finished)
    await user.type(finished, "2024-01-01")
    expect(screen.getByRole("alert", { name: "" })).toHaveTextContent("L'étranger: Finished date can't be before the start date")
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled()
  })

  it("Discard changes restores the saved entry", async () => {
    const user = userEvent.setup()
    renderEdit(baseLog())
    await user.click(screen.getByRole("button", { name: "Edit entry L'étranger" }))
    const name = screen.getByLabelText("Name")
    await user.clear(name)
    await user.type(name, "Something else")
    await user.click(screen.getByRole("button", { name: "Discard changes" }))
    expect(screen.getByText("L'étranger")).toBeInTheDocument()
    expect(screen.queryByText("Something else")).not.toBeInTheDocument()
  })

  it("shows the empty state and the cap message", async () => {
    renderEdit(baseLog({ entries: [], entryCount: 0 }))
    expect(screen.getByText("No entries yet.")).toBeInTheDocument()
  })

  it("create mode from a search result sends the first entry with the matched edition's name, in one request", async () => {
    const result = {
      source: "openlibrary", sourceId: "/works/OL1W", mediaType: "book", title: "L'étranger",
      edition: { title: "The Stranger", language: "English" },
    } as MediaResult
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    renderWithProviders(
      <LogJournalDialog
        open
        onOpenChange={onOpenChange}
        media={journalMediaOfResult(result)}
        initialEntry={initialEntryOfResult(result)}
        onSave={(save) => createMediaAndLog(result, save.log, undefined, save.entry ?? null)}
      />
    )
    expect(screen.getByLabelText("Name")).toHaveValue("The Stranger")
    // one card in create mode; more entries come after the log exists
    expect(screen.getByRole("button", { name: "Add entry" })).toBeDisabled()
    expect(screen.getByText("Save the log to add more entries")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(writes()).toHaveLength(1)
    const [url] = writes()[0] as [string]
    expect(url).toBe("/media/media-log")
    const body = bodyOf(writes()[0])
    expect(body.entry).toEqual(expect.objectContaining({ name: "The Stranger", edition: { language: "English" } }))
  })

  it("tags are sent only when they change: untouched tags are omitted, adding a tag sends the full list", async () => {
    const user = userEvent.setup()
    const logWithTag = baseLog({ tags: [{ id: "t1", name: "fiction" }] })
    const { onOpenChange, unmount } = renderEdit(logWithTag)

    // Edit only the rating: PUT body has no tags key
    const rating = screen.getByLabelText("Rating")
    await user.clear(rating)
    await user.type(rating, "85")
    await user.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(writes()).toHaveLength(1)
    expect(bodyOf(writes()[0]).rating).toBe(85)
    expect(bodyOf(writes()[0]).tags).toBeUndefined()

    unmount()
    apiFetch.mockClear()

    // Add a tag: body has the full tag list
    const onOpenChange2 = vi.fn()
    renderEdit(logWithTag, onOpenChange2)
    const tagsInput = screen.getByLabelText("Tags")
    await user.type(tagsInput, "classic{Enter}")
    await user.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => expect(onOpenChange2).toHaveBeenCalledWith(false))
    expect(writes()).toHaveLength(1)
    const body2 = bodyOf(writes()[0])
    expect(body2.tags).toEqual(["fiction", "classic"])
  })
})
