// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ResultRow } from "./ResultRow"
import type { SearchResult } from "@/lib/resultView"

const book = (extra: Partial<SearchResult> = {}): SearchResult => ({
  source: "openlibrary", sourceId: "/works/OL1W", mediaType: "book",
  title: "L'étranger", creator: "Albert Camus", year: "1942", imageUrl: null, ...extra,
} as SearchResult)

describe("ResultRow", () => {
  it("shows Logged (2) and an Add entry button for a log with two entries", async () => {
    const onAddEntry = vi.fn()
    const user = userEvent.setup()
    render(<ResultRow result={book()} kind="book" isLogged entryCount={2} onLog={vi.fn()} onAddEntry={onAddEntry} />)
    expect(screen.getByText("Logged (2)")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Edit log" })).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Add entry" }))
    expect(onAddEntry).toHaveBeenCalledTimes(1)
  })

  it("shows plain Logged for a single entry, and nothing logged for an unlogged result", () => {
    const { rerender } = render(<ResultRow result={book()} kind="book" isLogged entryCount={1} onLog={vi.fn()} onAddEntry={vi.fn()} />)
    expect(screen.getByText("Logged")).toBeInTheDocument()
    rerender(<ResultRow result={book()} kind="book" isLogged={false} onLog={vi.fn()} onAddEntry={vi.fn()} />)
    expect(screen.queryByText(/Logged/)).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Add entry" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "+ Log" })).toBeInTheDocument()
  })

  it("an Open Library result shows the matched edition's title, with the work title as the subtitle", () => {
    render(<ResultRow result={book({ edition: { title: "The Stranger", language: "English" } })} kind="book" isLogged={false} onLog={vi.fn()} />)
    expect(screen.getByRole("heading", { name: "The Stranger" })).toBeInTheDocument()
    expect(screen.getByText("L'étranger")).toBeInTheDocument()
  })

  it("without a different edition title there is no subtitle", () => {
    render(<ResultRow result={book({ edition: { title: "L'étranger" } })} kind="book" isLogged={false} onLog={vi.fn()} />)
    expect(screen.getAllByText("L'étranger")).toHaveLength(1)
  })
})
