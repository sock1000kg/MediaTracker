import BlueDude from "@/components/BlueDude"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { useMutation, useQueryClient } from "@tanstack/react-query"

export default function Register() {
    const navigate = useNavigate()
    const queryClient = useQueryClient()

    const [username, setUsername] = useState("")
    const [displayName, setDisplayName] = useState("")
    const [password, setPassword] = useState("")
    const [registerKey, setRegisterKey] = useState("")

    const registerMutation = useMutation({
        mutationFn: async ({ username, password, displayName, registerKey }
            : {username: string, password: string, displayName: string, registerKey: string}) => {
            const API_BASE = import.meta.env.VITE_API_URL
            const res = await fetch(`${API_BASE}/auth/register`, { 
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password, displayName, registerKey }),
            credentials: "include",
        })
            const data = await res.json()

            if (!res.ok) throw new Error(data.message || "Register failed")
            return data
        },
        onSuccess: (data) => {
            queryClient.clear() // drop the previous user's cached data first
            localStorage.setItem("accessToken", data.accessToken)
            navigate("/homepage")
        },
        onError: (error: unknown) => {
            const msg = error instanceof Error ? error.message : "Failed to register"
            console.error(msg)
        },
    })

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        registerMutation.mutate({ username, password, displayName, registerKey })
    }

    return (
        <div className="flex min-h-screen items-center justify-center pt-24">
        <div className="relative w-full max-w-sm">
        <div className="absolute -top-[72px] left-1/2 z-0 -translate-x-1/2">
            <BlueDude size={96} />
        </div>
        <Card className="relative z-10 w-full shadow-paper">
            
            <CardHeader>
            <CardTitle className="font-display text-2xl font-semibold text-center">Pull up a chair</CardTitle>
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
                </div>

                <div className="space-y-2">
                    <Label className="mb-0.5" htmlFor="password">Registration Key</Label>
                    <p className="text-xs text-muted-foreground">Contact me if you want an account</p>
                    <Input
                        id="registerKey"
                        type="text"
                        value={registerKey}
                        onChange={(e) => setRegisterKey(e.target.value)}
                        required
                        disabled={registerMutation.isPending}
                    />
                </div>

                {/* Error message */}
                {registerMutation.isError && (
                    <p className="mt-2 text-center text-sm text-destructive">
                    {registerMutation.error instanceof Error
                        ? registerMutation.error.message : "An unexpected error occured"}
                    </p>
                )}

                <Button 
                    type="submit" 
                    variant="amber" 
                    className="w-full"
                >
                    {registerMutation.isPending ? "Signing up..." : "Sign up"}
                </Button>
            </form>


            {/* Switch to login */}
            <p className="mt-4 text-center text-sm text-foreground">
                Already have an account? <Link to="/login" className="underline">Sign in</Link>
            </p>
            </CardContent>
        </Card>
        </div>
        </div>
    )
}
