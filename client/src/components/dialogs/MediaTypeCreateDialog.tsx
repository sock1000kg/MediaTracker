import { createMediaType } from "@/api/mediaType"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

interface MediaTypeFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: (newType: any) => void
}

export default function MediaTypeCreateDialog({ open, onOpenChange, onCreated  }: MediaTypeFormProps) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    try {
      setLoading(true)
      const data = await createMediaType(name)
      if (onCreated) onCreated(data)

      setName("")
      onOpenChange(false)
      setErrorMessage(null)

    } catch (error: any) {
      setErrorMessage(error.message || "Failed to create media type")
    } finally {
      setLoading(false)
    }
  }

  return (
    // the first onOpenChange is the Dialog's, and the second is the MediaTypeForm's. Shadcn's Diaglog only opens if open={open === "mediaTypeForm"} returns true
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a new Media Type</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            placeholder="Media type name (e.g. Book, Movie, Game)"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              if (errorMessage) setErrorMessage(null)
            }}
          />

            {/* Error message */}
            {errorMessage && (
                <p className="mt-2 text-center text-sm text-red-500">
                    {errorMessage}
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
