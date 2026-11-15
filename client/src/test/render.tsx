import type { ReactElement, ReactNode } from "react"
import { render, type RenderOptions } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router-dom"

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: Infinity,
      },
      mutations: {
        retry: false,
      },
    },
  })
}

interface WrapperProps {
  children: ReactNode
}

export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, "wrapper"> & { queryClient?: QueryClient },
) {
  const queryClient = options?.queryClient ?? createTestQueryClient()

  function Wrapper({ children }: WrapperProps) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    )
  }

  return {
    queryClient,
    ...render(ui, { wrapper: Wrapper, ...options }),
  }
}
