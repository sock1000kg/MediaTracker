// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { screen } from "@testing-library/react"
import { renderWithProviders } from "@/test/render"
import { ProviderAttribution } from "./ProviderAttribution"

describe("ProviderAttribution", () => {
  it("renders a link with proper href, rel, target and children", () => {
    renderWithProviders(
      <ProviderAttribution href="https://example.com/data">
        Data from Example
      </ProviderAttribution>,
    )

    const link = screen.getByRole("link", { name: "Data from Example" })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute("href", "https://example.com/data")
    expect(link).toHaveAttribute("target", "_blank")
    expect(link).toHaveAttribute("rel", "noopener noreferrer")
  })
})
