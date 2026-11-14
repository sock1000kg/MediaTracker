import type { Log, Media, LogStatus } from "@/types/mainTypes"
import { MAX_NOTES_LENGTH } from "@/lib/logView"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { useEffect, useRef, useState, useCallback } from "react"
import { TagInput } from "@/components/tags/TagInput"

interface LogFormProps {
  formData: Partial<Log>
  setFormData: React.Dispatch<React.SetStateAction<Partial<Log>>>
  targetMedia: Media // for create mode, in edit mode the target's info is passed from EntityDialog
}

function areTagListsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const sortedA = [...a].map((s) => s.toLowerCase()).sort()
  const sortedB = [...b].map((s) => s.toLowerCase()).sort()
  return sortedA.every((val, idx) => val === sortedB[idx])
}

function getTodayString(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export function LogForm({
  formData,
  setFormData,
  targetMedia,
}: LogFormProps) {
  useEffect(() => { //edit mode's prefilling is handled in EntityDialog
    if (targetMedia && !formData.id && !formData.media) {
      // create mode: set the media to logForm
      setFormData((prev) => ({ ...prev, media: targetMedia })) 
    }
  }, [targetMedia, formData.id, formData.media, setFormData])

  // Track initial tags to send tags only when modified
  const initialTagsRef = useRef<string[] | null>(null)
  if (initialTagsRef.current === null) {
    const raw = formData.tags ?? []
    initialTagsRef.current = raw.map((t) => t.name)
  }

  const [currentTags, setCurrentTags] = useState<string[]>(() => initialTagsRef.current ?? [])

  useEffect(() => {
    // If formData was initialized from an existing log, it holds TagItem objects;
    // clear it so untouched tags are omitted from the update payload.
    setFormData((prev) => {
      if (prev.tags !== undefined) {
        return { ...prev, tags: undefined }
      }
      return prev
    })
  }, [setFormData])

  const handleTagsChange = useCallback((newTags: string[]) => {
    setCurrentTags(newTags)
    const initial = initialTagsRef.current ?? []
    if (formData.id) {
      if (areTagListsEqual(newTags, initial)) {
        setFormData((prev) => ({ ...prev, tags: undefined }))
      } else {
        setFormData((prev) => ({
          ...prev,
          tags: newTags.map((name, i) => ({ id: -1 - i, name })),
        }))
      }
    } else {
      setFormData((prev) => ({
        ...prev,
        tags: newTags.length > 0 ? newTags.map((name, i) => ({ id: -1 - i, name })) : undefined,
      }))
    }
  }, [formData.id, setFormData])

  const started = formData.started_at ? formData.started_at.slice(0, 10) : ""
  const finished = formData.finished_at ? formData.finished_at.slice(0, 10) : ""
  const today = getTodayString()

  let startedError: string | null = null
  let finishedError: string | null = null

  if (started && started > today) {
    startedError = "Start date cannot be in the future"
  }
  if (finished && finished > today) {
    finishedError = "Finished date cannot be in the future"
  } else if (started && finished && finished < started) {
    finishedError = "Finished date can't be before the start date"
  }

  return (
    <div className="space-y-4 max-h-[520px] overflow-y-auto pr-2 p-2">
      {targetMedia && (
        <p className="text-sm text-muted-foreground italic">
          Logging for <span className="font-semibold">{targetMedia.title}</span>
        </p>
      )}

      {/* Status */}
      <label className="block">
        <span className="text-sm">Status</span>
        <Select
          value={formData.status ?? ""}
          onValueChange={(val: LogStatus) =>
            setFormData((prev) => ({ ...prev, status: val }))
          }
        >
          <SelectTrigger className="mt-1 flex w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:ring-2 focus:outline-none">
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
          className="mt-1 block w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:ring-2 focus:outline-none"
          placeholder="0–100"
        />
      </label>

      {/* Started Date */}
      <div>
        <label htmlFor="log-started-date" className="block text-sm">
          Started
        </label>
        <input
          id="log-started-date"
          type="date"
          value={started}
          onChange={(e) =>
            setFormData((prev) => ({
              ...prev,
              started_at: e.target.value || null,
            }))
          }
          max={today}
          aria-describedby={startedError ? "started-date-error" : undefined}
          className="mt-1 block w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:ring-2 focus:outline-none"
        />
        {startedError && (
          <p id="started-date-error" role="alert" className="text-xs text-destructive mt-1">
            {startedError}
          </p>
        )}
      </div>

      {/* Finished Date */}
      <div>
        <div className="flex items-center justify-between">
          <label htmlFor="log-finished-date" className="text-sm">
            Finished
          </label>
          <button
            type="button"
            onClick={() =>
              setFormData((prev) => ({ ...prev, finished_at: today }))
            }
            className="text-xs px-2 py-0.5 rounded border border-border bg-secondary hover:bg-secondary/80 text-secondary-foreground"
          >
            Today
          </button>
        </div>
        <input
          id="log-finished-date"
          type="date"
          value={finished}
          onChange={(e) =>
            setFormData((prev) => ({
              ...prev,
              finished_at: e.target.value || null,
            }))
          }
          max={today}
          aria-describedby={finishedError ? "finished-date-error" : undefined}
          className="mt-1 block w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:ring-2 focus:outline-none"
        />
        {finishedError && (
          <p id="finished-date-error" role="alert" className="text-xs text-destructive mt-1">
            {finishedError}
          </p>
        )}
      </div>

      {/* Tags */}
      <div>
        <label htmlFor="log-tags-input" className="block text-sm mb-1">
          Tags
        </label>
        <TagInput
          id="log-tags-input"
          value={currentTags}
          onChange={handleTagsChange}
        />
      </div>

      {/* Notes */}
      <label className="block">
        <span className="text-sm">Notes</span>
        <textarea
          value={formData.notes ?? ""}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, notes: e.target.value }))
          }
          maxLength={MAX_NOTES_LENGTH}
          className="
            mt-1 block w-full h-40 rounded-md 
            border border-input bg-card 
            px-3 py-2 text-sm 
            focus:ring-2 focus:outline-none resize-none
          "
          placeholder="Write your thoughts..."
        />
        <div className="text-right text-xs text-muted-foreground mt-1">
          {(formData.notes?.length ?? 0)}/{MAX_NOTES_LENGTH}
        </div>
      </label>
    </div>
  )
}
