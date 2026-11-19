// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import App from "./App"
import * as configApi from "@/api/config"
import { DEFAULT_LIMITS } from "@/hooks/useLimits"

vi.mock("@/pages/Homepage", () => ({
  default: () => <div data-testid="homepage-page">Homepage Content</div>,
}))

describe("App route handling for /", () => {
  beforeEach(() => {
    localStorage.clear()
    vi.spyOn(configApi, "fetchConfig").mockResolvedValue({
      limits: DEFAULT_LIMITS,
      demo: null,
    })
  })

  it("logged-out visitor at / sees the landing page with both pills", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>
    )

    // Landing page is displayed
    const checkMeOut = await screen.findByRole("link", { name: "Check me out" })
    const tryItOut = screen.getByRole("link", { name: "Try it out" })

    expect(checkMeOut).toHaveAttribute("href", "https://sock1000kg.io.vn/")
    expect(tryItOut).toHaveAttribute("href", "/login")
    expect(screen.queryByTestId("homepage-page")).not.toBeInTheDocument()
  })

  it("logged-in visitor at / redirects to /homepage", async () => {
    localStorage.setItem("accessToken", "valid-access-token")

    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>
    )

    // Visitor is sent straight to homepage
    expect(await screen.findByTestId("homepage-page")).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Check me out" })).not.toBeInTheDocument()
  })

  it("unknown path redirects to /login", async () => {
    render(
      <MemoryRouter initialEntries={["/some/unknown/path"]}>
        <App />
      </MemoryRouter>
    )

    // Login page shows "Welcome back"
    expect(await screen.findByText("Welcome back")).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Check me out" })).not.toBeInTheDocument()
  })
})
