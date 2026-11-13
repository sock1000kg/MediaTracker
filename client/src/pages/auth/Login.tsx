import BlueDude from "@/components/BlueDude"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { useMutation, useQueryClient } from "@tanstack/react-query"

export default function Login() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")

  const loginMutation = useMutation({
    mutationFn: async ({ username, password }: {username: string, password: string}) => {
      const API_BASE = import.meta.env.VITE_API_URL
      const res = await fetch(`${API_BASE}/auth/login`, { 
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
      queryClient.clear() // drop the previous user's cached data first
      localStorage.setItem("accessToken", data.accessToken)
      navigate("/homepage")
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : "Failed to login"
      console.error(msg)
    },
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    loginMutation.mutate({ username, password })
  }

  return (
    <div className="flex min-h-screen items-center justify-center pt-24">
      <div className="relative w-full max-w-sm">
      <div className="absolute -top-[72px] left-1/2 z-0 -translate-x-1/2">
        <BlueDude size={96} label="A small blue creature, grinning" />
      </div>
      <p className="absolute -top-[60px] left-1/2 z-0 ml-14 -rotate-3 whitespace-nowrap font-hand text-lg text-muted-foreground">
        oh, it’s you!
      </p>
      <Card className="relative z-10 w-full shadow-paper">

        <CardHeader>
          <CardTitle className="font-display text-2xl font-semibold text-center">Welcome back</CardTitle>
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
          {loginMutation.isError && (
            <p className="mt-2 text-center text-sm text-destructive">
              {loginMutation.error instanceof Error
                ? loginMutation.error.message : "An unexpected error occured"}
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
          <p className="mt-4 text-center text-sm text-foreground">
            Don’t have an account? <Link to="/register" className="underline">Sign up</Link>
          </p>
        </CardContent>
      </Card>
      </div>
    </div>
  )
}
