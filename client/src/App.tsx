import { useEffect } from "react"
import { Routes, Route, useNavigate, Navigate } from "react-router-dom"
import { setNavigate } from "@/api/clientWrapper"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"


import Login from "@/pages/auth/Login"
import Register from "@/pages/auth/Register"
import Homepage from "@/pages/Homepage"

export default function App() {
  const navigate = useNavigate()
  const queryClient = new QueryClient()
  
  //Make navigate a function that can be accessed by any component by making a setNavigate global function
  useEffect(() => {
    setNavigate(navigate)
  }, [navigate])

  return (
    <QueryClientProvider client={queryClient}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        <Route path="/homepage" element={<Homepage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>

      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  )
}
