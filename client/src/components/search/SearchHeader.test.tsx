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

  it("renders attribution logo without plate by default", () => {
    renderWithProviders(
      <SearchHeader
        {...base}
        attribution={{
          ...base.attribution,
          logo: { src: "/tmdb.svg", alt: "TMDB" },
        }}
        onSearch={() => {}}
        busy={false}
      />
    )
    const img = screen.getByRole("img", { name: "TMDB" })
    expect(img).toBeInTheDocument()
    expect(img.parentElement?.tagName).toBe("A")
  })

  it("renders attribution logo with white plate when plate is true", () => {
    renderWithProviders(
      <SearchHeader
        {...base}
        attribution={{
          ...base.attribution,
          logo: { src: "/bgg.svg", alt: "Powered by BGG", plate: true },
        }}
        onSearch={() => {}}
        busy={false}
      />
    )
    const img = screen.getByRole("img", { name: "Powered by BGG" })
    expect(img).toBeInTheDocument()
    expect(img.parentElement?.tagName).toBe("SPAN")
    expect(img.parentElement).toHaveClass("bg-white")
  })

  it("puts a provider logo before its credit text when asked, and after it otherwise", () => {
    const { unmount } = renderWithProviders(
      <SearchHeader {...base} attribution={{ href: "https://x.test", text: "Credit text", logo: { src: "logo.svg", alt: "Logo", before: true } }} onSearch={() => {}} busy={false} />
    )
    const link = screen.getByRole("link", { name: /Credit text/ })
    expect(link.firstElementChild?.getAttribute("alt")).toBe("Logo")
    unmount()

    renderWithProviders(
      <SearchHeader {...base} attribution={{ href: "https://x.test", text: "Credit text", logo: { src: "logo.svg", alt: "Logo" } }} onSearch={() => {}} busy={false} />
    )
    const after = screen.getByRole("link", { name: /Credit text/ })
    expect(after.lastElementChild?.getAttribute("alt")).toBe("Logo")
    expect(after.textContent?.startsWith("Credit text")).toBe(true)
  })
})
