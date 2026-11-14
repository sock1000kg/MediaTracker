import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  fetchCollections,
  createCollection,
  addCollectionItem,
  removeCollectionItem,
} from "@/api/collections"
import { normalizeCollectionName } from "@/lib/collectionHelpers"
import type { Log } from "@/types/mainTypes"

interface AddToCollectionDialogProps {
  log: Log
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AddToCollectionDialog({ log, open, onOpenChange }: AddToCollectionDialogProps) {
  const queryClient = useQueryClient()
  const [newColName, setNewColName] = useState("")
  const [error, setError] = useState<string | null>(null)

  const { data: collections = [], isLoading } = useQuery({
    queryKey: ["collections"],
    queryFn: fetchCollections,
    enabled: open,
  })

  const currentIds = new Set(log.collectionIds ?? [])

  const toggleMutation = useMutation({
    mutationFn: async ({ collectionId, isMember }: { collectionId: number; isMember: boolean }) => {
      if (isMember) {
        await removeCollectionItem(collectionId, log.id)
      } else {
        await addCollectionItem(collectionId, log.id)
      }
    },
    onSuccess: (_, { collectionId }) => {
      queryClient.invalidateQueries({ queryKey: ["collections"] })
      queryClient.invalidateQueries({ queryKey: ["collection", collectionId] })
      queryClient.invalidateQueries({ queryKey: ["logs"] })
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : "Failed to update collection")
    },
  })

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const created = await createCollection({ name })
      await addCollectionItem(created.id, log.id)
      return created
    },
    onSuccess: (created) => {
      setNewColName("")
      setError(null)
      queryClient.invalidateQueries({ queryKey: ["collections"] })
      queryClient.invalidateQueries({ queryKey: ["collection", created.id] })
      queryClient.invalidateQueries({ queryKey: ["logs"] })
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : "Failed to create collection")
    },
  })

  const handleToggle = (collectionId: number, isMember: boolean) => {
    setError(null)
    toggleMutation.mutate({ collectionId, isMember })
  }

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    const norm = normalizeCollectionName(newColName)
    if (!norm) {
      setError("Please enter a valid collection name (1-80 characters)")
      return
    }
    setError(null)
    createMutation.mutate(norm)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Add to collection</DialogTitle>
          <DialogDescription>
            Choose which collections include &ldquo;{log.media.title}&rdquo;
          </DialogDescription>
        </DialogHeader>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="max-h-60 overflow-y-auto space-y-2 py-2">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading collections…</p>
          ) : collections.length === 0 ? (
            <p className="text-sm text-muted-foreground">No collections yet. Create one below.</p>
          ) : (
            collections.map((col) => {
              const isMember = currentIds.has(col.id)
              return (
                <label
                  key={col.id}
                  className="flex items-center justify-between rounded-md p-2 hover:bg-muted/50 cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={isMember}
                      disabled={toggleMutation.isPending}
                      onChange={() => handleToggle(col.id, isMember)}
                      className="size-4 rounded border-border-strong text-primary focus:ring-ring"
                      aria-label={`Include in ${col.name}`}
                    />
                    <span className="text-sm font-medium">{col.name}</span>
                  </div>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {col.count} {col.count === 1 ? "item" : "items"}
                  </span>
                </label>
              )
            })
          )}
        </div>

        <form onSubmit={handleCreate} className="flex gap-2 pt-2 border-t border-border">
          <Input
            value={newColName}
            onChange={(e) => setNewColName(e.target.value)}
            placeholder="New collection name…"
            maxLength={80}
            className="flex-1"
            aria-label="New collection name"
          />
          <Button
            type="submit"
            size="sm"
            variant="default"
            disabled={createMutation.isPending || !newColName.trim()}
          >
            <Plus className="size-4" aria-hidden="true" />
            Create
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
