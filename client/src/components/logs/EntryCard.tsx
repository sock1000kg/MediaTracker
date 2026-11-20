import { useId } from "react"
import { Pencil, Trash2 } from "lucide-react"
import type { EntryInput } from "@/types/mainTypes"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { COMMON_LANGUAGES, entryDateError, formatSuggestions, getTodayString } from "@/lib/logEntries"
import { entryDatesText } from "@/lib/logView"
import { isChanged, isLongNote, type EntryCard as Card } from "@/lib/journalDraft"
import { useLimits } from "@/hooks/useLimits"

export type EntryMediaInfo = {
  mediaType?: { name?: string | null } | string | null
  subtype?: string | null
  details?: Record<string, unknown> | null
}

/** What progress an entry of this item tracks. */
function progressFields(media: EntryMediaInfo): { key: "progressEpisodes" | "progressChapters" | "progressVolumes"; label: string }[] { // entry
  const type = (typeof media.mediaType === "string" ? media.mediaType : media.mediaType?.name)?.toLowerCase()
  if (type === "anime" || media.subtype === "season") return [{ key: "progressEpisodes", label: "Episodes watched" }] // entry
  if (type === "manga") return [
    { key: "progressChapters", label: "Chapters read" }, // entry
    { key: "progressVolumes", label: "Volumes read" }, // entry
  ]
  return []
}

