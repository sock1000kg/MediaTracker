// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { Cover } from "./Cover"

describe("Cover component", () => {
  it("renders image when imageUrl is provided", () => {
    const { container } = render(<Cover id={1} title="Loveless" imageUrl="https://coverartarchive.org/release/123/front-250" aspect="square" size="row" />)
    const img = container.querySelector("img")
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute("src", "https://coverartarchive.org/release/123/front-250")
  })

  it("renders lettered fallback when imageUrl is null", () => {
    const { container } = render(<Cover id={1} title="Loveless" imageUrl={null} aspect="square" size="row" />)
    expect(container.querySelector("img")).toBeNull()
    expect(screen.getByText("L")).toBeInTheDocument()
  })

  it("falls back to lettered block on image load error", () => {
    const { container } = render(<Cover id={2} title="Souvlaki" imageUrl="https://coverartarchive.org/release/404/front-250" aspect="square" size="tile" />)
    const img = container.querySelector("img")
    expect(img).toBeInTheDocument()

    // Simulate 404 image load error
    fireEvent.error(img!)

    expect(container.querySelector("img")).toBeNull()
    expect(screen.getByText("S")).toBeInTheDocument()
  })
})
