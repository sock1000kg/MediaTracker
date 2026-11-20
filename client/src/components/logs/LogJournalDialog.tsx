import { useCallback, useState } from "react"
import { X } from "lucide-react"
import type { EntriesChange, EntryInput, Log, LogStatus } from "@/types/mainTypes"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { TagInput } from "@/components/tags/TagInput"
import { Cover } from "@/components/media-view/Cover"
import { AddToCollectionDialog } from "@/components/collections/AddToCollectionDialog"
import { EntryCard, type EntryMediaInfo } from "@/components/logs/EntryCard"
import { aspectForMedia } from "@/lib/mediaView"
import { cleanEntry, hasEntryContent } from "@/lib/logStatus"
import { formatLogDate } from "@/lib/logView"
import { getTodayString } from "@/lib/logEntries"
import {
  applyStatusToCards, cardsFromEntries, entriesChange, firstEntryError, isLongNote, liveCards, newCard, type EntryCard as Card,
} from "@/lib/journalDraft"
import { useLimits } from "@/hooks/useLimits"
import { cn } from "@/lib/utils"

export interface JournalMedia extends EntryMediaInfo {
  id: string
  title: string
  imageUrl?: string | null
  creator?: string | null
  year?: string | number | null
}

/** What one Save commits: the changed log fields, and the entries (edit) or the one first entry (create). */
export interface JournalSave {
  /** Only the fields that changed (edit), or the fields that were filled in (create). */
  log: Partial<Log>
  /** Edit mode: entries to create, update and delete in the same request. */
  entries?: EntriesChange
  /** Create mode: the first entry, when the card has any content. */
  entry?: EntryInput | null
}

interface LogJournalDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  media: JournalMedia
  /** The saved log (edit mode); absent when creating one. */
  log?: Log | null
  /** Create mode: what the first entry starts with (e.g. the edition a book search matched). */
  initialEntry?: EntryInput
  onSave: (save: JournalSave) => Promise<unknown>
}

const fieldClass = "mt-1 block w-full min-w-0 rounded-md border border-input bg-card px-3 py-2 text-sm focus:ring-2 focus:outline-none"
const tagNames = (log?: Log | null) => (log?.tags ?? []).map((t) => t.name)
const sameTags = (a: string[], b: string[]) => {
  if (a.length !== b.length) return false
  const x = a.map((s) => s.toLowerCase()).sort()
  const y = b.map((s) => s.toLowerCase()).sort()
  return x.every((v, i) => v === y[i])
}

/**
 * The one dialog to create or edit a log: a book with two pages. The left page is the log (status, rating, main
 * review, tags, collections); the right page is a feed of its entries. Everything is staged; one Save commits it.
 */
export function LogJournalDialog(props: LogJournalDialogProps) {
  // A fresh state every time the dialog opens
  const [session, setSession] = useState(0)
  const [wasOpen, setWasOpen] = useState(props.open)
  if (props.open !== wasOpen) {
    setWasOpen(props.open)
    if (props.open) setSession((s) => s + 1)
  }
  return <JournalBook key={session} {...props} />
}

