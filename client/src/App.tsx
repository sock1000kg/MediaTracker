import { Routes, Route, Navigate } from "react-router-dom"
import Login from "./pages/auth/Login"
import Register from "./pages/auth/Register"
import Homepage from "./pages/Homepage"

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route path="/dashboard" element={<Homepage />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}
