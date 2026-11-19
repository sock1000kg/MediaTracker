// @vitest-environment jsdom
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { renderWithProviders } from "@/test/render"
import { MediaForm } from "./MediaForm"
import type { Media } from "@/types/mainTypes"

vi.mock("@/api/mediaType", () => ({
    fetchMediaTypes: vi.fn().mockResolvedValue([]),
}))

function StatefulForm({ initial }: { initial: Partial<Media> }) {
    const [formData, setFormData] = useState<Partial<Media>>(initial)
    return <MediaForm formData={formData} setFormData={setFormData} />
}

describe("MediaForm details fields", () => {
    it("shows stored genres as a categories field, and removing it keeps it removed", async () => {
        const user = userEvent.setup()
        renderWithProviders(
            <StatefulForm initial={{ title: "Interstellar", genres: ["Drama", "Space"], details: { url: "https://example.com" } }} />,
        )

        expect(await screen.findByDisplayValue("Drama, Space")).toBeInTheDocument()

        await user.click(screen.getByRole("button", { name: "Remove categories" }))

        expect(screen.queryByDisplayValue("Drama, Space")).not.toBeInTheDocument()
        expect(screen.queryByRole("button", { name: "Remove categories" })).not.toBeInTheDocument()
        expect(screen.getByDisplayValue("https://example.com")).toBeInTheDocument()
    })
})
