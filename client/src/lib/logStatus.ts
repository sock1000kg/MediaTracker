import type { LogStatus, EntryInput } from "@/types/mainTypes"

type Draft = { status?: LogStatus | string | null; entry?: EntryInput }

/**
 * Applies a status change to the create form (a log and its first entry).
 * The server does the same on a saved log: "in progress" starts an entry today when none is open, and
 * "completed" finishes the open one today. In the create form that means the draft entry:
 * - "in progress" with no start date starts it today, unless a finish date before today would make that invalid;
 * - "completed" on a started entry with no finish date finishes it today.
 */
export function applyStatus<T extends Draft>(prev: T, status: LogStatus, today: string): T & { entry?: EntryInput } {
  const entry = prev.entry ?? {}
  const started = entry.startedAt ? entry.startedAt.slice(0, 10) : ""
  const finished = entry.finishedAt ? entry.finishedAt.slice(0, 10) : ""
  const next: T & { entry?: EntryInput } = { ...prev, status }
  if (status === "in progress" && !started && (!finished || finished >= today)) {
    next.entry = { ...entry, startedAt: today }
  } else if (status === "completed" && started && !finished && started <= today) {
    next.entry = { ...entry, finishedAt: today }
  }
  return next
}

/** True when the draft entry says anything worth saving. */
export function hasEntryContent(entry: EntryInput | undefined | null): entry is EntryInput {
  if (!entry) return false
  const ed = entry.edition
  return Boolean(
    entry.startedAt || entry.finishedAt || entry.note?.trim() ||
    entry.progressEpisodes != null || entry.progressChapters != null || entry.progressVolumes != null ||
    (ed && (ed.title?.trim() || ed.format?.trim() || ed.language?.trim()))
  )
}

/** Trims an entry draft for sending: day-precision dates, blank edition keys dropped. */
export function cleanEntry(entry: EntryInput): EntryInput {
  const ed = entry.edition
  const edition = ed
    ? Object.fromEntries(
        (["title", "format", "language"] as const)
          .map((k) => [k, ed[k]?.trim()] as const)
          .filter(([, v]) => v)
      )
    : undefined
  return {
    startedAt: entry.startedAt ? entry.startedAt.slice(0, 10) : null,
    finishedAt: entry.finishedAt ? entry.finishedAt.slice(0, 10) : null,
    progressEpisodes: entry.progressEpisodes ?? null,
    progressChapters: entry.progressChapters ?? null,
    progressVolumes: entry.progressVolumes ?? null,
    note: entry.note?.trim() ? entry.note.trim() : null,
    edition: edition && Object.keys(edition).length > 0 ? edition : null,
  }
}
