// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { renderWithProviders } from "@/test/render"
import { LogRow } from "@/components/logs/LogRow"
import { LogTile } from "@/components/logs/LogTile"
import { LogActions } from "@/components/logs/LogActions"
import { LogJournalDialog, type JournalSave } from "@/components/logs/LogJournalDialog"
import SidebarDude from "@/components/SidebarDude"
import { WriteLetterDialog } from "./WriteLetterDialog"
import { LettersDialog } from "./LettersDialog"
import { editLog } from "@/api/logs"
import { localDay, logVerb, summaryLine } from "@/lib/letters"
import type { Letter, LetterSummary } from "@/types/letters"
import type { Log } from "@/types/mainTypes"

const apiFetch = vi.fn()
vi.mock("@/api/clientWrapper", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}))

const DAY = 24 * 60 * 60 * 1000

const letter = (over: Partial<Letter> = {}): Letter => ({
  id: "x1", logId: "l1",
  media: { id: "m1", title: "Dune", mediaType: "book" },
  created_at: "2025-03-03T12:00:00.000Z",
  opensAt: null, opensOnRelog: true, openedAt: null, state: "sealed",
  ...over,
})

const log = (over: Partial<Log> = {}): Log => ({
  id: "l1", status: "completed", rating: 90, notes: "", logged_at: "2025-01-01T00:00:00.000Z",
  entries: [], entryCount: 0, tags: [], collectionIds: [],
  media: { id: "m1", title: "Dune", mediaType: { name: "book" } } as Log["media"],
  ...over,
})

let server: { letters: Letter[]; summary: LetterSummary }

/** Calls that write, as [url, method, body]. */
const writes = () =>
  apiFetch.mock.calls
    .filter(([, init]) => Boolean((init as RequestInit | undefined)?.method))
    .map(([url, init]) => {
      const { method, body } = init as RequestInit
      return [url as string, method, body ? JSON.parse(body as string) : undefined] as const
    })

beforeEach(() => {
  sessionStorage.clear()
  server = { letters: [], summary: { sealed: 0, ready: 0, nextOpensAt: null } }
  apiFetch.mockReset()
  apiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === "/letters" && !init?.method) return server.letters
    if (url === "/letters/summary") return server.summary
    if (url.endsWith("/open")) return letter({ state: "opened", openedAt: "2026-01-01T12:00:00.000Z", body: "hello from the past" })
    if (url === "/tags") return []
    if (url === "/logs") return [log()]
    if (url === "/config") throw new Error("defaults")
    return {}
  })
})

describe("writing a letter", () => {
  it("counts characters, needs tomorrow or later for a date, and seals through the API", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderWithProviders(<WriteLetterDialog log={log()} onClose={onClose} />)

    const seal = screen.getByRole("button", { name: "Seal it" })
    const date = screen.getByLabelText("Opening date")
    expect(date).toHaveAttribute("min", localDay(new Date(), { days: 1 }))
    expect(screen.getByText("0/10000")).toBeInTheDocument()
    expect(screen.getByText(/can't be read or changed until then/)).toBeInTheDocument()

    await user.type(screen.getByLabelText("Your letter"), "hi me")
    expect(screen.getByText("5/10000")).toBeInTheDocument()
    expect(seal).toBeDisabled()

    await user.type(date, localDay())
    expect(screen.getByRole("alert")).toHaveTextContent("Pick tomorrow or later")
    expect(seal).toBeDisabled()

    await user.click(screen.getByRole("button", { name: "In 5 years" }))
    expect(date).toHaveValue(localDay(new Date(), { years: 5 }))
    await user.click(seal)

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(writes()).toEqual([["/letters", "POST", { logId: "l1", body: "hi me", opensAt: localDay(new Date(), { years: 5 }), today: localDay() }]])
  })

  it("can open on the next log instead, with no date", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderWithProviders(<WriteLetterDialog log={log()} onClose={onClose} />)

    await user.click(screen.getByRole("radio", { name: "When I log this again" }))
    expect(screen.queryByLabelText("Opening date")).not.toBeInTheDocument()
    await user.type(screen.getByLabelText("Your letter"), "again!")
    await user.click(screen.getByRole("button", { name: "Seal it" }))

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(writes()).toEqual([["/letters", "POST", { logId: "l1", body: "again!", opensOnRelog: true }]])
  })

  it("is offered in a log's ⋯ menu", async () => {
    const user = userEvent.setup()
    renderWithProviders(<LogActions log={log()} onEdit={vi.fn()} onDelete={vi.fn()} />)

    await user.click(screen.getByRole("button", { name: "Actions for Dune" }))
    await user.click(await screen.findByRole("menuitem", { name: "Write a letter to later…" }))

    expect(await screen.findByRole("dialog", { name: "A letter to later" })).toBeInTheDocument()
  })
})

