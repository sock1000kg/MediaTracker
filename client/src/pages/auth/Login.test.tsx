// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, screen } from "@testing-library/react"
import Login from "./Login"
import Register from "./Register"
import { renderWithProviders } from "@/test/render"
import * as configApi from "@/api/config"
import { DEFAULT_LIMITS } from "@/hooks/useLimits"

describe("Login page demo card", () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it("shows the demo card when config has demo credentials, and 'Fill in the form for me' fills both fields and focuses password", async () => {
    vi.spyOn(configApi, "fetchConfig").mockResolvedValue({
      limits: DEFAULT_LIMITS,
      demo: {
        username: "demo",
        password: "SecretDemoPassword123",
      },
    })

    renderWithProviders(<Login />)

    // Demo card appears
    expect(await screen.findByText("Just looking?")).toBeInTheDocument()
    expect(screen.getByText("user: demo")).toBeInTheDocument()
    expect(screen.getByText("pass: SecretDemoPassword123")).toBeInTheDocument()

    // No copy button
    expect(screen.queryByRole("button", { name: /copy/i })).not.toBeInTheDocument()

    const usernameInput = screen.getByLabelText("Username") as HTMLInputElement
    const passwordInput = screen.getByLabelText("Password") as HTMLInputElement

    expect(usernameInput.value).toBe("")
    expect(passwordInput.value).toBe("")

    const fillButton = screen.getByRole("button", { name: "Fill in the form for me" })
    fireEvent.click(fillButton)

    // Form is filled
    expect(usernameInput.value).toBe("demo")
    expect(passwordInput.value).toBe("SecretDemoPassword123")

    // Password input is focused
    expect(document.activeElement).toBe(passwordInput)
  })

  it("does not render the demo card when demo is null", async () => {
    vi.spyOn(configApi, "fetchConfig").mockResolvedValue({
      limits: DEFAULT_LIMITS,
      demo: null,
    })

    renderWithProviders(<Login />)

    // Wait for query to settle
    await screen.findByRole("button", { name: "Sign in" })

    expect(screen.queryByText("Just looking?")).not.toBeInTheDocument()
    expect(screen.queryByText("Fill in the form for me")).not.toBeInTheDocument()
  })

  it("does not show demo card on Register page even if demo config is set", async () => {
    vi.spyOn(configApi, "fetchConfig").mockResolvedValue({
      limits: DEFAULT_LIMITS,
      demo: {
        username: "demo",
        password: "SecretDemoPassword123",
      },
    })

    renderWithProviders(<Register />)

    await screen.findByRole("button", { name: "Sign up" })

    expect(screen.queryByText("Just looking?")).not.toBeInTheDocument()
    expect(screen.queryByText("Fill in the form for me")).not.toBeInTheDocument()
  })
})
