import { useEffect } from "react"
import { Routes, Route, useNavigate, Navigate } from "react-router-dom"
import { setNavigate } from "@/api/clientWrapper"

import Login from "./pages/auth/Login"
import Register from "./pages/auth/Register"
import Homepage from "./pages/Homepage"

export default function App() {
  const navigate = useNavigate()
  
  //Make navigate a function that can be accessed by any component by making a setNavigate global function
  useEffect(() => {
    setNavigate(navigate)
  }, [navigate])

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route path="/homepage" element={<Homepage />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}