describe("the wax seal on a log", () => {
  const row = (letters?: Log["letters"]) =>
    renderWithProviders(<ul><LogRow log={log({ letters })} onEdit={vi.fn()} onDelete={vi.fn()} /></ul>)

  it("says how many letters are sealed, and nothing without letters", () => {
    const none = row({ sealed: 0, ready: 0 })
    expect(screen.queryByText(/Letter/i)).not.toBeInTheDocument()
    none.unmount()

    const one = row({ sealed: 1, ready: 0 })
    expect(screen.getByText("Letter sealed")).toBeInTheDocument()
    one.unmount()

    row({ sealed: 2, ready: 0 })
    expect(screen.getByText("2 letters sealed")).toBeInTheDocument()
  })

  it("a ready letter wins and opens that log's letters only", async () => {
    const user = userEvent.setup()
    server.letters = [
      letter({ state: "ready" }),
      letter({ id: "x2", logId: "other", media: { id: "m2", title: "Arrival", mediaType: "movie" } }),
    ]
    row({ sealed: 1, ready: 1 })

    await user.click(screen.getByRole("button", { name: "Letter ready" }))

    const dialog = await screen.findByRole("dialog", { name: "Letters" })
    expect(await within(dialog).findByRole("button", { name: "Open" })).toBeInTheDocument()
    expect(within(dialog).queryByText("Arrival")).not.toBeInTheDocument()
  })

  it("on a tile the seal alone has an accessible name", () => {
    renderWithProviders(<ul><LogTile log={log({ letters: { sealed: 1, ready: 0 } })} onEdit={vi.fn()} onDelete={vi.fn()} /></ul>)
    expect(screen.getByRole("img", { name: "Letter sealed" })).toBeInTheDocument()
    expect(screen.queryByText("Letter sealed")).not.toBeInTheDocument()
  })
})

describe("logging something again", () => {
  it("says a board game is played", () => {
    expect(logVerb("boardgame")).toBe("play")
  })

  const saveJournal = async (addEntry: boolean) => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    const target = log()
    renderWithProviders(
      <LogJournalDialog
        open
        onOpenChange={onOpenChange}
        media={{ id: "m1", title: "Dune", mediaType: { name: "book" } }}
        log={target}
        onSave={(save: JournalSave) => editLog({ id: target.id, ...save.log }, save.entries)}
      />
    )
    if (addEntry) {
      await user.click(screen.getAllByRole("button", { name: "Add entry" })[0])
    } else {
      const rating = screen.getByLabelText("Rating out of 100")
      await user.clear(rating)
      await user.type(rating, "80")
    }
    await user.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    return user
  }

  it("offers the waiting letter after a save that added an entry, and opens it", async () => {
    server.letters = [letter({ state: "ready" })]
    const user = await saveJournal(true)

    const prompt = await screen.findByRole("dialog", { name: "You left yourself a letter" })
    expect(prompt).toHaveTextContent("Sealed on 3 Mar 2025, for the next time you read Dune.")
    await user.click(within(prompt).getByRole("button", { name: "Open it" }))

    expect(await screen.findByText("hello from the past")).toBeInTheDocument()
    expect(writes().map(([url]) => url)).toContain("/letters/x1/open")
  })

  it("'Later' closes the prompt without opening", async () => {
    server.letters = [letter({ state: "ready" })]
    const user = await saveJournal(true)

    await user.click(await screen.findByRole("button", { name: "Later" }))

    expect(screen.queryByText("You left yourself a letter")).not.toBeInTheDocument()
    expect(writes().map(([url]) => url)).not.toContain("/letters/x1/open")
  })

  it.each([
    ["no entry was added", false, [letter({ state: "ready" })]],
    ["the ready letter opens on a date", true, [letter({ state: "ready", opensOnRelog: false, opensAt: "2025-06-01T12:00:00.000Z" })]],
    ["the letter belongs to another log", true, [letter({ state: "ready", logId: "other" })]],
  ])("stays quiet when %s", async (_case, addEntry, letters) => {
    server.letters = letters
    await saveJournal(addEntry)
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByText("You left yourself a letter")).not.toBeInTheDocument()
  })
})

