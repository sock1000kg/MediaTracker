import { useId } from "react"
import type { EntryInput, Media } from "@/types/mainTypes"
import { COMMON_LANGUAGES, formatSuggestions, getTodayString } from "@/lib/logEntries"
import { useLimits } from "@/hooks/useLimits"

export type EntryMediaInfo = {
  mediaType?: { name?: string | null } | string | null
  subtype?: string | null
  details?: Media["details"] | Record<string, unknown> | null
}

interface EntryFieldsProps {
  value: EntryInput
  onChange: (next: EntryInput) => void
  media: EntryMediaInfo
  /** Create form: the edition sits in a disclosure that starts closed. */
  editionCollapsed?: boolean
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

const inputClass = "mt-1 block w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:ring-2 focus:outline-none"

/** The fields of one entry: dates, progress, a short note and the edition. Every input has a visible label. */
export function EntryFields({ value, onChange, media, editionCollapsed = false }: EntryFieldsProps) {
  const id = useId()
  const limits = useLimits()
  const today = getTodayString()
  const started = value.startedAt ? value.startedAt.slice(0, 10) : ""
  const finished = value.finishedAt ? value.finishedAt.slice(0, 10) : ""
  const set = (patch: Partial<EntryInput>) => onChange({ ...value, ...patch })
  const setEdition = (patch: Partial<NonNullable<EntryInput["edition"]>>) => set({ edition: { ...(value.edition ?? {}), ...patch } })

  let startedError: string | null = null
  let finishedError: string | null = null
  if (started && started > today) startedError = "Start date cannot be in the future"
  if (finished && finished > today) finishedError = "Finished date cannot be in the future"
  else if (started && finished && finished < started) finishedError = "Finished date can't be before the start date"

  const suggestions = formatSuggestions(media)
  const progress = progressFields(media)
  const maxNote = limits.logs.entryNoteMaxLength

  const edition = (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="sm:col-span-3">
        <label htmlFor={`${id}-ed-title`} className="block text-sm">Edition title</label>
        <input
          id={`${id}-ed-title`}
          type="text"
          value={value.edition?.title ?? ""}
          onChange={(e) => setEdition({ title: e.target.value })}
          maxLength={300}
          className={inputClass}
          placeholder="The title you read or watched, if it differs"
        />
      </div>
      <div>
        <label htmlFor={`${id}-ed-format`} className="block text-sm">Format</label>
        <input
          id={`${id}-ed-format`}
          type="text"
          list={suggestions.length > 0 ? `${id}-formats` : undefined}
          value={value.edition?.format ?? ""}
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
      <div>
        <label htmlFor={`${id}-ed-lang`} className="block text-sm">Language</label>
        <input
          id={`${id}-ed-lang`}
          type="text"
          list={`${id}-languages`}
          value={value.edition?.language ?? ""}
          onChange={(e) => setEdition({ language: e.target.value })}
          maxLength={35}
          className={inputClass}
        />
        <datalist id={`${id}-languages`}>
          {COMMON_LANGUAGES.map((l) => <option key={l} value={l} />)}
        </datalist>
      </div>
    </div>
  )

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
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
          {startedError && <p id={`${id}-started-error`} role="alert" className="mt-1 text-xs text-destructive">{startedError}</p>}
        </div>
        <div>
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
          {finishedError && <p id={`${id}-finished-error`} role="alert" className="mt-1 text-xs text-destructive">{finishedError}</p>}
        </div>
      </div>

      {progress.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {progress.map((p) => (
            <div key={p.key}>
              <label htmlFor={`${id}-${p.key}`} className="block text-sm">{p.label}</label>
              <input
                id={`${id}-${p.key}`}
                type="number"
                min={0}
                value={value[p.key] ?? ""}
                onChange={(e) => set({ [p.key]: e.target.value === "" ? null : Math.max(0, Math.floor(Number(e.target.value))) })}
                className={inputClass}
              />
            </div>
          ))}
        </div>
      )}

      <div>
        <label htmlFor={`${id}-note`} className="block text-sm">Entry note</label>
        <input
          id={`${id}-note`}
          type="text"
          value={value.note ?? ""}
          onChange={(e) => set({ note: e.target.value })}
          maxLength={maxNote}
          className={inputClass}
          placeholder="Short, for this time only (the review stays on the log)"
        />
      </div>

      {editionCollapsed ? (
        <details className="rounded-md border border-border px-3 py-2">
          <summary className="cursor-pointer text-sm">Edition</summary>
          <div className="pt-2">{edition}</div>
        </details>
      ) : (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Edition</legend>
          {edition}
        </fieldset>
      )}
    </div>
  )
}

