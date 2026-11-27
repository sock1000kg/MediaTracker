// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { renderWithProviders } from "@/test/render"
import StatsSection from "@/pages/sections/StatsSection"
import LogsSection from "@/pages/sections/LogSection"
import { StatsPile } from "./StatsPile"
import { WaxSeal } from "@/components/letters/WaxSeal"
import * as logsApi from "@/api/logs"
import type { Log } from "@/types/mainTypes"

vi.mock("@/api/logs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/logs")>()
  return {
    ...actual,
    fetchLogs: vi.fn(),
  }
})

const apiFetch = vi.fn()
vi.mock("@/api/clientWrapper", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}))

const NOW = new Date(2026, 10, 20, 12)

const makeLog = (id: string, title: string, type: string, logged: Date, over: Partial<Log> = {}): Log => ({
  id,
  status: "completed",
  rating: null,
  notes: "",
  logged_at: logged.toISOString(),
  entries: [{ id: `e-${id}`, logId: id, finishedAt: logged.toISOString() } as Log["entries"][0]],
  entryCount: 1,
  tags: [],
  collectionIds: [],
  media: {
    id: `m-${id}`,
    title,
    mediaType: { name: type },
    details: {},
  } as Log["media"],
  ...over,
})

describe("Stats pile", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(NOW)
    localStorage.clear()
    apiFetch.mockReset()
    apiFetch.mockImplementation(async (url: string) => {
      if (url === "/preferences") return {}
      if (url === "/letters/summary") return { sealed: 0, ready: 0, nextOpensAt: null }
      return []
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("on the Stats page: shows the selected period and count for only that period's logs, and switching type tab updates count and appends the type", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    // Logs in two different months (October 2026 and November 2026) and 2025, different types
    const logs: Log[] = [
      makeLog("1", "Dune", "book", new Date(2026, 10, 5, 12)),
      makeLog("2", "Neuromancer", "book", new Date(2026, 10, 10, 12)),
      makeLog("3", "Blade Runner", "movie", new Date(2026, 10, 12, 12)),
      makeLog("4", "Old Book", "book", new Date(2026, 9, 15, 12)),
      makeLog("5", "Past Book", "book", new Date(2025, 5, 1, 12)),
    ]
    vi.mocked(logsApi.fetchLogs).mockResolvedValue(logs)

    renderWithProviders(<StatsSection />)

    // By default for 2026 logs, initialRange picks year 2026 (excluding the 2025 log)
    const pile = await screen.findByRole("region", { name: "Your pile" })
    expect(within(pile).getByText("2026 · 4")).toBeInTheDocument()

    // Switching type tab to "Book" updates count and appends type suffix (3 books in 2026, excluding 2025 book)
    const bookTab = await screen.findByRole("tab", { name: "Book" })
    await user.click(bookTab)

    expect(within(pile).getByText("2026 · 3 · Book")).toBeInTheDocument()
  })

  it("no pile section appears on the Logs page any more", async () => {
    const logs: Log[] = [makeLog("1", "Dune", "book", new Date(2026, 10, 5, 12))]
    apiFetch.mockImplementation(async (url: string) => {
      if (url === "/logs") return logs
      if (url === "/letters/summary") return { sealed: 0, ready: 0, nextOpensAt: null }
      if (url === "/preferences") return {}
      return []
    })

    renderWithProviders(<LogsSection />)

    await waitFor(() => {
      expect(screen.getByText("Dune")).toBeInTheDocument()
    })

    expect(screen.queryByRole("region", { name: "Your pile" })).not.toBeInTheDocument()
    expect(screen.queryByRole("region", { name: "This month's pile" })).not.toBeInTheDocument()
  })

  it("shows 'Nothing logged in this period' when there are no logs in the selection", () => {
    renderWithProviders(<StatsPile logs={[]} range={{ mode: "year", year: 2026 }} />)
    expect(screen.getByText("Nothing logged in this period")).toBeInTheDocument()
  })

  it("formats title for all time, last 12 months, and month ranges", () => {
    const logs = [makeLog("1", "Dune", "book", new Date(2026, 10, 5, 12))]
    const { rerender } = renderWithProviders(<StatsPile logs={logs} range={{ mode: "all" }} />)
    expect(screen.getByText("All time · 1")).toBeInTheDocument()

    rerender(<StatsPile logs={logs} range={{ mode: "last12" }} />)
    expect(screen.getByText("Last 12 months · 1")).toBeInTheDocument()

    const month = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(new Date(2026, 10, 1))
    rerender(<StatsPile logs={logs} range={{ mode: "month", year: 2026, month: 11 }} />)
    expect(screen.getByText(`${month} · 1`)).toBeInTheDocument()
  })

  it("draws anime discs with a dark bottom edge strip", async () => {
    const logs = [makeLog("1", "Akira", "anime", new Date(2026, 10, 5, 12))]
    const { container } = renderWithProviders(<StatsPile logs={logs} range={{ mode: "all" }} />)
    await waitFor(() => {
      expect(container.querySelector("[data-pile-body]")).toBeInTheDocument()
    })
    // Slabs and discs have the 28% black edge rect
    const edgeRect = container.querySelector('rect[fill="rgb(0 0 0 / 0.28)"]')
    expect(edgeRect).toBeInTheDocument()
  })

  it("with reduced motion, shows one positioned object per drawn log once matter-js loads", async () => {
    vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    }) as unknown as MediaQueryList)

    const logs = [
      makeLog("1", "Dune", "book", new Date(2026, 10, 5, 12)),
      makeLog("2", "Akira", "anime", new Date(2026, 10, 6, 12)),
    ]
    const { container } = renderWithProviders(<StatsPile logs={logs} range={{ mode: "all" }} />)

    await waitFor(() => {
      const groups = container.querySelectorAll("[data-pile-body]")
      expect(groups).toHaveLength(2)
      for (const group of groups) {
        expect(group.getAttribute("transform")).toMatch(/^translate\(/)
        expect(group.getAttribute("visibility")).toBe("visible")
      }
    })
  })

  it("with motion allowed, runs frames until the pile is done and then stops", async () => {
    vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    }) as unknown as MediaQueryList)

    let nextId = 1
    const pending = new Map<number, FrameRequestCallback>()
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      const id = nextId
      nextId += 1
      pending.set(id, cb)
      return id
    })
    vi.stubGlobal("cancelAnimationFrame", (id: number) => { pending.delete(id) })

    const logs = [
      makeLog("1", "Dune", "book", new Date(2026, 10, 5, 12)),
      makeLog("2", "Akira", "anime", new Date(2026, 10, 6, 12)),
    ]
    const { container } = renderWithProviders(<StatsPile logs={logs} range={{ mode: "all" }} />)

    await waitFor(() => expect(pending.size).toBeGreaterThan(0))

    let frames = 0
    while (pending.size > 0 && frames < 2000) {
      const [id, cb] = pending.entries().next().value as [number, FrameRequestCallback]
      pending.delete(id)
      cb(0)
      frames += 1
    }

    // The loop stopped on its own, well before the step cap
    expect(frames).toBeGreaterThan(0)
    expect(frames).toBeLessThan(1500)
    expect(pending.size).toBe(0)
    for (const group of container.querySelectorAll("[data-pile-body]")) {
      expect(group.getAttribute("transform")).toMatch(/^translate\(/)
      expect(group.getAttribute("visibility")).toBe("visible")
    }
  })

  it("hides the whole old pile when the selection changes, then shows each object as it enters", async () => {
    vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    }) as unknown as MediaQueryList)

    let nextId = 1
    const pending = new Map<number, FrameRequestCallback>()
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      const id = nextId
      nextId += 1
      pending.set(id, cb)
      return id
    })
    vi.stubGlobal("cancelAnimationFrame", (id: number) => { pending.delete(id) })

    const runFrames = () => {
      let frames = 0
      while (pending.size > 0 && frames < 2000) {
        const [id, cb] = pending.entries().next().value as [number, FrameRequestCallback]
        pending.delete(id)
        cb(0)
        frames += 1
      }
      return frames
    }

    const shared = makeLog("1", "Dune", "book", new Date(2026, 10, 5, 12))
    const dropped = makeLog("2", "Akira", "anime", new Date(2026, 10, 6, 12))
    const { container, rerender } = renderWithProviders(
      <StatsPile logs={[shared, dropped]} range={{ mode: "all" }} />,
    )

    await waitFor(() => expect(pending.size).toBeGreaterThan(0))
    runFrames()
    expect(pending.size).toBe(0)
    for (const group of container.querySelectorAll("[data-pile-body]")) {
      expect(group.getAttribute("visibility")).toBe("visible")
    }

    // The new selection shares log 1 and adds log 3, so the shared node survives.
    const added = makeLog("3", "Neuromancer", "book", new Date(2026, 10, 7, 12))
    rerender(<StatsPile logs={[shared, added]} range={{ mode: "all" }} />)

    // Before running any new frame, nothing from the old pile may still show.
    expect(pending.size).toBeGreaterThan(0)
    for (const group of container.querySelectorAll("[data-pile-body]")) {
      expect(group.getAttribute("visibility")).not.toBe("visible")
    }

    runFrames()
    for (const group of container.querySelectorAll("[data-pile-body]")) {
      expect(group.getAttribute("visibility")).toBe("visible")
    }
  })
})

