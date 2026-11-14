// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, render, screen } from "@testing-library/react"
import SidebarDude from "./SidebarDude"
import { dudeSay, POKES_BEFORE_SLEEP } from "@/lib/dude"

describe("SidebarDude component", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    sessionStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("shows text on dudeSay and hides after specified ms", () => {
    render(<SidebarDude glance="down" />)

    const statusRegion = screen.getByRole("status")
    expect(statusRegion).toBeEmptyDOMElement()

    act(() => {
      dudeSay("hi", 1000)
    })

    expect(statusRegion).toHaveTextContent("hi")

    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(statusRegion).toBeEmptyDOMElement()
  })

  it("shows nothing on dude:say event while asleep", () => {
    render(<SidebarDude glance="down" />)

    const pokeButton = screen.getByRole("button", { name: "Poke the blue guy" })

    // Poke until asleep (POKES_BEFORE_SLEEP pokes)
    for (let i = 0; i < POKES_BEFORE_SLEEP; i++) {
      act(() => {
        pokeButton.click()
      })
    }

    // Now he should be asleep
    expect(screen.getByRole("button", { name: "The blue guy is asleep" })).toBeInTheDocument()

    // Advance past the "going to sleep" bubble
    act(() => {
      vi.advanceTimersByTime(5000)
    })

    const statusRegion = screen.getByRole("status")
    expect(statusRegion).toBeEmptyDOMElement()

    // Dispatch dudeSay while asleep
    act(() => {
      dudeSay("wake up!", 1000)
    })

    // Still empty because he is asleep
    expect(statusRegion).toBeEmptyDOMElement()
  })
})
