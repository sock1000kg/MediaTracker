import { addApiKey, deleteApiKey, updateApiKey } from "@/api/apiKey"
import { Button } from "@/components/ui/button"
import { fetchApiKeysQueryOptions } from "@/queryOptions/fetchApiKeysQueryOptions"

import type { AllowedSource, ApiKey } from "@/types/mainTypes"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { TMDB_ATTRIBUTION } from "@/lib/movieFormat"
import { RAWG_URL, RAWG_ATTRIBUTION_TEXT } from "@/lib/gameFormat"

interface ServiceConfig {
    service: AllowedSource
    label: string
    placeholder?: string
    attribution?: React.ReactNode
}

const SERVICES: ServiceConfig[] = [
    { service: "lastfm", label: "Last.fm", placeholder: "Last.fm API Key. Used for music search." },
    { service: "tmdb", label: "TMDB", placeholder: "TMDB API Key or read access token. Used for movie search.", attribution: TMDB_ATTRIBUTION },
    {
        service: "rawg",
        label: "RAWG",
        placeholder: "RAWG API Key. Used for game search.",
        attribution: (
            <a href={RAWG_URL} target="_blank" rel="noopener noreferrer" className="text-link underline-offset-4 hover:underline">
                {RAWG_ATTRIBUTION_TEXT}
            </a>
        ),
    },
    { service: "bgg", label: "BoardGameGeek", placeholder: "BoardGameGeek application token. Used for board game search." },
]

function ApiKeyRow({
    config,
    hasKey,
    onCreate,
    onUpdate,
    onDelete,
}: {
    config: ServiceConfig
    hasKey: boolean
    onCreate: (service: AllowedSource, val: string) => Promise<void>
    onUpdate: (service: AllowedSource, val: string) => Promise<boolean>
    onDelete: (service: AllowedSource) => Promise<boolean>
}) {
    const [input, setInput] = useState("")

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (hasKey) {
            const ok = await onUpdate(config.service, input)
            if (ok) setInput("")
        } else {
            await onCreate(config.service, input)
            setInput("")
        }
    }

    const handleDelete = async () => {
        const ok = await onDelete(config.service)
        if (ok) setInput("")
    }

    return (
        <form onSubmit={handleSubmit}>
            <label className="block mb-4">
                <span className="text-foreground font-medium">{config.label}</span>
                <div className="flex gap-4 mt-1">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        className="block w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:ring-2 focus:outline-none "
                        placeholder={config.placeholder}
                    />

                    {hasKey ? (
                        <Button
                            type="submit"
                            variant="amber"
                            disabled={!input}
                        >
                            Update
                        </Button>
                    ) : (
                        <Button
                            type="submit"
                            variant="amber"
                            disabled={!input}
                        >
                            Add
                        </Button>
                    )}
                    <Button
                        type="button"
                        variant="destructive"
                        onClick={handleDelete}
                    >
                        Delete
                    </Button>
                </div>
                {config.attribution && (
                    <span className="block text-muted-foreground text-xs mt-1">
                        {config.attribution}
                    </span>
                )}
            </label>
        </form>
    )
}

// This form only allows updating the key
export function ApiKeyForm() {
    const [serverMessage, setServerMessage] = useState<string | null>(null) //message when delete a key
    const queryClient = useQueryClient()

    const { data: apiKeys = [], error, isPending } = useQuery(fetchApiKeysQueryOptions())

    //Mutations
    const createMutation = useMutation({
        mutationFn: (key: ApiKey) => addApiKey(key),
        onSuccess: () => {
            queryClient.invalidateQueries({queryKey: fetchApiKeysQueryOptions().queryKey})
        }
    })

    const updateMutation = useMutation({
        mutationFn: (key: ApiKey) => updateApiKey(key),
        onSuccess: () => {
            queryClient.invalidateQueries({queryKey: fetchApiKeysQueryOptions().queryKey})
        }
    })

    const deleteMutation = useMutation({
        mutationFn: (key: ApiKey) => deleteApiKey(key),
        onSuccess: () => {
            queryClient.invalidateQueries({queryKey: fetchApiKeysQueryOptions().queryKey})
        }
    })

    //Handlers
    const handleCreate = async (service: AllowedSource, value: string) => {
        const payload: ApiKey = { key: value, service }
        await createMutation.mutateAsync(payload)
    }

    const handleUpdate = async (service: AllowedSource, value: string): Promise<boolean> => {
        const payload: ApiKey = { key: value, service }
        try {
            await updateMutation.mutateAsync(payload)
            return true
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Something went wrong"
            setServerMessage(message)
            setTimeout(() => setServerMessage(null), 3000) //clears message after delay
            return false
        }
    }

    const handleDelete = async (service: AllowedSource): Promise<boolean> => {
        try {
            const res = await deleteMutation.mutateAsync({ service, key: "" })
            setServerMessage(res.message)

            // Immediately remove the key from cache to update UI (it'll be stuck when server responds with empty array)
            queryClient.setQueryData<ApiKey[]>(
                fetchApiKeysQueryOptions().queryKey,
                (oldData) => oldData?.filter(k => k.service !== service) ?? []
            )

            setTimeout(() => setServerMessage(null), 3000) //clears message after delay
            return true
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Something went wrong"
            setServerMessage(message)
            setTimeout(() => setServerMessage(null), 3000) //clears message after delay
            return false
        }
    }

    return (
        <div className="px-4">
            {/* INFO TEXT */}
            <p className="text-muted-foreground text-sm">
                Please register and enter your own API keys for these services, otherwise your searches will not be available.
            </p>
            <p className="text-muted-foreground text-xs mb-4">
                Your API keys will not be displayed again. Please store them somewhere safe before submitting.
            </p>

            {/* LOADING */}
            {isPending && <p className="text-muted-foreground animate-pulse">Checking your API Keys...</p>}
            {/* Error message */}
            {error && (
                <p className="mt text-center text-sm text-destructive">
                    {error.message}
                </p>
            )}
            {serverMessage && (
                <p className="text-center text-sm text-link mb-2">
                    {serverMessage}
                </p>
            )}

            {/* GOOGLE BOOKS
            <form onSubmit={
                hasGoogleBooksKey 
                ? handleUpdate("google_books", googleBooksInput) 
                : handleCreate("google_books", googleBooksInput)
            }>
                <label className="block mb-4">
                    <span className="text-foreground font-medium">Google Books</span>
                    <div className="flex gap-4 mt-1">
                        <input
                            type="text"
                            value={googleBooksInput ?? ""}
                            onChange={(e) =>
                                setGoogleBooksInput(e.target.value)
                            }
                            className="block w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:ring-2 focus:outline-none "
                            placeholder="Google Books API Key"
                        />

                        {hasGoogleBooksKey ? 
                        <Button
                            type="submit"
                            variant="amber"  
                        >
                            Update
                        </Button> :
                        <Button
                            type="submit"
                            variant="amber"  
                        >
                            Add
                        </Button>}
                        <Button
                            type="button"
                            variant="destructive"
                            onClick={handleDelete("google_books")}  
                        >
                            Delete
                        </Button>
                    </div>
                </label>
            </form> */}

            {SERVICES.map((config) => (
                <ApiKeyRow
                    key={config.service}
                    config={config}
                    hasKey={apiKeys.some((k) => k.service === config.service)}
                    onCreate={handleCreate}
                    onUpdate={handleUpdate}
                    onDelete={handleDelete}
                />
            ))}
        </div>
    )
}
