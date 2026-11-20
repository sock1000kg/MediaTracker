// The staged state of the log journal dialog: the log's fields and a card per entry. Nothing here talks to the
// server; the dialog turns the state into one save at the end.

import type { EntriesChange, EntryInput, LogEntry, LogStatus } from "@/types/mainTypes"
import { sortEntriesNewestFirst, entryDateError } from "@/lib/logEntries"
import { cleanEntry, hasEntryContent } from "@/lib/logStatus"
import { entryDatesText } from "@/lib/logView"
import type { MediaResult } from "@/types/search"
import type { JournalMedia } from "@/components/logs/LogJournalDialog"

export interface EntryCard {
  /** The entry's id, or "new-N" for a staged one. */
  key: string
  isNew: boolean
  /** The entry as saved; absent for a new card. */
  saved?: LogEntry
  draft: EntryInput
  deleted: boolean
  editing: boolean
}

export function entryToDraft(entry: LogEntry): EntryInput {
  return {
    name: entry.name,
    startedAt: entry.startedAt ? entry.startedAt.slice(0, 10) : null,
    finishedAt: entry.finishedAt ? entry.finishedAt.slice(0, 10) : null,
    progressEpisodes: entry.progressEpisodes,
    progressChapters: entry.progressChapters,
    progressVolumes: entry.progressVolumes,
    note: entry.note,
    edition: entry.edition ?? {},
  }
}

export function cardsFromEntries(entries: readonly LogEntry[]): EntryCard[] {
  return sortEntriesNewestFirst(entries).map((e) => ({
    key: e.id, isNew: false, saved: e, draft: entryToDraft(e), deleted: false, editing: false,
  }))
}

let counter = 0
export function newCard(draft: EntryInput = {}, editing = true): EntryCard {
  counter += 1
  return { key: `new-${counter}`, isNew: true, draft, deleted: false, editing }
}

const sameEntry = (a: EntryInput, b: EntryInput) => JSON.stringify(cleanEntry(a)) === JSON.stringify(cleanEntry(b))

/** A new card, or a saved one whose staged values differ from what is saved. */
export function isChanged(card: EntryCard): boolean {
  if (card.isNew) return true
  return !sameEntry(card.draft, entryToDraft(card.saved!))
}

/** An entry that was started and not finished yet. */
const isOpen = (d: EntryInput) => Boolean(d.startedAt) && !d.finishedAt

/** Cards that will exist after the save, newest first (new ones, newest first, then the saved ones as listed). */
export function liveCards(cards: EntryCard[]): EntryCard[] {
  return cards.filter((c) => !c.deleted)
}

/**
 * The status rules of task 52, applied to the staged cards as the user acts, so what they see is what is saved:
 * - "in progress" with no open entry: a new card started today (in the create form the single card is started instead);
 * - "completed": the newest open entry is finished today, when that is not before its start.
 * Wishlist and dropped never change a card.
 */
export function applyStatusToCards(
  cards: EntryCard[], status: LogStatus, today: string, opts: { cap: number; single: boolean }
): EntryCard[] {
  const live = liveCards(cards)
  if (status === "in progress") {
    if (live.some((c) => isOpen(c.draft))) return cards
    if (opts.single) {
      const only = live[0]
      if (!only) return cards
      const finished = only.draft.finishedAt?.slice(0, 10) ?? ""
      if (only.draft.startedAt || (finished && finished < today)) return cards
      return cards.map((c) => (c === only ? { ...c, draft: { ...c.draft, startedAt: today } } : c))
    }
    if (live.length >= opts.cap) return cards
    return [newCard({ startedAt: today }, false), ...cards]
  }
  if (status === "completed") {
    const open = live.filter((c) => isOpen(c.draft))
    // newest open: new cards first, then the saved order
    const target = open[0]
    if (!target) return cards
    const started = target.draft.startedAt!.slice(0, 10)
    if (today < started) return cards
    return cards.map((c) => (c === target ? { ...c, draft: { ...c.draft, finishedAt: today } } : c))
  }
  return cards
}

/** The label of a card in messages: its name, else its dates, else "New entry". */
export function cardLabel(card: EntryCard): string {
  const name = card.draft.name?.trim()
  if (name) return name
  if (card.draft.startedAt || card.draft.finishedAt) return entryDatesText(card.draft)
  return "New entry"
}

/** The first date problem among the cards that will be saved, naming the entry it is on. */
export function firstEntryError(cards: EntryCard[]): string | null {
  for (const c of liveCards(cards)) {
    const err = entryDateError(c.draft)
    if (err) return `${cardLabel(c)}: ${err}`
  }
  return null
}

/** What the edit save sends for the entries, or undefined when none changed. */
export function entriesChange(cards: EntryCard[]): EntriesChange | undefined {
  const create = cards
    .filter((c) => c.isNew && !c.deleted && hasEntryContent(c.draft))
    .map((c) => cleanEntry(c.draft))
  const update = cards
    .filter((c) => !c.isNew && !c.deleted && isChanged(c))
    .map((c) => ({ id: c.key, ...cleanEntry(c.draft) }))
  const del = cards.filter((c) => !c.isNew && c.deleted).map((c) => c.key)
  if (create.length === 0 && update.length === 0 && del.length === 0) return undefined
  return {
    ...(create.length > 0 ? { create } : {}),
    ...(update.length > 0 ? { update } : {}),
    ...(del.length > 0 ? { delete: del } : {}),
  }
}

/** A note longer than about six lines starts collapsed. */
export function isLongNote(note: string | null | undefined): boolean {
  if (!note) return false
  return note.split("\n").length > 6 || note.length > 420
}

/** The item a search result stands for, as the dialog shows it. */
export function journalMediaOfResult(result: MediaResult, id?: string): JournalMedia {
  return {
    id: id ?? result.sourceId,
    title: result.title,
    imageUrl: result.imageUrl,
    mediaType: result.mediaType,
    subtype: result.subtype,
    details: result.details,
    creator: result.creator,
    year: result.year,
  }
}

/** A book search names the edition it matched: its title names the first entry, its language fills the edition. */
export function initialEntryOfResult(result: MediaResult): EntryInput | undefined {
  const ed = result.edition
  if (!ed) return undefined
  const name = ed.title?.trim()
  const language = ed.language?.trim()
  if (!name && !language) return undefined
  return { ...(name ? { name } : {}), ...(language ? { edition: { language } } : {}) }
}