describe("the letters list", () => {
  it("writes the summary line", () => {
    const now = new Date("2026-01-01T12:00:00.000Z")
    const next = new Date(now.getTime() + 91 * DAY).toISOString()
    expect(summaryLine({ sealed: 5, ready: 1, nextOpensAt: next }, now)).toBe("5 sealed · 1 ready · next one opens in 3 months")
    expect(summaryLine({ sealed: 0, ready: 0, nextOpensAt: null }, now)).toBe("0 sealed · 0 ready")
  })

  it("groups letters into Ready to open, Opened, and Still sealed in that order, omitting empty groups", async () => {
    const user = userEvent.setup()
    server.letters = [
      letter({ id: "l-ready", state: "ready", media: { id: "m1", title: "Dune", mediaType: "book" } }),
      letter({ id: "l-opened", state: "opened", body: "secret opened text", openedAt: "2026-10-01T10:00:00.000Z", media: { id: "m2", title: "Neuromancer", mediaType: "book" } }),
      letter({ id: "l-sealed", state: "sealed", opensAt: "2027-01-01T12:00:00.000Z", opensOnRelog: false, media: { id: "m3", title: "Snow Crash", mediaType: "book" } }),
    ]
    renderWithProviders(<LettersDialog onClose={vi.fn()} />)

    expect(await screen.findByRole("heading", { name: "Letters" })).toBeInTheDocument()
    expect(await screen.findByRole("heading", { name: "Ready to open" })).toBeInTheDocument()

    const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)
    expect(headings).toEqual(["Ready to open", "Opened", "Still sealed"])

    // The opened row offers "Read", and clicking it shows the text
    const openedRow = screen.getByText("Neuromancer").closest("li")!
    const readBtn = within(openedRow).getByRole("button", { name: "Read" })
    expect(readBtn).toBeInTheDocument()
    await user.click(readBtn)
    expect(await screen.findByText("secret opened text")).toBeInTheDocument()
  })

  it("omits empty group headings", async () => {
    server.letters = [
      letter({ id: "l-sealed", state: "sealed", opensAt: null, opensOnRelog: true, media: { id: "m3", title: "Snow Crash", mediaType: "book" } }),
    ]
    renderWithProviders(<LettersDialog onClose={vi.fn()} />)

    expect(await screen.findByRole("heading", { name: "Letters" })).toBeInTheDocument()
    expect(await screen.findByRole("heading", { name: "Still sealed" })).toBeInTheDocument()
    expect(screen.queryByText("Ready to open")).not.toBeInTheDocument()
    expect(screen.queryByText("Opened")).not.toBeInTheDocument()
  })

  it("shows when each opens, offers Open only when ready, and opening shows the text", async () => {
    const user = userEvent.setup()
    server.summary = { sealed: 2, ready: 1, nextOpensAt: null }
    server.letters = [
      letter({ state: "ready" }),
      letter({ id: "x2", opensOnRelog: false, opensAt: "2027-02-14T12:00:00.000Z" }),
      letter({ id: "x3" }),
    ]
    renderWithProviders(<LettersDialog onClose={vi.fn()} />)

    expect(await screen.findByText("2 sealed · 1 ready")).toBeInTheDocument()
    const [ready, dated, relog] = await screen.findAllByRole("listitem")
    expect(ready).toHaveTextContent("Ready")
    expect(ready).toHaveTextContent("Written 3 Mar 2025")
    expect(dated).toHaveTextContent("Opens on 14 Feb 2027")
    expect(relog).toHaveTextContent("Opens when you log it again")
    expect(within(dated).queryByRole("button", { name: "Open" })).not.toBeInTheDocument()

    await user.click(within(ready).getByRole("button", { name: "Open" }))
    expect(await screen.findByText("hello from the past")).toBeInTheDocument()
  })

  it("asks before tearing a letter up", async () => {
    const user = userEvent.setup()
    server.letters = [letter()]
    renderWithProviders(<LettersDialog onClose={vi.fn()} />)

    await user.click(await screen.findByRole("button", { name: "Actions for the letter about Dune" }))
    await user.click(await screen.findByRole("menuitem", { name: "Tear it up" }))
    const confirm = await screen.findByRole("alertdialog")
    expect(writes()).toEqual([])
    await user.click(within(confirm).getByRole("button", { name: "Tear it up" }))

    await waitFor(() => expect(writes()).toEqual([["/letters/x1", "DELETE", undefined]]))
  })

  it("'+ Write one' picks a log by search, then writes", async () => {
    const user = userEvent.setup()
    renderWithProviders(<LettersDialog onClose={vi.fn()} />)

    await user.click(await screen.findByRole("button", { name: "+ Write one" }))
    await user.type(screen.getByLabelText("Search logs"), "dun")
    await user.click(await screen.findByRole("button", { name: "Dune" }))

    expect(await screen.findByRole("dialog", { name: "A letter to later" })).toBeInTheDocument()
  })
})

describe("the dude's envelope", () => {
  it("has none while nothing is ready", async () => {
    server.summary = { sealed: 3, ready: 0, nextOpensAt: null }
    renderWithProviders(<SidebarDude glance={null} />)

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/letters/summary"))
    expect(screen.queryByTestId("dude-envelope")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Poke the blue guy" })).toBeInTheDocument()
  })

  it("holds it when something is ready, says so, and a click opens the letters", async () => {
    const user = userEvent.setup()
    server.summary = { sealed: 0, ready: 1, nextOpensAt: null }
    server.letters = [letter({ state: "ready" })]
    renderWithProviders(<SidebarDude glance={null} />)

    // 11 grid pixels at his own pixel size (2px at size 32)
    expect(await screen.findByTestId("dude-envelope")).toHaveAttribute("width", "22")
    expect(await screen.findByText("a letter just unsealed!")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "The blue guy is holding a letter. Open your letters" }))

    expect(await screen.findByRole("dialog", { name: "Letters" })).toBeInTheDocument()
  })
})