describe("WaxSeal tones", () => {
  it("renders correct fills and strokes for sealed, ready, and opened", () => {
    const { container: cSealed } = renderWithProviders(<WaxSeal tone="sealed" />)
    const pSealed = cSealed.querySelector("path")!
    const cirSealed = cSealed.querySelector("circle")!
    expect(pSealed.getAttribute("fill")).toBe("var(--wax)")
    expect(pSealed.getAttribute("stroke")).toBeNull()
    expect(cirSealed.getAttribute("stroke")).toBe("var(--wax-dark)")

    const { container: cReady } = renderWithProviders(<WaxSeal tone="ready" />)
    const pReady = cReady.querySelector("path")!
    const cirReady = cReady.querySelector("circle")!
    expect(pReady.getAttribute("fill")).toBe("var(--gold)")
    expect(cirReady.getAttribute("stroke")).toBe("var(--gold-dark)")

    const { container: cOpened } = renderWithProviders(<WaxSeal tone="opened" />)
    const pOpened = cOpened.querySelector("path")!
    const cirOpened = cOpened.querySelector("circle")!
    expect(pOpened.getAttribute("fill")).toBe("none")
    expect(pOpened.getAttribute("stroke")).toBe("var(--muted-foreground)")
    expect(cirOpened.getAttribute("stroke")).toBe("var(--muted-foreground)")
  })
})
