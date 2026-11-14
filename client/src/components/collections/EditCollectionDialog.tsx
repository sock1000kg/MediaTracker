import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { normalizeCollectionName } from "@/lib/collectionHelpers"
import { useLimits } from "@/hooks/useLimits"
import type { CreateCollectionInput } from "@/types/mainTypes"

interface EditCollectionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialValues?: {
    name: string
    description?: string | null
    ranked?: boolean
  }
  title: string
  submitText: string
  onSubmit: (values: CreateCollectionInput) => Promise<void>
}

export function EditCollectionDialog({
  open,
  onOpenChange,
  initialValues,
  title,
  submitText,
  onSubmit,
}: EditCollectionDialogProps) {
  const limits = useLimits()
  const [name, setName] = useState(initialValues?.name ?? "")
  const [description, setDescription] = useState(initialValues?.description ?? "")
  const [ranked, setRanked] = useState(initialValues?.ranked ?? false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open) {
      setName(initialValues?.name ?? "")
      setDescription(initialValues?.description ?? "")
      setRanked(initialValues?.ranked ?? false)
      setError(null)
    }
  }, [open, initialValues])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const norm = normalizeCollectionName(name, limits.collections.nameMaxLength)
    if (!norm) {
      setError(`Please enter a valid collection name (1-${limits.collections.nameMaxLength} characters)`)
      return
    }

    setLoading(true)
    setError(null)
    try {
      await onSubmit({
        name: norm,
        description: description.trim() ? description.trim() : null,
        ranked,
      })
      onOpenChange(false)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">{title}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="space-y-1">
            <Label htmlFor="col-name">Name</Label>
            <Input
              id="col-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Favorite Sci-Fi"
              maxLength={limits.collections.nameMaxLength}
              required
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="col-desc">Description (optional)</Label>
            <textarea
              id="col-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A few words about this list…"
              maxLength={limits.collections.descMaxLength}
              rows={3}
              className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              id="col-ranked"
              type="checkbox"
              checked={ranked}
              onChange={(e) => setRanked(e.target.checked)}
              className="size-4 rounded border-border-strong text-primary focus:ring-ring"
            />
            <Label htmlFor="col-ranked" className="cursor-pointer font-normal">
              Ranked (shows numbers 1, 2, 3…)
            </Label>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="default" disabled={loading}>
              {loading ? "Saving…" : submitText}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
