// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import Landing from "./Landing"

describe("Landing page", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("renders the wordmark, headline, sub-line, and footer", () => {
    render(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>
    )

    expect(screen.getByText("MediaTracker")).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Log everything you read, watch, play and listen to." })
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Books, music, anime, movies, TV, games and board games, in one journal you can host yourself\./)
    ).toBeInTheDocument()

    // Footer
    const githubLink = screen.getByRole("link", { name: "GitHub" })
    expect(githubLink).toHaveAttribute("href", "https://github.com/sock1000kg/MediaTracker")
    expect(
      screen.getByText(/Data from Open Library, Last\.fm, AniList, TMDB, RAWG and BoardGameGeek\./)
    ).toBeInTheDocument()
  })

  it("renders the mascot illustration as role='img' with aria-label, and both pills with correct hrefs", () => {
    render(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>
    )

    const illustration = screen.getByRole("img", {
      name: "The blue guy holding out two buttons, one in each hand",
    })
    expect(illustration).toBeInTheDocument()

    // Check me out pill
    const checkMeOut = screen.getByRole("link", { name: "Check me out" })
    expect(checkMeOut).toHaveAttribute("href", "https://sock1000kg.io.vn/")
    // Should NOT have target="_blank" (opens in the same tab per §16)
    expect(checkMeOut).not.toHaveAttribute("target")

    // Try it out pill
    const tryItOut = screen.getByRole("link", { name: "Try it out" })
    expect(tryItOut).toHaveAttribute("href", "/login")
  })

  it("changes dude glance when hovering or focusing the pills", () => {
    const { container } = render(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>
    )

    const checkMeOut = screen.getByRole("link", { name: "Check me out" })
    const tryItOut = screen.getByRole("link", { name: "Try it out" })

    // Hover check me out -> eyes glance left (dx = -1)
    fireEvent.mouseEnter(checkMeOut)
    // Find the eye rects: EYE_COLS are 5 and 10; row is 5. When glance='left', cols are 4 and 9
    const eyesLeft = Array.from(container.querySelectorAll("svg rect")).filter(
      (r) => r.getAttribute("y") === "5" && (r.getAttribute("x") === "4" || r.getAttribute("x") === "9")
    )
    expect(eyesLeft).toHaveLength(2)

    // Mouse leave -> idle (cols 5 and 10)
    fireEvent.mouseLeave(checkMeOut)
    const eyesIdle = Array.from(container.querySelectorAll("svg rect")).filter(
      (r) => r.getAttribute("y") === "5" && (r.getAttribute("x") === "5" || r.getAttribute("x") === "10")
    )
    expect(eyesIdle).toHaveLength(2)

    // Focus try it out -> eyes glance right (cols 6 and 11)
    fireEvent.focus(tryItOut)
    const eyesRight = Array.from(container.querySelectorAll("svg rect")).filter(
      (r) => r.getAttribute("y") === "5" && (r.getAttribute("x") === "6" || r.getAttribute("x") === "11")
    )
    expect(eyesRight).toHaveLength(2)

    // Blur try it out -> idle
    fireEvent.blur(tryItOut)
    const eyesIdleAgain = Array.from(container.querySelectorAll("svg rect")).filter(
      (r) => r.getAttribute("y") === "5" && (r.getAttribute("x") === "5" || r.getAttribute("x") === "10")
    )
    expect(eyesIdleAgain).toHaveLength(2)
  })

  it("follows the visual tab order in the DOM", () => {
    const { container } = render(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>
    )

    const focusable = Array.from(container.querySelectorAll("button, a"))
    const names = focusable.map((el) => el.getAttribute("aria-label") || el.textContent?.trim())

    expect(names).toEqual([
      "Light theme",
      "Dark theme",
      "Follow the system theme",
      "Check me out",
      "Try it out",
      "GitHub",
    ])
  })
})
