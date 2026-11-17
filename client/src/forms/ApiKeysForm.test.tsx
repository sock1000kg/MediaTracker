// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest"
import { screen, fireEvent, waitFor } from "@testing-library/react"
import { renderWithProviders } from "@/test/render"
import { ApiKeyForm } from "./ApiKeysForm"
import { getApiKeys, addApiKey, updateApiKey, deleteApiKey } from "@/api/apiKey"

vi.mock("@/api/apiKey", () => ({
  getApiKeys: vi.fn(),
  addApiKey: vi.fn(),
  updateApiKey: vi.fn(),
  deleteApiKey: vi.fn(),
}))

describe("ApiKeyForm", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getApiKeys).mockResolvedValue([])
    vi.mocked(addApiKey).mockResolvedValue({ service: "bgg", key: "mock-key" })
    vi.mocked(updateApiKey).mockResolvedValue({ service: "bgg", key: "mock-key" })
    vi.mocked(deleteApiKey).mockResolvedValue({ message: "Key deleted" })
  })

  it("shows all four services, and the two INFO TEXT paragraphs are present verbatim", async () => {
    renderWithProviders(<ApiKeyForm />)

    // Two INFO TEXT paragraphs present verbatim
    const p1 = screen.getByText(
      "Please register and enter your own API keys for these services, otherwise your searches will not be available."
    )
    expect(p1).toBeInTheDocument()

    const p2 = screen.getByText(
      "Your API keys will not be displayed again. Please store them somewhere safe before submitting."
    )
    expect(p2).toBeInTheDocument()

    // All four services shown
    expect(screen.getByText("Last.fm")).toBeInTheDocument()
    expect(screen.getByText("TMDB")).toBeInTheDocument()
    expect(screen.getByText("RAWG")).toBeInTheDocument()
    expect(screen.getByText("BoardGameGeek")).toBeInTheDocument()
  })

  it("a failing update or delete leaves the typed text in the input, while success clears it", async () => {
    vi.mocked(getApiKeys).mockResolvedValue([
      { service: "bgg", key: "bgg-key" },
    ])

    renderWithProviders(<ApiKeyForm />)

    // Wait for the query to resolve and show the Update button for BGG
    const updateBtn = await screen.findByRole("button", { name: "Update" })
    expect(updateBtn).toBeInTheDocument()

    const bggInput = screen.getByPlaceholderText(
      "BoardGameGeek application token. Used for board game search."
    )
    expect(bggInput).toBeInTheDocument()

    // Type new text
    fireEvent.change(bggInput, { target: { value: "invalid-token" } })
    expect(bggInput).toHaveValue("invalid-token")

    // 1. Failing update keeps typed text
    vi.mocked(updateApiKey).mockRejectedValueOnce(new Error("Invalid token rejected"))
    const bggForm = bggInput.closest("form")!
    fireEvent.submit(bggForm)

    await waitFor(() => {
      expect(screen.getByText("Invalid token rejected")).toBeInTheDocument()
    })
    expect(bggInput).toHaveValue("invalid-token")

    // 2. Failing delete keeps typed text
    vi.mocked(deleteApiKey).mockRejectedValueOnce(new Error("Delete failed on network"))
    const deleteBtn = bggForm.querySelector("button[type='button']")!
    fireEvent.click(deleteBtn)

    await waitFor(() => {
      expect(screen.getByText("Delete failed on network")).toBeInTheDocument()
    })
    expect(bggInput).toHaveValue("invalid-token")

    // 3. Successful update clears typed text
    vi.mocked(updateApiKey).mockResolvedValueOnce({ service: "bgg", key: "mock-key" })
    fireEvent.submit(bggForm)

    await waitFor(() => {
      expect(bggInput).toHaveValue("")
    })

    // 4. Successful delete clears typed text
    fireEvent.change(bggInput, { target: { value: "to-delete" } })
    expect(bggInput).toHaveValue("to-delete")
    vi.mocked(deleteApiKey).mockResolvedValueOnce({ message: "Key deleted" })
    fireEvent.click(deleteBtn)

    await waitFor(() => {
      expect(bggInput).toHaveValue("")
    })
  })
})
