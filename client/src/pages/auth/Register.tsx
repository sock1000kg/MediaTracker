import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useMutation } from "@tanstack/react-query"

export default function Register() {
    const navigate = useNavigate()

    const [username, setUsername] = useState("")
    const [displayName, setDisplayName] = useState("")
    const [password, setPassword] = useState("")

    const registerMutation = useMutation({
        mutationFn: async ({ username, password, displayName }: {username: string, password: string, displayName: string}) => {
            const API_BASE = import.meta.env.VITE_API_URL
            const res = await fetch(`${API_BASE}/auth/register`, { 
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password, displayName}),
            credentials: "include",
        })
            const data = await res.json()

            if (!res.ok) throw new Error(data.message || "Registen failed")
            return data
        },
        onSuccess: (data) => {
            localStorage.setItem("accessToken", data.accessToken)
            localStorage.setItem("refreshToken", data.refreshToken)
            navigate("/homepage")
        },
        onError: (error: any) => {
            console.error(error.message)
        },
    })

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        registerMutation.mutate({ username, password, displayName })
    }

    return (
        <div className="flex min-h-screen items-center justify-center  bg-stone-100">
        <Card className="w-full max-w-sm shadow-2xl">
            
            <CardHeader>
            <CardTitle className="text-2xl font-bold text-center">Register</CardTitle>
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
                />
                </div>

                <div className="space-y-2">
                <Label htmlFor="displayName">Display Name</Label>
                <Input
                    id="displayName"
                    type="text"
                    placeholder="Your Display Name"
                    value={displayName}
                    onChange={(e) => { setDisplayName(e.target.value) }}
                    required
                    disabled={registerMutation.isPending}
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
                    disabled={registerMutation.isPending}
                />

            {/* Error message */}
            {registerMutation.isError && (
                <p className="mt-2 text-center text-sm text-red-500">
                {registerMutation.error?.message}
                </p>
            )}
            
                </div>
                <Button 
                    type="submit" 
                    variant="amber" 
                    className="w-full"
                >
                    {registerMutation.isPending ? "Signing up..." : "Sign up"}
                </Button>
            </form>


            {/* Switch to login */}
            <p className="mt-4 text-center text-sm text-stone-900">
                Already have an account? <a href="/login" className="underline">Sign in</a>
            </p>
            </CardContent>
        </Card>
        </div>
    )
}
