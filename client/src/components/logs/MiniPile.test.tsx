// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { renderWithProviders } from "@/test/render"
import LogsSection from "@/pages/sections/LogSection"
import type { Log } from "@/types/mainTypes"

const apiFetch = vi.fn()
vi.mock("@/api/clientWrapper", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}))

// Mid-month local times, so the test doesn't depend on the machine's time zone
const NOW = new Date(2026, 10, 20, 12)
const month = new Intl.DateTimeFormat(undefined, { month: "long" }).format(NOW)

const log = (id: string, title: string, logged: Date, over: Partial<Log> = {}): Log => ({
  id, status: "completed", rating: null, notes: "", logged_at: logged.toISOString(),
  entries: [], entryCount: 0, tags: [], collectionIds: [],
  media: { id: `m-${id}`, title, mediaType: { name: "book" } } as Log["media"],
  ...over,
})

let logs: Log[]

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(NOW)
  localStorage.clear()
  apiFetch.mockReset()
  apiFetch.mockImplementation(async (url: string) => {
    if (url === "/logs") return logs
    if (url === "/letters/summary") return { sealed: 0, ready: 0, nextOpensAt: null }
    if (url === "/preferences") return {}
    return []
  })
})

afterEach(() => {
  vi.useRealTimers()
})

const pile = () => screen.findByRole("region", { name: "This month's pile" })
const drawnObjects = (section: HTMLElement) => section.querySelectorAll("svg > g, svg > circle")

describe("this month's pile on the Logs page", () => {
  it("counts only this month's logs, going by the log date", async () => {
    logs = [
      log("a", "Dune", new Date(2026, 10, 3, 12)),
      log("b", "Emma", new Date(2026, 9, 15, 12)),
      // Logged long ago, read again this month
      log("c", "Ulysses", new Date(2025, 0, 15, 12), {
        entries: [{ id: "e1", finishedAt: new Date(2026, 10, 10, 12).toISOString() }] as Log["entries"],
      }),
      // Same month, last year
      log("d", "Walden", new Date(2025, 10, 15, 12)),
    ]
    renderWithProviders(<LogsSection />)

    const section = await pile()
    expect(within(section).getByText(`${month}'s pile · 2`)).toBeInTheDocument()
    expect(drawnObjects(section)).toHaveLength(2)
    expect(section.querySelector("svg")).toHaveAttribute("aria-hidden", "true")
  })

  it("ignores the page's search", async () => {
    logs = [log("a", "Dune", new Date(2026, 10, 3, 12)), log("b", "Emma", new Date(2026, 10, 4, 12))]
    renderWithProviders(<LogsSection />)
    const section = await pile()

    await userEvent.type(screen.getByRole("textbox"), "zzzz")
    expect(await screen.findByText("No logs match your filters.")).toBeInTheDocument()
    expect(within(section).getByText(`${month}'s pile · 2`)).toBeInTheDocument()
  })

  it("keeps the card, with only the ground, when nothing was logged this month", async () => {
    logs = [log("b", "Emma", new Date(2026, 9, 15, 12))]
    renderWithProviders(<LogsSection />)

    const section = await pile()
    expect(within(section).getByText(`${month}'s pile is empty so far`)).toBeInTheDocument()
    expect(drawnObjects(section)).toHaveLength(0)
  })

  it("shows no card when the user has no logs at all", async () => {
    logs = []
    renderWithProviders(<LogsSection />)

    expect(await screen.findByText("Search for a media and create one!")).toBeInTheDocument()
    expect(screen.queryByRole("region", { name: "This month's pile" })).not.toBeInTheDocument()
  })
})
