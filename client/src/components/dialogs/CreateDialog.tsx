import { useEffect } from "react"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import type { EditableEntity } from "@/types/media"

interface CreateDialogProps <T extends EditableEntity> {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (data: Partial<T>) => Promise<T>
  onCreated?: (newType: T) => void
  title?: string
  confirmText?: string
  cancelText?: string
  initialData?: Partial<T>
  renderForm: (
    formData: Partial<T>,
    setFormData: React.Dispatch<React.SetStateAction<Partial<T>>>
  ) => React.ReactNode
}

export default function CreateDialog<T extends EditableEntity>({
  open,
  onOpenChange,
  title = "Create",
  confirmText = "Create",
  cancelText = "Cancel",
  initialData = {},
  onCreate,
  onCreated,
  renderForm,  
}: CreateDialogProps<T>) {
  const [formData, setFormData] = useState<Partial<T>>(initialData)

  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Reset form when opening
  useEffect(() => {
    if (open) {
      setFormData(initialData)
      setErrorMessage(null)
    }
  }, [open])

  const handleConfirm = async () => {
    setLoading(true)
    setErrorMessage(null)

    try {
      const result = await onCreate(formData)
      onCreated?.(result)
      onOpenChange(false)
      setFormData(initialData)
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to create")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>

          <DialogTitle>{title}</DialogTitle>
          {errorMessage && <p className="text-sm text-red-500">{errorMessage}</p>}
        </DialogHeader>

        <form onSubmit={(e) => { 
          e.preventDefault()
          handleConfirm() 
          }}
        >
          {/* Form fields provided by parent */}
          <div className="py-2">{renderForm(formData, setFormData)}</div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {cancelText}
            </Button>
            <Button type="submit" variant="amber" disabled={loading}>
              {loading ? "Creating..." : confirmText}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
