import { createMediaType } from "@/api/mediaType"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

import type { DialogName } from "@/types/media"

interface MediaTypeFormProps {
  open: DialogName
  onOpenChange: (open: DialogName) => void
  onCreated?: (newType: any) => void
  error?: string | null
  setError?: (message: string | null) => void
}

export default function MediaTypeForm({ open, onOpenChange, onCreated, error, setError  }: MediaTypeFormProps) {
  const [name, setName] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    try {
      setLoading(true)
      const token = localStorage.getItem("token")
      const data = await createMediaType(name, token)
      if (onCreated) onCreated(data)

      setName("")
      onOpenChange(null)
      setError?.(null)

    } catch (err: any) {
      setError?.(err.message || "Failed to create media type")
    } finally {
      setLoading(false)
    }
  }

  return (
    // the first onOpenChange is the Dialog's, and the second is the MediaTypeForm's. Shadcn's Diaglog only opens if open={open === "mediaTypeForm"} returns true
    <Dialog open={open === "mediaTypeForm"} onOpenChange={(isOpen) => onOpenChange(isOpen ? "mediaTypeForm" : null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a new Media Type</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            placeholder="Media type name (e.g. Book, Movie, Game)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

            {/* Error message */}
            {error && (
                <p className="mt-2 text-center text-sm text-red-500">
                    {error}
                </p>
            )}

          <DialogFooter>
            <Button type="submit" variant="amber" disabled={loading}>
              {loading ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
