// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import ThemeIconSwitch from "./ThemeIconSwitch"
import { commitThemePref, getThemePref } from "@/lib/theme"

describe("ThemeIconSwitch component", () => {
  beforeEach(() => {
    localStorage.clear()
    commitThemePref("system")
  })

  afterEach(() => {
    localStorage.clear()
  })

  it("renders three icon buttons with proper labels and initial aria-pressed", () => {
    render(<ThemeIconSwitch />)

    const lightBtn = screen.getByRole("button", { name: "Light theme" })
    const darkBtn = screen.getByRole("button", { name: "Dark theme" })
    const sysBtn = screen.getByRole("button", { name: "Follow the system theme" })

    expect(lightBtn).toBeInTheDocument()
    expect(darkBtn).toBeInTheDocument()
    expect(sysBtn).toBeInTheDocument()

    // Initially system is active
    expect(lightBtn).toHaveAttribute("aria-pressed", "false")
    expect(darkBtn).toHaveAttribute("aria-pressed", "false")
    expect(sysBtn).toHaveAttribute("aria-pressed", "true")
  })

  it("clicking theme buttons sets the theme and updates aria-pressed", () => {
    render(<ThemeIconSwitch />)

    const lightBtn = screen.getByRole("button", { name: "Light theme" })
    const darkBtn = screen.getByRole("button", { name: "Dark theme" })
    const sysBtn = screen.getByRole("button", { name: "Follow the system theme" })

    // Click Light
    fireEvent.click(lightBtn)
    expect(getThemePref()).toBe("light")
    expect(lightBtn).toHaveAttribute("aria-pressed", "true")
    expect(darkBtn).toHaveAttribute("aria-pressed", "false")
    expect(sysBtn).toHaveAttribute("aria-pressed", "false")

    // Click Dark
    fireEvent.click(darkBtn)
    expect(getThemePref()).toBe("dark")
    expect(lightBtn).toHaveAttribute("aria-pressed", "false")
    expect(darkBtn).toHaveAttribute("aria-pressed", "true")
    expect(sysBtn).toHaveAttribute("aria-pressed", "false")

    // Click System
    fireEvent.click(sysBtn)
    expect(getThemePref()).toBe("system")
    expect(lightBtn).toHaveAttribute("aria-pressed", "false")
    expect(darkBtn).toHaveAttribute("aria-pressed", "false")
    expect(sysBtn).toHaveAttribute("aria-pressed", "true")
  })
})
