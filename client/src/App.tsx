import { useEffect, useState } from "react"
import { Routes, Route, useNavigate, Navigate } from "react-router-dom"
import { setNavigate, setOnLogout } from "@/api/clientWrapper"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import { fetchConfig } from "@/api/config"


import Login from "@/pages/auth/Login"
import Register from "@/pages/auth/Register"
import Homepage from "@/pages/Homepage"
import Landing from "@/pages/Landing"

function RootRoute() {
  const token =
    typeof window !== "undefined"
      ? (() => {
          try {
            return localStorage.getItem("accessToken")
          } catch {
            return null
          }
        })()
      : null

  if (token) {
    return <Navigate to="/homepage" replace />
  }
  return <Landing />
}

export default function App() {
  const navigate = useNavigate()
  const [queryClient] = useState(() => new QueryClient())
  
  //Make navigate a function that can be accessed by any component by making a setNavigate global function
  useEffect(() => {
    setNavigate(navigate)
  }, [navigate])

  // Prefetch server limits once at app start
  useEffect(() => {
    queryClient.prefetchQuery({
      queryKey: ["config"],
      queryFn: fetchConfig,
      staleTime: Infinity,
      gcTime: Infinity,
    })
  }, [queryClient])

  // Never show the previous user's cached data after a logout
  useEffect(() => {
    setOnLogout(() => queryClient.clear())
    return () => setOnLogout(null)
  }, [queryClient])

  return (
    <QueryClientProvider client={queryClient}>
      <Routes>
        <Route path="/" element={<RootRoute />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        <Route path="/homepage" element={<Homepage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>

      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  )
}
