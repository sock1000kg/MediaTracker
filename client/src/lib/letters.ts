import type { Letter, LetterSummary } from "@/types/letters"
import { formatLogDate } from "@/lib/logView"

/** `opensAt` is a calendar day (stored at noon UTC), so it is read in UTC: no time zone moves it. */
export function formatOpeningDay(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
}

export function whenLine(letter: Letter): string {
  if (letter.state === "ready") return "Ready"
  if (letter.state === "opened") return letter.openedAt ? `Opened ${formatLogDate(letter.openedAt)}` : "Opened"
  if (letter.opensAt) return `Opens on ${formatOpeningDay(letter.opensAt)}`
  return "Opens when you log it again"
}

const DAY_MS = 24 * 60 * 60 * 1000

/** "tomorrow", "in 12 days", "in 3 months", "in 2 years". */
export function fromNow(iso: string, now = new Date()): string {
  const format = new Intl.RelativeTimeFormat("en", { numeric: "auto" })
  const days = Math.max(0, Math.ceil((new Date(iso).getTime() - now.getTime()) / DAY_MS))
  if (days < 45) return format.format(days, "day")
  const months = Math.round(days / 30.44)
  if (months < 18) return format.format(months, "month")
  return format.format(Math.round(days / 365.25), "year")
}

export function summaryLine({ sealed, ready, nextOpensAt }: LetterSummary, now = new Date()): string {
  const parts = [`${sealed} sealed`, `${ready} ready`]
  if (nextOpensAt) parts.push(`next one opens ${fromNow(nextOpensAt, now)}`)
  return parts.join(" · ")
}

/** "for the next time you read Dune" */
export function logVerb(mediaType: string | null | undefined): string {
  switch (mediaType?.trim().toLowerCase()) {
    case "book":
    case "manga":
      return "read"
    case "movie":
    case "tv":
    case "anime":
      return "watch"
    case "game":
    case "video game":
    case "board game":
    case "boardgame":
      return "play"
    case "music":
      return "listen to"
    default:
      return "log"
  }
}

/** A local calendar date `days` / `years` from `from`, as "YYYY-MM-DD". */
export function localDay(from = new Date(), add: { days?: number; years?: number } = {}): string {
  const d = new Date(from.getFullYear() + (add.years ?? 0), from.getMonth(), from.getDate() + (add.days ?? 0))
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
