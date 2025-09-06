import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useMutation } from "@tanstack/react-query"

export default function Login() {
  const navigate = useNavigate()

  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")

  const loginMutation = useMutation({
    mutationFn: async ({ username, password }: {username: string, password: string}) => {
      const res = await fetch("http://localhost:5000/auth/login", { 
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password }),
            credentials: "include",
      })
      const data = await res.json()

      if (!res.ok) throw new Error(data.message || "Login failed")
      return data
    },
    onSuccess: (data) => {
      localStorage.setItem("token", data.token)
      navigate("/homepage")
    },
    onError: (error: any) => {
      console.error(error.message)
    },
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    loginMutation.mutate({ username, password })
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
                    onChange={(e) => { setUsername(e.target.value) }}
                    required
                    disabled={loginMutation.isPending}
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
                disabled={loginMutation.isPending}
              />

          {/* Error message */}
          {loginMutation.error && (
            <p className="mt-2 text-center text-sm text-red-500">
              {loginMutation.error?.message}
            </p>
          )}

            </div>
            <Button 
              type="submit" 
              variant="amber" 
              className="w-full" 
              disabled={loginMutation.isPending}
            >
              {loginMutation.isPending ? "Signing in..." : "Sign in"}
            </Button>
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
