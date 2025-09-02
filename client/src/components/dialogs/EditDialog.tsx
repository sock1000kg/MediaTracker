import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useState, useEffect } from "react"
import type { EditableEntity } from "@/types/media"

interface EditFormDialogProps<T extends EditableEntity> {
    open: boolean
    onOpenChange: (open: boolean) => void
    title?: string
    confirmText?: string
    cancelText?: string
    target: T | null
    onEdit: (target: T, updatedData: Partial<T>) => Promise<T>
    onEdited?: (updatedTarget: T) => void
    renderForm: (
        formData: Partial<T>,
        setFormData: React.Dispatch<React.SetStateAction<Partial<T>>>
    ) => React.ReactNode
}

export default function EditDialog<T extends EditableEntity = EditableEntity>({
    open,
    onOpenChange,
    title = "Edit",
    confirmText = "Save",
    target,
    onEdit,
    onEdited,
    renderForm,
}: EditFormDialogProps<T>) {
    const [formData, setFormData] = useState<Partial<T>>({})
    const [loading, setLoading] = useState(false)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)

    useEffect(() => {
        if (open && target) {
        setFormData(target)
        setErrorMessage(null)
        }
    }, [open, target])

    const handleConfirm = async () => {
        if (!target) return
        setLoading(true)
        setErrorMessage(null)
        try {
            const result = await onEdit(target, formData)
            onEdited?.(result)
            onOpenChange(false)
        } catch (err: any) {
            setErrorMessage(err.message)
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
                {/* Form passed from outside */}
                <div className="py-2">{renderForm(formData, setFormData)}</div>

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button type="submit" variant="amber" disabled={loading} onClick={handleConfirm}>
                        {loading ? "Saving..." : confirmText}
                    </Button>
                </DialogFooter>
            </form>
        </DialogContent>
        </Dialog>
    )
}
