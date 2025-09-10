import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import type { MediaType } from "@/types/main"
import { useState, useEffect } from "react"

interface ConfirmDeleteDialogProps<T = string> {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  description?: string
  confirmText?: string
  cancelText?: string
  target: T | null
  /** Function that performs the delete (target, confirm: bool) */
  onWarning: (target: T) => Promise<{ message: string }>
  onDelete: (target: T) => Promise<{ message: string }>
}

export function ConfirmDeleteDialog<T = MediaType>({
  open,
  onOpenChange,
  title = "Confirm Deletion",
  description,
  confirmText = "Delete",
  cancelText = "Cancel",
  target,
  onWarning,
  onDelete,
}: ConfirmDeleteDialogProps<T>) {
  const [warning, setWarning] = useState<string | null>(null) //For confirmation
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null) //For when sth went wrong or bad request

  //Make sure the request is sent upon opening the dialog to fetch warning 
  //(if done in handOpenChange instead, the target is somehow out of sync with 'open' and req is never sent)
  useEffect(() => {
  if (open && target) {
    setLoading(true)
    setError(null)
    onWarning(target)
      .then((result) => setWarning(result.message))
      .catch((err: any) => setError(err.message))
      .finally(() => setLoading(false))
    }
  }, [open, target])

  //Reset everything upon closing
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setWarning(null)
      setError(null)
      setLoading(false)
      onOpenChange(false)
    } else {
      onOpenChange(true)
    }
  }

  //This is called when the user click Delete when dialog is opened
  const handleConfirm = async () => {
    if (!target) return
    setLoading(true)
    setError(null)
    try {
      const result = await onDelete(target)
      onOpenChange(false)
      alert(result.message)
    } catch (error: any) {
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {/* Render only error OR description/warning */}
          {error ? (
            <p className="text-sm text-red-500 mt-2">{error}</p>
          ) : (
            <AlertDialogDescription>
              {warning ?? description ?? "Are you sure you want to delete this item?"}
            </AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>{cancelText}</AlertDialogCancel>
          
            {/* Hide confirm button if error exists */}
            {!error && (
              <Button
                size="sm"
                variant="destructive"
                disabled={loading}
                onClick={handleConfirm}
              >
                {loading ? "..." : confirmText}
              </Button>
            )}
          
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
