import { capitalise } from "./mediaView"
import type { ChartKey, MonthBucket, Unit } from "./stats"
import type { TypeStatsResult } from "./typeStats"

export const colorVar = (k: ChartKey) => (k === "other" ? "var(--muted-foreground)" : `var(--${k})`)
export const fmtAvg = (a: number | null) => (a === null ? "–" : String(Math.round(a)))

export function typeLabel(t: string) {
  return t === "other" ? "Other" : capitalise(t)
}

/** Human label for a bucket: day buckets (key YYYY-MM-DD) read "5 Nov 2026", the rest use their own label. */
export function bucketLabel(m: MonthBucket, unit: Unit = "month"): string {
  if (unit !== "day") return m.label
  const [y, mo, d] = m.key.split("-").map(Number)
  return new Date(y, mo - 1, d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

/** Text for one bucket: used for the tooltip and the bar's aria-label. */
export function monthText(m: MonthBucket, unit: Unit = "month"): string {
  const parts = Object.entries(m.byType).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${n} ${typeLabel(t)}`)
  return `${bucketLabel(m, unit)}: ${m.total} ${m.total === 1 ? "log" : "logs"}${parts.length ? ` (${parts.join(", ")})` : ""}`
}

/** Short figure summary for the rating distribution, e.g. "Average rating 84 · most ratings fall in 80–89 · 3 unrated." */
export function ratingSummary(avgRating: number | null, modalLabel: string | null, unrated: number): string {
  const parts: string[] = []
  if (avgRating !== null) parts.push(`Average rating ${Math.round(avgRating)}`)
  parts.push(modalLabel ? `most ratings fall in ${modalLabel}` : "no ratings yet")
  parts.push(`${unrated} unrated`)
  const text = parts.join(" · ")
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`
}

/** "Most active month: Nov 2026 with 3 logs." follows the chart's unit. */
export function peakSummary(peak: MonthBucket | null, unit: Unit): string {
  if (!peak) return "No logs in this range."
  return `Most active ${unit}: ${bucketLabel(peak, unit)} with ${peak.total} ${peak.total === 1 ? "log" : "logs"}.`
}

export const UNIT_HEAD: Record<Unit, string> = { month: "Month", year: "Year", day: "Day" }

/**
 * Shared formatter for durations: shows "N h" from 1 hour up (>= 60 min), and "N min" below that (< 60 min).
 * Formats large hour counts with toLocaleString ("1,234 h").
 * Returns null for missing, NaN, or non-positive values.
 */
export function formatMinutes(minutes: number | null | undefined): string | null {
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) return null
  const m = Math.round(minutes)
  if (m < 60) return `${m} min`
  const h = Math.round(m / 60)
  return `${h.toLocaleString()} h`
}

export const formatDuration = formatMinutes

/** Formats an hour value (e.g. game playtime) into "N h" or "N min" (if < 1 h). */
export function formatHours(hours: number | null | undefined): string | null {
  if (hours == null || !Number.isFinite(hours) || hours <= 0) return null
  return formatMinutes(hours * 60)
}

/** Formats timeToFinish into "9 days (median 6)" or "same day" or null if count === 0. */
export function formatTimeToFinish(ttf: { count: number; avgDays: number | null; medianDays: number | null }): string | null {
  if (ttf.count === 0 || ttf.avgDays == null || ttf.medianDays == null) return null
  const avg = Math.round(ttf.avgDays)
  const med = Math.round(ttf.medianDays)
  if (avg === 0 && med === 0) return "same day"
  const avgStr = avg === 0 ? "same day" : `${avg} ${avg === 1 ? "day" : "days"}`
  const medStr = med === 0 ? "same day" : `${med}`
  return `${avgStr} (median ${medStr})`
}

export function headlineMetric(stats: TypeStatsResult): string {
  switch (stats.statType) {
    case "book":
      return stats.pagesRead !== null
        ? `${stats.pagesRead.toLocaleString()} pages`
        : `${stats.completed} completed`
    case "movie":
      return stats.minutesWatched !== null
        ? `${formatDuration(stats.minutesWatched)} watched`
        : `${stats.completed} completed`
    case "anime":
      return stats.episodesWatched !== null
        ? `${stats.episodesWatched.toLocaleString()} episodes`
        : stats.minutesWatched !== null
        ? `${formatDuration(stats.minutesWatched)} watched`
        : `${stats.completed} completed`
    case "manga":
      return stats.chaptersRead !== null
        ? `${stats.chaptersRead.toLocaleString()} chapters`
        : stats.volumesRead !== null
        ? `${stats.volumesRead.toLocaleString()} volumes`
        : `${stats.completed} completed`
    case "game":
      return stats.estimatedHours !== null
        ? `~${formatHours(stats.estimatedHours)} (RAWG)`
        : `${stats.completed} completed`
    case "music": {
      const parts: string[] = []
      if (stats.albums > 0) parts.push(`${stats.albums.toLocaleString()} ${stats.albums === 1 ? "album" : "albums"}`)
      if (stats.tracks > 0) parts.push(`${stats.tracks.toLocaleString()} ${stats.tracks === 1 ? "track" : "tracks"}`)
      return parts.length > 0 ? parts.join(" · ") : `${stats.completed} completed`
    }
    case "tv": {
      const parts: string[] = []
      if (stats.shows > 0) parts.push(`${stats.shows.toLocaleString()} ${stats.shows === 1 ? "show" : "shows"}`)
      if (stats.seasons > 0) parts.push(`${stats.seasons.toLocaleString()} ${stats.seasons === 1 ? "season" : "seasons"}`)
      return parts.length > 0 ? parts.join(" · ") : `${stats.completed} completed`
    }
    case "generic":
      return `${stats.completed} completed`
  }
}

