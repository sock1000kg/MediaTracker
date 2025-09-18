import { addApiKey, deleteApiKey, updateApiKey } from "@/api/apiKey"
import { Button } from "@/components/ui/button"
import { fetchApiKeysQueryOptions } from "@/queryOptions/fetchApiKeysQueryOptions"

import type { AllowedSource, ApiKey } from "@/types/main"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

// This form only allows updating the key
export function ApiKeyForm() {
    const [serverMessage, setServerMessage] = useState<string | null>(null) //message when delete a key
    const [ggBooksInput, setGgBooksInput] = useState("")
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
    const handleCreate = (service: AllowedSource) => 
        async (e: React.FormEvent) => {
            e.preventDefault()
            const payload: ApiKey = { key: ggBooksInput, service: service }
            await createMutation.mutateAsync(payload)
            setGgBooksInput("")
    }

    const handleUpdate = (service: AllowedSource) =>
        async (e: React.FormEvent) => {
            e.preventDefault()
            const payload: ApiKey = { key: ggBooksInput, service: service }
            try{
                await updateMutation.mutateAsync(payload)
                setGgBooksInput("")
            }catch(error: any){
                setServerMessage(error.message || "Something went wrong")
                setTimeout(() => setServerMessage(null), 3000) //clears message after delay
            }
    }

    const handleDelete = (service: AllowedSource) => 
        async () => {
            try {
                const res = await deleteMutation.mutateAsync({ service: service, key: "" })
                setServerMessage(res.message)
                setGgBooksInput("")

                // Immediately remove the key from cache to update UI (it'll be stuck when server responds with empty array)
                queryClient.setQueryData<ApiKey[]>(
                    fetchApiKeysQueryOptions().queryKey,
                    (oldData) => oldData?.filter(k => k.service !== service) ?? []
                )

                setTimeout(() => setServerMessage(null), 3000) //clears message after delay
            } catch (error: any) {
                setServerMessage(error.message || "Something went wrong")
                setTimeout(() => setServerMessage(null), 3000) //clears message after delay
            }
    }

    // Render
    const hasGoogleBooksKey = apiKeys.some(key => key.service === "google_books")

    return (
        <div className="px-4">
            {isPending && <p className="text-gray-500">Checking your API Keys...</p>}
            {/* Error message */}
            {error && (
                <p className="mt text-center text-sm text-red-500">
                    {error.message}
                </p>
            )}
            {serverMessage && (
                <p className="text-center text-sm text-green-600 mb-2">
                    {serverMessage}
                </p>
            )}
            <p className="text-gray-500 text-sm">
                Please register and enter your own API keys for these services, otherwise your searches will be limited to the API service's restrictions.
            </p>
            <p className="text-gray-500 text-xs mb-4">
                Your API keys will not be displayed again. Please store them somewhere safe before submitting.
            </p>
            {/* GOOGLE BOOKS */}
            <form onSubmit={hasGoogleBooksKey ? handleUpdate("google_books") : handleCreate("google_books")}>
                <label className="block mb-4">
                    <span className="text-stone-800">Google Books</span>
                    <div className="flex gap-4 mt-1">
                        <input
                            type="text"
                            value={ggBooksInput ?? ""}
                            onChange={(e) =>
                                setGgBooksInput(e.target.value)
                            }
                            className="block w-full rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm focus:ring-2 focus:outline-none "
                            placeholder="Google Books API Key"
                        />

                        {/* Create/edit button depending on whether user has apikey */}
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
            </form>
        </div>
    )
}
