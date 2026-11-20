import { useEffect, useRef, useState, useCallback } from "react"
import type { Log, LogStatus } from "@/types/mainTypes"
import { useLimits } from "@/hooks/useLimits"
import { applyStatus } from "@/lib/logStatus"
import { displayTitleOf } from "@/lib/logEntries"
import { aspectForMedia } from "@/lib/mediaView"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { TagInput } from "@/components/tags/TagInput"
import { Cover } from "@/components/media-view/Cover"
import { EntryFields, type EntryMediaInfo } from "@/components/logs/EntryFields"
import { getTodayString } from "@/lib/logEntries"
import { EntriesSection } from "@/components/logs/EntriesSection"
import { AddToCollectionDialog } from "@/components/collections/AddToCollectionDialog"

export interface LogFormMedia extends EntryMediaInfo {
  id: string
  title: string
  imageUrl?: string | null
}

interface LogFormBodyProps {
  formData: Partial<Log>
  setFormData: React.Dispatch<React.SetStateAction<Partial<Log>>>
  media: LogFormMedia
  idPrefix: string
  /** Edit mode only: open the entry editor on a new entry straight away. */
  startAdding?: boolean
}

function areTagListsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const sortedA = [...a].map((s) => s.toLowerCase()).sort()
  const sortedB = [...b].map((s) => s.toLowerCase()).sort()
  return sortedA.every((val, idx) => val === sortedB[idx])
}

const fieldClass = "mt-1 block w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:ring-2 focus:outline-none"

/**
 * The log and its entries, for every type.
 * - Editing a saved log (it has an id): the log's own fields, then its entries, each saved on its own.
 * - Creating one: the log's fields plus one entry's fields in one form, with the edition in a closed disclosure.
 */
export function LogFormBody({ formData, setFormData, media, idPrefix, startAdding = false }: LogFormBodyProps) {
  const limits = useLimits()
  const isEdit = Boolean(formData.id)
  const [collectionsOpen, setCollectionsOpen] = useState(false)

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
    setFormData((prev) => (prev.tags !== undefined ? { ...prev, tags: undefined } : prev))
  }, [setFormData])

  const handleTagsChange = useCallback((newTags: string[]) => {
    setCurrentTags(newTags)
    const initial = initialTagsRef.current ?? []
    if (formData.id) {
      if (areTagListsEqual(newTags, initial)) {
        setFormData((prev) => ({ ...prev, tags: undefined }))
      } else {
        setFormData((prev) => ({ ...prev, tags: newTags.map((name, i) => ({ id: `new-${i}`, name })) }))
      }
    } else {
      setFormData((prev) => ({
        ...prev,
        tags: newTags.length > 0 ? newTags.map((name, i) => ({ id: `new-${i}`, name })) : undefined,
      }))
    }
  }, [formData.id, setFormData])

  const shownTitle = displayTitleOf({ title: formData.title, entries: formData.entries }, media.title)
  const subtitle = shownTitle !== media.title ? media.title : null
  const aspect = aspectForMedia({
    mediaType: typeof media.mediaType === "string" ? { name: media.mediaType } : media.mediaType,
    subtype: media.subtype,
  })

  // An entry action answers with the whole log: follow its status and entries, keep what the user is typing
  const onLogChange = useCallback((log: Log) => {
    setFormData((prev) => ({ ...prev, status: log.status, entries: log.entries, entryCount: log.entryCount }))
  }, [setFormData])

  return (
    <div className="space-y-4 max-h-[520px] overflow-y-auto p-2 pr-2">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Cover id={media.id} title={media.title} imageUrl={media.imageUrl} aspect={aspect} size="row" />
        <div className="min-w-0">
          <p className="font-display text-lg font-semibold break-words">{shownTitle}</p>
          {subtitle && <p className="text-xs text-muted-foreground break-words">{subtitle}</p>}
          <span className="sr-only">Logging for item</span>
        </div>
      </div>

      {/* Log */}
      <section aria-label="Log" className="space-y-4">
        <div>
          <label htmlFor={`${idPrefix}-name`} className="block text-sm">Name</label>
          <input
            id={`${idPrefix}-name`}
            type="text"
            value={formData.title ?? ""}
            onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
            maxLength={300}
            className={fieldClass}
            placeholder={media.title}
          />
        </div>

        <label className="block">
          <span className="text-sm">Status</span>
          <Select
            value={formData.status ?? ""}
            onValueChange={(val: LogStatus) =>
              setFormData((prev) => (isEdit ? { ...prev, status: val } : applyStatus(prev, val, getTodayString())))
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

        <label className="block">
          <span className="text-sm">Rating</span>
          <input
            type="number"
            value={formData.rating ?? ""}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, rating: e.target.value ? Number(e.target.value) : undefined }))
            }
            min={0}
            max={100}
            className={fieldClass}
            placeholder="0–100"
          />
        </label>

        <div>
          <label htmlFor={`${idPrefix}-tags-input`} className="block text-sm mb-1">Tags</label>
          <TagInput id={`${idPrefix}-tags-input`} value={currentTags} onChange={handleTagsChange} />
        </div>

        <label className="block">
          <span className="text-sm">Notes</span>
          <textarea
            value={formData.notes ?? ""}
            onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
            maxLength={limits.notes.maxLength}
            className="mt-1 block w-full h-40 rounded-md border border-input bg-card px-3 py-2 text-sm focus:ring-2 focus:outline-none resize-none"
            placeholder="Write your thoughts..."
          />
          <div className="text-right text-xs text-muted-foreground mt-1">
            {(formData.notes?.length ?? 0)}/{limits.notes.maxLength}
          </div>
        </label>

        {isEdit && (
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm">
              Collections <span className="text-muted-foreground">({formData.collectionIds?.length ?? 0})</span>
            </p>
            <Button type="button" size="sm" variant="outline" onClick={() => setCollectionsOpen(true)}>
              Add to collection…
            </Button>
          </div>
        )}
      </section>

      {/* Entries */}
      {isEdit ? (
        <EntriesSection
          logId={formData.id!}
          entries={formData.entries ?? []}
          media={media}
          onLogChange={onLogChange}
          startAdding={startAdding}
        />
      ) : (
        <section aria-label="First entry" className="space-y-2">
          <h3 className="text-sm font-semibold">First entry</h3>
          <EntryFields
            value={formData.entry ?? {}}
            onChange={(entry) => setFormData((prev) => ({ ...prev, entry }))}
            media={media}
            editionCollapsed
          />
        </section>
      )}

      {isEdit && formData.media && (
        <AddToCollectionDialog log={formData as Log} open={collectionsOpen} onOpenChange={setCollectionsOpen} />
      )}
    </div>
  )
}
