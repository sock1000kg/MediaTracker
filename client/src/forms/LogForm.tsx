import type { Log, Media, LogStatus } from "@/types/media"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { useEffect } from "react"

interface LogFormProps {
  formData: Partial<Log>
  setFormData: React.Dispatch<React.SetStateAction<Partial<Log>>>
  targetMedia?: Media  // for create mode
  targetLog?: Log  // for edit mode
}

export function LogForm({
  formData,
  setFormData,
  targetMedia,
  targetLog
}: LogFormProps) {
  // Prefill once on mount or when target changes
  useEffect(() => {
    if (targetLog && !formData.id) {
        // edit mode: fill all fields
        setFormData(targetLog)
    } else if (targetMedia && !formData.id && !formData.media) {
        // create mode: just media
        setFormData((prev) => ({ ...prev, media: targetMedia })) 
    }
  }, [targetLog, targetMedia, formData.id, formData.media, setFormData])

  return (
    <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 p-2">
        {targetMedia && (
            <p className="text-sm text-gray-600 italic">
                Logging for <span className="font-semibold">{targetMedia.title}</span>
            </p>
        )}
      {/* Status */}
      <label className="block">
        <span className="text-sm">Status</span>
        <Select
          value={formData.status ?? undefined}
          onValueChange={(val: LogStatus) =>
            setFormData((prev) => ({ ...prev, status: val }))
          }
        >
          <SelectTrigger className="mt-1 flex w-full rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm focus:ring-2 focus:outline-none ">
            <SelectValue placeholder="Select status" />
          </SelectTrigger>

          <SelectContent>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="in progress">In Progress</SelectItem>
            <SelectItem value="wishlist">Wishlist</SelectItem>
            <SelectItem value="dropped">Dropped</SelectItem>
          </SelectContent>
        </Select>
      </label>

      {/* Rating */}
      <label className="block">
        <span className="text-sm">Rating</span>
        <input
          type="number"
          value={formData.rating ?? ""}
          onChange={(e) =>
            setFormData((prev) => ({
              ...prev,
              rating: e.target.value ? Number(e.target.value) : undefined,
            }))
          }
          min={0}
          max={100}
          className="mt-1 block w-full rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm focus:ring-2 focus:outline-none "
          placeholder="0–100"
        />
      </label>

      {/* Notes */}
      <label className="block">
        <span className="text-sm">Notes</span>
        <textarea
          value={formData.notes ?? ""}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, notes: e.target.value }))
          }
          className="mt-1 block w-full rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm focus:ring-2 focus:outline-none "
          placeholder="Write your thoughts..."
          rows={3}
        />
      </label>
    </div>
  )
}
