// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { renderWithProviders } from "@/test/render"
import { SearchHeader } from "./SearchHeader"
import { SEARCH_PLACEHOLDER } from "@/lib/searchQuery"

const base = { title: "Movie search", attribution: { href: "https://example.com", text: "Data" }, value: "", onChange: () => {} }

describe("SearchHeader", () => {
  it("uses the shared placeholder and runs the search on Enter and on click", async () => {
    const onSearch = vi.fn()
    renderWithProviders(<SearchHeader {...base} onSearch={onSearch} busy={false} />)
    await userEvent.type(screen.getByPlaceholderText(SEARCH_PLACEHOLDER), "{enter}")
    await userEvent.click(screen.getByRole("button", { name: "Search" }))
    expect(onSearch).toHaveBeenCalledTimes(2)
  })

  it("disables the search button while a search is running", () => {
    renderWithProviders(<SearchHeader {...base} onSearch={() => {}} busy />)
    expect(screen.getByRole("button", { name: "Search" })).toBeDisabled()
  })
})