function JournalBook({ open, onOpenChange, media, log, initialEntry, onSave }: LogJournalDialogProps) {
  const limits = useLimits()
  const isEdit = Boolean(log)
  const today = getTodayString()

  const [status, setStatus] = useState<LogStatus | "">(() => log?.status ?? "")
  const [rating, setRating] = useState(() => (log?.rating != null ? String(log.rating) : ""))
  const [notes, setNotes] = useState(() => log?.notes ?? "")
  const [tags, setTags] = useState<string[]>(() => tagNames(log))
  const [cards, setCards] = useState<Card[]>(() => (log ? cardsFromEntries(log.entries) : [newCard({ ...initialEntry })]))
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [tab, setTab] = useState<"log" | "entries">("log")
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [collectionsOpen, setCollectionsOpen] = useState(false)

  const snapshot = useCallback(
    () => JSON.stringify({
      status, rating, notes, tags: [...tags].map((t) => t.toLowerCase()).sort(),
      cards: cards.map((c) => ({ k: c.key, d: cleanEntry(c.draft), x: c.deleted })),
    }),
    [status, rating, notes, tags, cards]
  )
  const [initialSnapshot] = useState(snapshot)
  const dirty = snapshot() !== initialSnapshot

  const live = liveCards(cards)
  const atCap = live.length >= limits.logs.maxEntriesPerLog
  const createAddBlocked = !isEdit && cards.length >= 1
  const validationError = firstEntryError(cards)
  const ratingError = rating !== "" && (Number(rating) < 0 || Number(rating) > 100 || Number.isNaN(Number(rating)))
    ? "Rating must be between 0 and 100" : null
  const blocker = validationError ?? ratingError
  const longCards = live.filter((c) => isLongNote(c.draft.note))
  const allExpanded = longCards.length > 0 && longCards.every((c) => expanded[c.key])

  const requestClose = () => {
    if (saving) return
    if (dirty) setConfirmDiscard(true)
    else onOpenChange(false)
  }

  const patchCard = (key: string, patch: (c: Card) => Card) =>
    setCards((prev) => prev.map((c) => (c.key === key ? patch(c) : c)))

  const changeStatus = (next: LogStatus) => {
    setStatus(next)
    setCards((prev) => applyStatusToCards(prev, next, today, { cap: limits.logs.maxEntriesPerLog, single: !isEdit }))
  }

  const addEntry = () => {
    setCards((prev) => [newCard({ startedAt: today }), ...prev])
    setStatus("in progress")
    setTab("entries")
  }

  const save = async () => {
    if (blocker || saving) return
    setSaving(true)
    setSaveError(null)
    try {
      if (log) {
        const changed: Partial<Log> = {}
        if (status && status !== log.status) changed.status = status
        if (rating !== (log.rating != null ? String(log.rating) : "")) {
          changed.rating = rating === "" ? null : Number(rating)
        }
        if (notes !== (log.notes ?? "")) changed.notes = notes
        if (!sameTags(tags, tagNames(log))) changed.tags = tags.map((name, i) => ({ id: `new-${i}`, name }))
        const entries = entriesChange(cards)
        if (Object.keys(changed).length > 0 || entries) {
          await onSave({ log: changed, ...(entries ? { entries } : {}) })
        }
      } else {
        const first = cards[0]?.draft
        await onSave({
          log: {
            ...(status ? { status } : {}),
            ...(rating !== "" ? { rating: Number(rating) } : {}),
            ...(notes !== "" ? { notes } : {}),
            ...(tags.length > 0 ? { tags: tags.map((name, i) => ({ id: `new-${i}`, name })) } : {}),
          },
          entry: hasEntryContent(first) ? cleanEntry(first) : null,
        })
      }
      onOpenChange(false)
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  const aspect = aspectForMedia({
    mediaType: typeof media.mediaType === "string" ? { name: media.mediaType } : media.mediaType,
    subtype: media.subtype,
  })
  const byline = [media.creator, media.year].filter(Boolean).join(" · ")
  const footerError = saveError ?? blocker
  const noteCount = notes.length

  const logPage = (
    <section
      id="journal-panel-log"
      role="tabpanel"
      aria-labelledby="journal-tab-log"
      className={cn("min-h-0 min-w-0 overflow-y-auto bg-card p-4 sm:p-6", tab !== "log" && "max-md:hidden")}
    >
      <h3 className="font-display text-base font-semibold">The log</h3>
      <div className="mt-3 space-y-4">
        <div>
          <label htmlFor="journal-status" className="block text-sm">Status</label>
          <Select value={status} onValueChange={(v: LogStatus) => changeStatus(v)}>
            <SelectTrigger id="journal-status" className="mt-1 flex w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:ring-2 focus:outline-none">
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="in progress">In Progress</SelectItem>
              <SelectItem value="wishlist">Wishlist</SelectItem>
              <SelectItem value="dropped">Dropped</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <label htmlFor="journal-rating" className="block text-sm">Rating</label>
          <input
            id="journal-rating"
            type="number"
            value={rating}
            onChange={(e) => setRating(e.target.value)}
            min={0}
            max={100}
            className={fieldClass}
            placeholder="0–100"
          />
        </div>

        <div>
          <label htmlFor="journal-review" className="block text-sm">Main review</label>
          <textarea
            id="journal-review"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={limits.notes.maxLength}
            rows={5}
            className={cn(fieldClass, "min-h-32 max-h-[50dvh] resize-none overflow-y-auto [field-sizing:content] [overflow-wrap:anywhere]")}
            placeholder="Write your thoughts..."
          />
          <div className="mt-1 text-right text-xs text-muted-foreground">{noteCount}/{limits.notes.maxLength}</div>
        </div>

        <div>
          <label htmlFor="journal-tags-input" className="mb-1 block text-sm">Tags</label>
          <TagInput id="journal-tags-input" value={tags} onChange={setTags} />
        </div>

        {log && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm">
              Collections <span className="text-muted-foreground">({log.collectionIds?.length ?? 0})</span>
            </p>
            <Button type="button" size="sm" variant="outline" onClick={() => setCollectionsOpen(true)}>
              Add to collection…
            </Button>
          </div>
        )}

        {log && formatLogDate(log.logged_at) && (
          <p className="text-xs text-muted-foreground">Logged {formatLogDate(log.logged_at)}</p>
        )}
      </div>
    </section>
  )

  const entriesPage = (
    <section
      id="journal-panel-entries"
      role="tabpanel"
      aria-labelledby="journal-tab-entries"
      className={cn("min-h-0 min-w-0 overflow-y-auto bg-background", tab !== "entries" && "max-md:hidden")}
    >
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:px-6">
        <h3 className="font-display text-base font-semibold">Entries ({live.length})</h3>
        <div className="flex flex-wrap items-center gap-2">
          {longCards.length > 0 && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setExpanded(allExpanded ? {} : Object.fromEntries(longCards.map((c) => [c.key, true])))}
            >
              {allExpanded ? "Collapse all" : "Expand all"}
            </Button>
          )}
          <Button type="button" size="sm" variant="outline" disabled={atCap || createAddBlocked} onClick={addEntry}>
            Add entry
          </Button>
        </div>
      </div>

      <div className="space-y-3 p-4 sm:p-6">
        {atCap && (
          <p className="text-xs text-muted-foreground">
            A log can hold up to {limits.logs.maxEntriesPerLog} entries. Delete one to add another.
          </p>
        )}
        {createAddBlocked && !atCap && (
          <p className="text-xs text-muted-foreground">Save the log to add more entries</p>
        )}

        {cards.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-sm text-muted-foreground">No entries yet.</p>
            <Button type="button" size="sm" variant="outline" className="mt-3" disabled={atCap} onClick={addEntry}>
              Add entry
            </Button>
          </div>
        ) : (
          <ul className="space-y-3">
            {cards.map((c) => (
              <EntryCard
                key={c.key}
                card={c}
                media={media}
                expanded={Boolean(expanded[c.key])}
                onToggleExpanded={() => setExpanded((prev) => ({ ...prev, [c.key]: !prev[c.key] }))}
                onChange={(draft) => patchCard(c.key, (x) => ({ ...x, draft }))}
                onEdit={() => patchCard(c.key, (x) => ({ ...x, editing: true }))}
                onDone={() => patchCard(c.key, (x) => ({ ...x, editing: false }))}
                onDiscard={() => patchCard(c.key, (x) => ({ ...x, editing: false, draft: cardsFromEntries([x.saved!])[0].draft }))}
                onDelete={() =>
                  c.isNew
                    ? setCards((prev) => prev.filter((x) => x.key !== c.key))
                    : patchCard(c.key, (x) => ({ ...x, deleted: true, editing: false }))
                }
                onUndo={() => patchCard(c.key, (x) => ({ ...x, deleted: false }))}
                canDelete={isEdit}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  )

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => { if (next) onOpenChange(true); else requestClose() }}>
        <DialogContent
          showCloseButton={false}
          className={cn(
            "journal-dialog grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0",
            "w-[min(1100px,calc(100vw-2rem))] max-w-none sm:max-w-none h-[min(85dvh,780px)]",
            "max-md:h-dvh max-md:w-screen max-md:rounded-none max-md:border-0"
          )}
        >
          <header className="flex items-start gap-3 border-b border-border bg-card px-4 py-3 sm:px-6">
            <Cover id={media.id} title={media.title} imageUrl={media.imageUrl} aspect={aspect} size="row" />
            <div className="min-w-0 flex-1">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{isEdit ? "Edit log" : "New log"}</p>
              <DialogTitle className="font-display text-xl font-semibold leading-snug [overflow-wrap:anywhere]">{media.title}</DialogTitle>
              {byline && <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{byline}</p>}
              <DialogDescription className="sr-only">
                {isEdit ? "Edit this log and its entries, then save once." : "Create a log with its first entry."}
              </DialogDescription>
            </div>
            <Button type="button" size="icon" variant="ghost" aria-label="Close" onClick={requestClose}>
              <X className="size-4" />
            </Button>
          </header>

          <div role="tablist" aria-label="Log pages" className="flex border-b border-border bg-card md:hidden">
            {(["log", "entries"] as const).map((t) => (
              <button
                key={t}
                id={`journal-tab-${t}`}
                type="button"
                role="tab"
                aria-selected={tab === t}
                aria-controls={`journal-panel-${t}`}
                onClick={() => setTab(t)}
                className={cn("flex-1 border-b-2 px-3 py-2 text-sm", tab === t ? "border-primary font-medium" : "border-transparent text-muted-foreground")}
              >
                {t === "log" ? "Log" : `Entries (${live.length})`}
              </button>
            ))}
          </div>

          <div className="journal-pages grid min-h-0 grid-cols-1 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            {logPage}
            {entriesPage}
          </div>

          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-border bg-card px-4 py-3 sm:px-6">
            <p role="alert" className="mr-auto min-w-0 text-sm text-destructive [overflow-wrap:anywhere]">{footerError}</p>
            <Button type="button" variant="outline" onClick={requestClose} disabled={saving}>Cancel</Button>
            <Button type="button" variant="amber" onClick={save} disabled={saving || Boolean(blocker)}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </footer>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard your changes?</AlertDialogTitle>
            <AlertDialogDescription>Your unsaved changes to this log and its entries will be lost.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmDiscard(false); onOpenChange(false) }}>Discard</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {log && <AddToCollectionDialog log={log} open={collectionsOpen} onOpenChange={setCollectionsOpen} />}
    </>
  )
}
