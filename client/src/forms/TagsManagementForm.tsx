import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { fetchTags, createTag, renameTag, deleteTag } from "@/api/tags"
import type { Tag } from "@/types/mainTypes"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import EmptyState from "@/components/EmptyState"
import { normalizeTagName } from "@/lib/tagHelpers"

export function TagsManagementForm() {
  const queryClient = useQueryClient()

  const { data: tags = [], isLoading } = useQuery({
    queryKey: ["tags"],
    queryFn: fetchTags,
  })

  // Create tag state
  const [newTagName, setNewTagName] = useState("")
  const [createError, setCreateError] = useState<string | null>(null)

  // Inline rename state
  const [editingTagId, setEditingTagId] = useState<number | null>(null)
  const [editingName, setEditingName] = useState("")
  const [renameError, setRenameError] = useState<string | null>(null)

  // Delete dialog state
  const [tagToDelete, setTagToDelete] = useState<Tag | null>(null)

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["tags"] })
    queryClient.invalidateQueries({ queryKey: ["logs"] })
  }

  const createMutation = useMutation({
    mutationFn: (name: string) => createTag(name),
    onSuccess: () => {
      setNewTagName("")
      setCreateError(null)
      invalidate()
    },
    onError: (err: Error) => {
      if (err.message?.includes("409") || err.message?.toLowerCase().includes("already exists")) {
        setCreateError("A tag with that name already exists")
      } else {
        setCreateError(err.message || "Failed to create tag")
      }
    },
  })

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => renameTag(id, name),
    onSuccess: () => {
      setEditingTagId(null)
      setEditingName("")
      setRenameError(null)
      invalidate()
    },
    onError: (err: Error) => {
      if (err.message?.includes("409") || err.message?.toLowerCase().includes("already exists")) {
        setRenameError("A tag with that name already exists")
      } else {
        setRenameError(err.message || "Failed to rename tag")
      }
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteTag(id),
    onSuccess: () => {
      setTagToDelete(null)
      invalidate()
    },
  })

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const norm = normalizeTagName(newTagName)
    if (!norm) {
      setCreateError("Tag must be 1–40 characters without commas")
      return
    }
    setCreateError(null)
    createMutation.mutate(norm)
  }

  const handleStartRename = (tag: Tag) => {
    setEditingTagId(tag.id)
    setEditingName(tag.name)
    setRenameError(null)
  }

  const handleCancelRename = () => {
    setEditingTagId(null)
    setEditingName("")
    setRenameError(null)
  }

  const handleSaveRename = (tagId: number) => {
    const norm = normalizeTagName(editingName)
    if (!norm) {
      setRenameError("Tag must be 1–40 characters without commas")
      return
    }
    setRenameError(null)
    renameMutation.mutate({ id: tagId, name: norm })
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Create tag */}
      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-base font-semibold text-foreground mb-3">Create a new tag</h2>
        <form onSubmit={handleCreateSubmit} className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={newTagName}
            onChange={(e) => {
              setNewTagName(e.target.value)
              setCreateError(null)
            }}
            placeholder="New tag name (e.g. sci-fi, favorite)"
            className="flex-1 rounded-md border border-input bg-card px-3 py-2 text-sm focus:ring-2 focus:outline-none"
          />
          <Button
            type="submit"
            disabled={createMutation.isPending || !newTagName.trim()}
            className="rounded-md font-medium"
          >
            Create tag
          </Button>
        </form>
        {createError && (
          <p role="alert" className="mt-2 text-xs text-destructive">
            {createError}
          </p>
        )}
      </section>

      {/* Tags list */}
      <section className="rounded-xl border border-border bg-card p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">
            Your tags ({tags.length})
          </h2>
        </div>

        {isLoading && (
          <p className="font-hand text-lg text-muted-foreground animate-pulse">Loading tags…</p>
        )}

        {!isLoading && tags.length === 0 && (
          <EmptyState line="no tags yet. tag your logs to organize them here.">
            <p className="text-sm">Tags created on your logs or above will appear in this list.</p>
          </EmptyState>
        )}

        {!isLoading && tags.length > 0 && (
          <ul className="divide-y divide-border">
            {tags.map((tag) => {
              const isEditing = editingTagId === tag.id

              return (
                <li key={tag.id} className="py-3 flex flex-col gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {isEditing ? (
                      <div className="flex-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                        <input
                          type="text"
                          value={editingName}
                          onChange={(e) => {
                            setEditingName(e.target.value)
                            setRenameError(null)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault()
                              handleSaveRename(tag.id)
                            } else if (e.key === "Escape") {
                              e.preventDefault()
                              handleCancelRename()
                            }
                          }}
                          autoFocus
                          className="flex-1 rounded-md border border-input bg-card px-2.5 py-1 text-sm focus:ring-2 focus:outline-none"
                        />
                        <div className="flex items-center gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            disabled={renameMutation.isPending || !editingName.trim()}
                            onClick={() => handleSaveRename(tag.id)}
                          >
                            Save
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={handleCancelRename}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <span className="user-tag text-xs pointer-events-none">
                            #{tag.name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {tag.count} {tag.count === 1 ? "log" : "logs"}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 px-2.5 text-xs rounded-md"
                            onClick={() => handleStartRename(tag)}
                          >
                            Rename
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            className="h-8 px-2.5 text-xs rounded-md"
                            onClick={() => setTagToDelete(tag)}
                          >
                            Delete
                          </Button>
                        </div>
                      </>
                    )}
                  </div>

                  {isEditing && renameError && (
                    <p role="alert" className="text-xs text-destructive">
                      {renameError}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* Delete confirmation dialog */}
      <Dialog
        open={tagToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setTagToDelete(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete tag “#{tagToDelete?.name}”?</DialogTitle>
            <DialogDescription>
              {tagToDelete?.count === 0
                ? "No logs currently use this tag."
                : `This will remove the tag from ${tagToDelete?.count} ${
                    tagToDelete?.count === 1 ? "log" : "logs"
                  }.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setTagToDelete(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (tagToDelete) deleteMutation.mutate(tagToDelete.id)
              }}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete tag"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
