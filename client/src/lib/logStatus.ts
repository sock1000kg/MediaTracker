import type { EntryInput } from "@/types/mainTypes"

/** True when the draft entry says anything worth saving. */
export function hasEntryContent(entry: EntryInput | undefined | null): entry is EntryInput {
  if (!entry) return false
  const ed = entry.edition
  return Boolean(
    entry.name?.trim() || entry.startedAt || entry.finishedAt || entry.note?.trim() ||
    entry.progressEpisodes != null || entry.progressChapters != null || entry.progressVolumes != null ||
    (ed && (ed.format?.trim() || ed.language?.trim()))
  )
}

/** Trims an entry draft for sending: day-precision dates, blank name, note and edition keys dropped. */
export function cleanEntry(entry: EntryInput): EntryInput {
  const ed = entry.edition
  const edition = ed
    ? Object.fromEntries(
        (["format", "language"] as const)
          .map((k) => [k, ed[k]?.trim()] as const)
          .filter(([, v]) => v)
      )
    : undefined
  return {
    name: entry.name?.trim() ? entry.name.trim() : null,
    startedAt: entry.startedAt ? entry.startedAt.slice(0, 10) : null,
    finishedAt: entry.finishedAt ? entry.finishedAt.slice(0, 10) : null,
    progressEpisodes: entry.progressEpisodes ?? null,
    progressChapters: entry.progressChapters ?? null,
    progressVolumes: entry.progressVolumes ?? null,
    note: entry.note?.trim() ? entry.note.trim() : null,
    edition: edition && Object.keys(edition).length > 0 ? edition : null,
  }
}
