import { useEffect } from "react"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import type { EditableEntity } from "@/types/media"

type Mode = "create" | "edit"

interface EntityDialogProps<T extends EditableEntity> {
  mode: Mode
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  confirmText?: string
  cancelText?: string
  initialData?: Partial<T>
  target?: T | null

  onSubmit: (data: Partial<T>, target?: T) => Promise<T> //Submit the form to the DB
  //deprecated when React Queries took care of caching -- manual UI update if needed --
  onSubmitted?: (result: T) => void 

  //Form passed down from parents
  renderForm: (
    formData: Partial<T>,
    setFormData: React.Dispatch<React.SetStateAction<Partial<T>>>
  ) => React.ReactNode
}

export default function EntityDialog<T extends EditableEntity>({
  mode,
  open,
  onOpenChange,
  title,
  confirmText,
  cancelText = "Cancel",
  initialData = {},
  target,
  onSubmit, 
  onSubmitted, 
  renderForm,
}: EntityDialogProps<T>) {
  const [formData, setFormData] = useState<Partial<T>>(initialData)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      // Edit mode
      if (target) {
        setFormData(target) //Render target's info
      } else {
        setFormData(initialData)
      }
      setErrorMessage(null)
    }
  }, [open, target, mode])

  const handleConfirm = async () => {
    if (mode === "edit" && !target) return
    setLoading(true)
    setErrorMessage(null)

    try {
      const result = await onSubmit(formData)
      onSubmitted?.(result)
      onOpenChange(false)
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to save")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {title ?? (mode === "edit" ? "Edit" : "Create")}
          </DialogTitle>
          {errorMessage && (
            <p className="text-sm text-red-500">{errorMessage}</p>
          )}
        </DialogHeader>

        <form onSubmit={(e) => {
            e.preventDefault()
            handleConfirm()
          }}
        >
          <div className="py-2">{renderForm(formData, setFormData)}</div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {cancelText}
            </Button>
            <Button type="submit" variant="amber" disabled={loading}>
              {loading
                ? mode === "edit" ? "Saving..." : "Creating..."
                : confirmText ?? (mode === "edit" ? "Save" : "Create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
