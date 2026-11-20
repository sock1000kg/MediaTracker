import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Pencil, Trash2 } from "lucide-react"
import type { EntryInput, Log, LogEntry } from "@/types/mainTypes"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { addLogEntry, editLogEntry, deleteLogEntry } from "@/api/logs"
import { fetchLogsQueryOptions } from "@/queryOptions/fetchLogsQueryOptions"
import { fetchMediasQueryOptions } from "@/queryOptions/fetchMediasQueryOptions"
import { entryDatesText } from "@/lib/logView"
import { sortEntriesNewestFirst, getTodayString, entryDateError } from "@/lib/logEntries"
import { cleanEntry } from "@/lib/logStatus"
import { useLimits } from "@/hooks/useLimits"
import { EntryFields, type EntryMediaInfo } from "./EntryFields"

interface EntriesSectionProps {
  logId: string
  entries: LogEntry[]
  media: EntryMediaInfo
  /** Called with the log the server answered with, so the form follows (status, entries). */
  onLogChange: (log: Log) => void
  /** Open the editor on a new entry straight away. */
  startAdding?: boolean
}

type Editing = { entryId: string | null; draft: EntryInput } | null

function progressText(entry: LogEntry): string | null {
  const parts = [
    entry.progressEpisodes != null ? `${entry.progressEpisodes} eps` : null,
    entry.progressChapters != null ? `${entry.progressChapters} ch` : null,
    entry.progressVolumes != null ? `${entry.progressVolumes} vol` : null,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(" · ") : null
}

const toDraft = (entry: LogEntry): EntryInput => ({
  startedAt: entry.startedAt ? entry.startedAt.slice(0, 10) : null,
  finishedAt: entry.finishedAt ? entry.finishedAt.slice(0, 10) : null,
  progressEpisodes: entry.progressEpisodes,
  progressChapters: entry.progressChapters,
  progressVolumes: entry.progressVolumes,
  note: entry.note,
  edition: entry.edition ?? {},
})

export function EntriesSection({ logId, entries, media, onLogChange, startAdding = false }: EntriesSectionProps) {
  const limits = useLimits()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<Editing>(() => (startAdding ? { entryId: null, draft: { startedAt: getTodayString() } } : null))
  const [confirmDelete, setConfirmDelete] = useState<LogEntry | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sorted = sortEntriesNewestFirst(entries)
  const atCap = entries.length >= limits.logs.maxEntriesPerLog

  const refreshLists = () => {
    queryClient.invalidateQueries({ queryKey: fetchLogsQueryOptions().queryKey })
    queryClient.invalidateQueries({ queryKey: fetchMediasQueryOptions().queryKey })
  }

  const run = async (action: () => Promise<Log>) => {
    setBusy(true)
    setError(null)
    try {
      const updated = await action()
      onLogChange(updated)
      refreshLists()
      return true
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save the entry")
      return false
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    if (!editing) return
    const dateError = entryDateError(editing.draft)
    if (dateError) {
      setError(dateError)
      return
    }
    const body = cleanEntry(editing.draft)
    const ok = await run(() => editing.entryId ? editLogEntry(logId, editing.entryId, body) : addLogEntry(logId, body))
    if (ok) setEditing(null)
  }

  const remove = async () => {
    const target = confirmDelete
    if (!target) return
    await run(() => deleteLogEntry(logId, target.id))
    setConfirmDelete(null)
  }

  return (
    <section aria-labelledby={`entries-${logId}`} className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 id={`entries-${logId}`} className="text-sm font-semibold">
          Entries <span className="font-normal text-muted-foreground">({entries.length})</span>
        </h3>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={atCap || busy || editing !== null}
          onClick={() => { setError(null); setEditing({ entryId: null, draft: { startedAt: getTodayString() } }) }}
        >
          Add entry
        </Button>
      </div>
      {atCap && (
        <p className="text-xs text-muted-foreground">
          A log can hold up to {limits.logs.maxEntriesPerLog} entries. Delete one to add another.
        </p>
      )}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}

      {editing && (
        <div className="space-y-3 rounded-md border border-border bg-card/50 p-3">
          <p className="text-sm font-medium">{editing.entryId ? "Edit entry" : "New entry"}</p>
          <EntryFields
            value={editing.draft}
            onChange={(draft) => setEditing({ ...editing, draft })}
            media={media}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => { setEditing(null); setError(null) }}>Cancel</Button>
            <Button type="button" size="sm" variant="amber" disabled={busy} onClick={save}>
              {busy ? "Saving..." : "Save entry"}
            </Button>
          </div>
        </div>
      )}

      {sorted.length === 0 && !editing && (
        <p className="text-xs text-muted-foreground">No entries yet. Add one to keep dates for this {"read, watch, listen or play"}.</p>
      )}

      {sorted.length > 0 && (
        <ul className="divide-y divide-border/60 rounded-md border border-border">
          {sorted.map((e) => {
            const progress = progressText(e)
            const firstLine = e.note?.split("\n")[0]?.trim()
            const chips = [e.edition?.title, e.edition?.format, e.edition?.language].filter((c): c is string => Boolean(c))
            return (
              <li key={e.id} className="flex items-start justify-between gap-2 px-3 py-2">
                <div className="min-w-0 space-y-1">
                  <p className="text-sm tabular-nums">{entryDatesText(e)}</p>
                  {(chips.length > 0 || progress) && (
                    <div className="flex flex-wrap items-center gap-1">
                      {chips.map((c, i) => <span key={`${c}-${i}`} className="tag">{c}</span>)}
                      {progress && <span className="text-xs text-muted-foreground">{progress}</span>}
                    </div>
                  )}
                  {firstLine && <p className="truncate text-xs italic text-muted-foreground">{firstLine}</p>}
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    aria-label={`Edit entry ${entryDatesText(e)}`}
                    disabled={busy}
                    onClick={() => { setError(null); setEditing({ entryId: e.id, draft: toDraft(e) }) }}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-8 text-destructive"
                    aria-label={`Delete entry ${entryDatesText(e)}`}
                    disabled={busy}
                    onClick={() => setConfirmDelete(e)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <AlertDialog open={confirmDelete !== null} onOpenChange={(o) => { if (!o) setConfirmDelete(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this entry?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete ? `${entryDatesText(confirmDelete)} will be removed from this log. The log itself stays.` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>Delete entry</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
