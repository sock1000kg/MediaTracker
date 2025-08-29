import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useState } from "react"
import { useNavigate } from "react-router-dom"

export default function Login() {
    const [username, setUsername] = useState("")
    const [password, setPassword] = useState("")
    const [error, setError] = useState<string | null>(null)

    const navigate = useNavigate()

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault()
      setError(null)

      try {
          const res = await fetch("http://localhost:5000/auth/login", { 
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password }),
            credentials: "include",
          })

          const data = await res.json()

          if (res.ok && data.token) {
            localStorage.setItem("token", data.token)

            console.log("Login success:", data)

            navigate("/dashboard")
          } else {
            setError(data.error || "Login failed")
          }
      } catch (error) {
          console.error("Error:", error)
          setError("Something went wrong")
      }
  }

  return (
    <div className="flex min-h-screen items-center justify-center  bg-stone-100">
      <Card className="w-full max-w-sm shadow-2xl">

        <CardHeader>
          <CardTitle className="text-2xl font-bold text-center">Login</CardTitle>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">

            <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                    id="username"
                    type="username"
                    placeholder="YourUsername"
                    value={username}
                    onChange={(e) => {
                        const value = e.target.value
                        setUsername(value)

                        // Check if there are spaces
                        if(/\s/.test(value)) {
                            setError("Username cannot contain spaces")
                        } else {
                            setError(null)
                        }
                    }}
                    required
                />
                </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />

          {/* Error message */}
          {error && (
            <p className="mt-2 text-center text-sm text-red-500">
              {error}
            </p>
          )}

            </div>
            <Button type="submit" variant="amber" className="w-full">Sign in</Button>
          </form>

          {/* Switch to register */}
          <p className="mt-4 text-center text-sm text-stone-900">
            Don’t have an account? <a href="/register" className="underline">Sign up</a>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
