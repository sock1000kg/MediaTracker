import { Fragment, useCallback, useState, useSyncExternalStore } from "react"
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

const tagNames = (log?: Log | null) => (log?.tags ?? []).map((t) => t.name)
const sameTags = (a: string[], b: string[]) => {
  if (a.length !== b.length) return false
  const x = a.map((s) => s.toLowerCase()).sort()
  const y = b.map((s) => s.toLowerCase()).sort()
  return x.every((v, i) => v === y[i])
}

function useIsPhone(): boolean {
  return useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {}
      const mql = window.matchMedia("(max-width: 767px)")
      mql.addEventListener("change", onStoreChange)
      return () => mql.removeEventListener("change", onStoreChange)
    },
    () => typeof window !== "undefined" && Boolean(window.matchMedia?.("(max-width: 767px)")?.matches),
    () => false
  )
}

/**
 * The one dialog to create or edit a log: mockup D.
 * The left page uses bg-card (the log: title, cover, rating, status, tags, review, collections);
 * the right page uses bg-background with soft inset shadow (the entries feed).
 * Everything is staged; one atomic Save commits it.
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
  const isPhone = useIsPhone()
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
  const footerError = saveError ?? validationError
  const noteCount = notes.length

  const coverDims = aspect === "square"
    ? "w-[112px] h-[112px] sm:w-[160px] sm:h-[160px]"
    : aspect === "wide"
    ? "w-[112px] h-[70px] sm:w-[160px] sm:h-[100px]"
    : "w-[112px] h-[160px] sm:w-[160px] sm:h-[228px]"

  const logPage = (
    <section
      id="journal-panel-log"
      role="tabpanel"
      aria-labelledby="journal-tab-log"
      className={cn(
        "col-start-1 row-start-2 md:col-start-1 md:row-start-1 min-h-0 min-w-0 overflow-y-auto bg-card p-6 sm:p-8 space-y-6",
        tab !== "log" && "max-md:hidden"
      )}
    >
      {/* Cover block: cover at 160x228 (112x160 phones), title, byline, rating, date */}
      <div className="flex items-start gap-4 sm:gap-6">
        <div className={cn("shrink-0 overflow-hidden rounded-md", coverDims, "[&>img]:size-full [&>div]:size-full")}>
          <Cover id={media.id} title={media.title} imageUrl={media.imageUrl} aspect={aspect} size="tile" />
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <DialogTitle className="font-display text-[26px] font-semibold leading-tight [overflow-wrap:anywhere]">
            {media.title}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {isEdit ? "Edit log" : "New log"}
          </DialogDescription>
          {byline && <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{byline}</p>}

          {/* Rating (B2): big number itself, dashed underline turning solid primary on hover/focus */}
          <div className="pt-2">
            <label htmlFor="journal-rating" className="sr-only">Rating out of 100</label>
            <div className="flex items-baseline gap-1.5">
              <input
                id="journal-rating"
                type="text"
                inputMode="numeric"
                value={rating}
                onChange={(e) => setRating(e.target.value)}
                placeholder="–"
                className="journal-rating-input font-display text-[44px] leading-none text-primary text-right w-[3.5ch] bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-xs placeholder:text-muted-foreground/60 transition-colors"
              />
              <span className="font-display text-base text-muted-foreground">/ 100</span>
            </div>
            {ratingError && (
              <p role="alert" className="mt-1 text-xs text-destructive">{ratingError}</p>
            )}
          </div>

          {log?.logged_at && formatLogDate(log.logged_at) && (
            <p className="text-xs text-muted-foreground pt-1">Logged {formatLogDate(log.logged_at)}</p>
          )}
        </div>
      </div>

      {/* Status (B3) */}
      <div>
        <label htmlFor="journal-status" className="block text-xs uppercase tracking-wider text-muted-foreground">Status</label>
        <Select value={status} onValueChange={(v: LogStatus) => changeStatus(v)}>
          <SelectTrigger
            id="journal-status"
            className="journal-field mt-1 flex w-full border-none rounded-none shadow-none bg-transparent px-0 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus:outline-none"
          >
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

      {/* Tags under status as its own full-width row (B3) */}
      <div>
        <label htmlFor="journal-tags-input" className="block text-xs uppercase tracking-wider text-muted-foreground">Tags</label>
        <div className="mt-1">
          <TagInput id="journal-tags-input" variant="underlined" value={tags} onChange={setTags} />
        </div>
      </div>

      {/* Review (B4): borderless font-display textarea */}
      <div className="flex-1 flex flex-col">
        <label htmlFor="journal-review" className="block text-xs uppercase tracking-wider text-muted-foreground">Review</label>
        <textarea
          id="journal-review"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={limits.notes.maxLength}
          rows={5}
          className="mt-1 block w-full min-w-0 border-0 border-none bg-transparent font-display text-base leading-[1.7] min-h-32 flex-1 resize-none overflow-y-auto [field-sizing:content] [overflow-wrap:anywhere] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-xs placeholder:text-muted-foreground/60"
          placeholder="Write your thoughts..."
        />
        <div className="mt-1 text-right text-xs text-muted-foreground">{noteCount}/{limits.notes.maxLength}</div>
      </div>

      {/* Collections (B5): link-style text button in text-primary */}
      {log && (
        <div>
          <button
            type="button"
            onClick={() => setCollectionsOpen(true)}
            className="text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xs"
          >
            Collections ({log.collectionIds?.length ?? 0}) · Add to collection…
          </button>
        </div>
      )}
    </section>
  )

  const entriesPage = (
    <section
      id="journal-panel-entries"
      role="tabpanel"
      aria-labelledby="journal-tab-entries"
      className={cn(
        "col-start-1 row-start-2 md:col-start-2 md:row-start-1 min-h-0 min-w-0 overflow-y-auto bg-background journal-right-page relative flex flex-col",
        tab !== "entries" && "max-md:hidden"
      )}
    >
      {/* Sticky header inside right page (C1): no border */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 bg-background/95 px-6 py-4 backdrop-blur">
        <h3 className="font-display text-[22px] font-semibold">Entries ({live.length})</h3>
        <div className="flex items-center gap-3">
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
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-full border-primary text-primary hover:bg-primary/10"
            disabled={atCap || createAddBlocked}
            onClick={addEntry}
            aria-label="Add entry"
          >
            <span aria-hidden="true">+ </span>Add entry
          </Button>
          {/* Desktop Close button moved inside entries page header */}
          {!isPhone && (
            <Button type="button" size="icon" variant="ghost" aria-label="Close" onClick={requestClose} className="rounded-full">
              <X className="size-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 px-6 py-4 pb-24 space-y-2">
        {atCap && (
          <p className="text-xs text-muted-foreground">
            A log can hold up to {limits.logs.maxEntriesPerLog} entries. Delete one to add another.
          </p>
        )}
        {createAddBlocked && !atCap && (
          <p className="text-xs text-muted-foreground">Save the log to add more entries</p>
        )}

        {cards.length === 0 ? (
          <div className="py-12 text-center">
            <p className="font-display italic text-base text-muted-foreground">No entries yet.</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-4 rounded-full border-primary text-primary hover:bg-primary/10"
              disabled={atCap}
              onClick={addEntry}
              aria-label="Add entry"
            >
              <span aria-hidden="true">+ </span>Add entry
            </Button>
          </div>
        ) : (
          <ul className="space-y-0">
            {cards.map((c, i) => (
              <Fragment key={c.key}>
                {i > 0 && (
                  <div aria-hidden="true" className="my-[22px] text-center text-sm tracking-widest text-muted-foreground select-none">
                    · · ·
                  </div>
                )}
                <EntryCard
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
              </Fragment>
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
            "journal-dialog grid overflow-hidden p-0",
            "w-[min(1100px,calc(100vw-2rem))] max-w-none sm:max-w-none h-[min(85dvh,780px)]",
            "max-md:h-dvh max-md:w-screen max-md:rounded-none max-md:border-0",
            "grid-cols-1 grid-rows-[auto_minmax(0,1fr)_auto]",
            "md:grid-cols-[420px_minmax(0,1fr)] md:grid-rows-[minmax(0,1fr)]"
          )}
        >
          {/* Phones only (< md): close button at top right above/beside pill tabs */}
          {isPhone && (
            <div className="col-start-1 row-start-1 flex items-center justify-between px-4 pt-3 pb-2 md:hidden">
              <div role="tablist" aria-label="Log pages" className="inline-flex rounded-full bg-secondary/80 p-1">
                {(["log", "entries"] as const).map((t) => (
                  <button
                    key={t}
                    id={`journal-tab-${t}`}
                    type="button"
                    role="tab"
                    aria-selected={tab === t}
                    aria-controls={`journal-panel-${t}`}
                    onClick={() => setTab(t)}
                    className={cn(
                      "rounded-full px-4 py-1 text-xs font-medium transition-colors",
                      tab === t ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {t === "log" ? "Log" : `Entries (${live.length})`}
                  </button>
                ))}
              </div>
              <Button type="button" size="icon" variant="ghost" aria-label="Close" onClick={requestClose} className="rounded-full">
                <X className="size-4" />
              </Button>
            </div>
          )}

          {logPage}
          {entriesPage}

          {/* Footer: on md sitting at the bottom of the right page with fade; on mobile fixed at bottom */}
          <footer
            className={cn(
              "col-start-1 row-start-3 md:col-start-2 md:row-start-1 md:self-end",
              "flex flex-wrap items-center justify-end gap-2 px-6 py-4 z-20",
              "max-md:bg-background max-md:journal-mobile-footer",
              "md:bg-gradient-to-t md:from-background md:via-background/95 md:to-transparent md:pt-8 md:pointer-events-none md:[&>*]:pointer-events-auto"
            )}
          >
            <p role="alert" className="mr-auto min-w-0 text-sm text-destructive [overflow-wrap:anywhere]">{footerError}</p>
            <Button type="button" variant="ghost" onClick={requestClose} disabled={saving}>Cancel</Button>
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