function progressText(d: EntryInput): string | null {
  const parts = [
    d.progressEpisodes != null ? `${d.progressEpisodes} eps` : null,
    d.progressChapters != null ? `${d.progressChapters} ch` : null,
    d.progressVolumes != null ? `${d.progressVolumes} vol` : null,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(" · ") : null
}

const inputClass = "mt-1 block w-full min-w-0 rounded-md border border-input bg-card px-3 py-2 text-sm focus:ring-2 focus:outline-none"

interface EntryCardProps {
  card: Card
  media: EntryMediaInfo
  expanded: boolean
  onToggleExpanded: () => void
  onChange: (draft: EntryInput) => void
  onEdit: () => void
  onDone: () => void
  onDiscard: () => void
  onDelete: () => void
  onUndo: () => void
  /** The create form has one card that can't be deleted. */
  canDelete?: boolean
}

export function EntryCard({
  card, media, expanded, onToggleExpanded, onChange, onEdit, onDone, onDiscard, onDelete, onUndo, canDelete = true,
}: EntryCardProps) {
  const id = useId()
  const limits = useLimits()
  const { draft } = card
  const changed = isChanged(card)
  const dateError = entryDateError(draft)
  const heading = draft.name?.trim() || null
  const dates = entryDatesText(draft)
  const progress = progressText(draft)
  const chips = [draft.edition?.format, draft.edition?.language].filter((c): c is string => Boolean(c))
  const long = isLongNote(draft.note)

  if (card.deleted) {
    return (
      <li className="min-w-0 rounded-md border border-dashed border-border bg-muted/40 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="min-w-0 text-sm text-muted-foreground [overflow-wrap:anywhere]">
            <span className="line-through">{heading ?? dates}</span> · Will be deleted on save
          </p>
          <Button type="button" size="sm" variant="outline" onClick={onUndo}>Undo</Button>
        </div>
      </li>
    )
  }

  if (card.editing) {
    const started = draft.startedAt ? draft.startedAt.slice(0, 10) : ""
    const finished = draft.finishedAt ? draft.finishedAt.slice(0, 10) : ""
    const today = getTodayString()
    const set = (patch: Partial<EntryInput>) => onChange({ ...draft, ...patch })
    const setEdition = (patch: NonNullable<EntryInput["edition"]>) => set({ edition: { ...(draft.edition ?? {}), ...patch } })
    const suggestions = formatSuggestions(media)
    const progressInputs = progressFields(media)
    const startedError = started && started > today ? "Start date cannot be in the future" : null
    const finishedError = finished && finished > today
      ? "Finished date cannot be in the future"
      : started && finished && finished < started ? "Finished date can't be before the start date" : null

    return (
      <li className="min-w-0 space-y-3 rounded-md border border-border bg-card p-3" aria-label={`Editing entry ${heading ?? dates}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">{card.isNew ? "New entry" : "Edit entry"}</p>
          {changed && <span className="rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground">Unsaved</span>}
        </div>

        <div>
          <label htmlFor={`${id}-name`} className="block text-sm">Name</label>
          <input
            id={`${id}-name`}
            type="text"
            value={draft.name ?? ""}
            onChange={(e) => set({ name: e.target.value })}
            maxLength={limits.logs.entryNameMaxLength}
            className={inputClass}
            placeholder="The title you read or watched, or any label"
          />
        </div>

        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <div className="min-w-0">
            <label htmlFor={`${id}-started`} className="block text-sm">Started</label>
            <input
              id={`${id}-started`}
              type="date"
              value={started}
              max={today}
              onChange={(e) => set({ startedAt: e.target.value || null })}
              aria-describedby={startedError ? `${id}-started-error` : undefined}
              className={inputClass}
            />
            {startedError && <p id={`${id}-started-error`} className="mt-1 text-xs text-destructive">{startedError}</p>}
          </div>
          <div className="min-w-0">
            <div className="flex items-center justify-between">
              <label htmlFor={`${id}-finished`} className="text-sm">Finished</label>
              <button
                type="button"
                onClick={() => set({ finishedAt: today })}
                className="rounded border border-border bg-secondary px-2 py-0.5 text-xs text-secondary-foreground hover:bg-secondary/80"
              >
                Today
              </button>
            </div>
            <input
              id={`${id}-finished`}
              type="date"
              value={finished}
              max={today}
              onChange={(e) => set({ finishedAt: e.target.value || null })}
              aria-describedby={finishedError ? `${id}-finished-error` : undefined}
              className={inputClass}
            />
            {finishedError && <p id={`${id}-finished-error`} className="mt-1 text-xs text-destructive">{finishedError}</p>}
          </div>
        </div>

        {progressInputs.length > 0 && (
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            {progressInputs.map((p) => (
              <div key={p.key} className="min-w-0">
                <label htmlFor={`${id}-${p.key}`} className="block text-sm">{p.label}</label>
                <input
                  id={`${id}-${p.key}`}
                  type="number"
                  min={0}
                  value={draft[p.key] ?? ""}
                  onChange={(e) => set({ [p.key]: e.target.value === "" ? null : Math.max(0, Math.floor(Number(e.target.value))) })}
                  className={inputClass}
                />
              </div>
            ))}
          </div>
        )}

        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <div className="min-w-0">
            <label htmlFor={`${id}-format`} className="block text-sm">Format</label>
            <input
              id={`${id}-format`}
              type="text"
              list={suggestions.length > 0 ? `${id}-formats` : undefined}
              value={draft.edition?.format ?? ""}
              onChange={(e) => setEdition({ format: e.target.value })}
              maxLength={60}
              className={inputClass}
            />
            {suggestions.length > 0 && (
              <datalist id={`${id}-formats`}>
                {suggestions.map((f) => <option key={f} value={f} />)}
              </datalist>
            )}
          </div>
          <div className="min-w-0">
            <label htmlFor={`${id}-lang`} className="block text-sm">Language</label>
            <input
              id={`${id}-lang`}
              type="text"
              list={`${id}-languages`}
              value={draft.edition?.language ?? ""}
              onChange={(e) => setEdition({ language: e.target.value })}
              maxLength={35}
              className={inputClass}
            />
            <datalist id={`${id}-languages`}>
              {COMMON_LANGUAGES.map((l) => <option key={l} value={l} />)}
            </datalist>
          </div>
        </div>

        <div>
          <label htmlFor={`${id}-note`} className="block text-sm">Note</label>
          <textarea
            id={`${id}-note`}
            value={draft.note ?? ""}
            onChange={(e) => set({ note: e.target.value })}
            maxLength={limits.logs.entryNoteMaxLength}
            rows={4}
            className={cn(inputClass, "max-h-72 min-h-24 resize-none overflow-y-auto [field-sizing:content] [overflow-wrap:anywhere]")}
            placeholder="Thoughts on this time only (the main review stays on the left page)"
          />
          <div className="mt-1 text-right text-xs text-muted-foreground">
            {(draft.note?.length ?? 0)}/{limits.logs.entryNoteMaxLength}
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          {!card.isNew && changed && (
            <Button type="button" size="sm" variant="outline" onClick={onDiscard}>Discard changes</Button>
          )}
          <Button type="button" size="sm" variant="outline" onClick={onDone} disabled={Boolean(dateError)}>Done</Button>
        </div>
      </li>
    )
  }

  return (
    <li className="min-w-0 rounded-md border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          {heading ? (
            <p className="font-semibold [overflow-wrap:anywhere]">{heading}</p>
          ) : null}
          <p className={cn("tabular-nums [overflow-wrap:anywhere]", heading ? "text-sm text-muted-foreground" : "font-semibold")}>{dates}</p>
          {(chips.length > 0 || progress) && (
            <div className="flex flex-wrap items-center gap-1">
              {chips.map((c, i) => <span key={`${c}-${i}`} className="tag">{c}</span>)}
              {progress && <span className="text-xs text-muted-foreground">{progress}</span>}
            </div>
          )}
          {changed && <span className="inline-block rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground">Unsaved</span>}
        </div>
        <div className="flex shrink-0 gap-1">
          <Button type="button" size="icon" variant="ghost" className="size-8" aria-label={`Edit entry ${heading ?? dates}`} onClick={onEdit}>
            <Pencil className="size-4" />
          </Button>
          {canDelete && (
            <Button type="button" size="icon" variant="ghost" className="size-8 text-destructive" aria-label={`Delete entry ${heading ?? dates}`} onClick={onDelete}>
              <Trash2 className="size-4" />
            </Button>
          )}
        </div>
      </div>

      {draft.note?.trim() && (
        <div className="mt-2 min-w-0">
          <div className="relative">
            <p
              id={`${id}-note-text`}
              className={cn("max-w-prose whitespace-pre-wrap text-sm [overflow-wrap:anywhere]", long && !expanded && "line-clamp-6")}
            >
              {draft.note}
            </p>
            {long && !expanded && (
              <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-card to-transparent" />
            )}
          </div>
          {long && (
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={`${id}-note-text`}
              onClick={onToggleExpanded}
              className="mt-1 text-xs text-link underline-offset-4 hover:underline"
            >
              {expanded ? "Show less" : "Show more"}
            </button>
          )}
        </div>
      )}
    </li>
  )
}
