// @vitest-environment jsdom
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { screen } from "@testing-library/react"
import { renderWithProviders, createTestQueryClient } from "@/test/render"
import { LogForm } from "./LogForm"
import type { Log, Media } from "@/types/mainTypes"
import * as configApi from "@/api/config"

vi.mock("@/api/tags", () => ({
  fetchTags: vi.fn().mockResolvedValue([]),
}))

const dummyMedia: Media = {
  id: 1,
  userId: 1,
  title: "Test Movie",
  creator: "Director",
  sourceId: null,
  description: null,
  created_at: "2024-01-01T00:00:00.000Z",
  mediaType: {
    id: 1,
    userId: 1,
    name: "movie",
    created_at: "2024-01-01T00:00:00.000Z",
  },
}

function StatefulLogForm({ initial = {} }: { initial?: Partial<Log> }) {
  const [formData, setFormData] = useState<Partial<Log>>(initial)
  return <LogForm formData={formData} setFormData={setFormData} targetMedia={dummyMedia} />
}

describe("LogForm limits integration", () => {
  it("when mocked config says notes max is 123, the log form notes counter shows /123", async () => {
    vi.spyOn(configApi, "fetchConfig").mockResolvedValue({
      limits: {
        notes: { maxLength: 123 },
        tags: { maxLength: 40, maxPerLog: 20, maxPerUser: 500 },
        collections: {
          nameMaxLength: 80,
          descMaxLength: 1000,
          maxPerUser: 200,
          maxItemsPerCollection: 1000,
        },
        imports: { maxFileBytes: 10 * 1024 * 1024 },
        search: { queryMaxLength: 100 },
      },
    })

    const queryClient = createTestQueryClient()
    await queryClient.prefetchQuery({
      queryKey: ["config"],
      queryFn: configApi.fetchConfig,
    })

    renderWithProviders(<StatefulLogForm initial={{ notes: "hello" }} />, { queryClient })

    expect(await screen.findByText("5/123")).toBeInTheDocument()
  })
})
