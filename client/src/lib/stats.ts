// Pure helpers behind the Stats page. Everything is computed client-side from GET /logs.
// Dates are read in local time. Logs with an unparseable date only count in the "all" range
// (and are skipped by the per-month chart).

import { getCategories } from "./utils"

export interface StatLog {
  id: number
  status: string | null
  rating: number | null
  logged_at: string
  started_at?: string | null
  finished_at?: string | null
  progress?: Record<string, unknown> | null
  media: {
    id: number
    title: string
    creator?: string | null
    creators?: { name: string; role: string }[] | null
    genres?: string[] | null
    imageUrl?: string | null
    metadata?: Record<string, unknown> | null
    mediaType?: { name: string } | null
  }
  tags?: { id: number; name: string }[]
}

export type StatsRange =
  | { kind: "all" }
  | { kind: "year"; year: number }
  | { kind: "month"; year: number; month: number } // month is 1-12
  | { kind: "last12" }

export const STATUS_KEYS = ["completed", "in progress", "wishlist", "dropped"] as const
export type StatusKey = (typeof STATUS_KEYS)[number] | "none"

const UNKNOWN_TYPE = "Unknown"

const typeName = (log: StatLog): string => log.media.mediaType?.name?.trim() || UNKNOWN_TYPE

export function dateOf(log: StatLog): Date | null {
  const raw = log.finished_at != null && log.finished_at.trim() !== "" ? log.finished_at : log.logged_at
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

/** A rating counts when it is a finite number (0 is a real rating; unrated is null). */
const ratingOf = (log: StatLog): number | null =>
  typeof log.rating === "number" && Number.isFinite(log.rating) ? log.rating : null

const monthKey = (y: number, m: number) => `${y}-${String(m + 1).padStart(2, "0")}`
const monthLabel = (y: number, m: number) =>
  new Date(y, m, 1).toLocaleDateString("en-GB", { month: "short", year: "numeric" })

function avg(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
}

// --- ranges & filters ---

export function filterByRange<L extends StatLog>(logs: L[], range: StatsRange, now: Date = new Date()): L[] {
  if (range.kind === "all") return logs
  if (range.kind === "year") {
    return logs.filter((l) => dateOf(l)?.getFullYear() === range.year)
  }
  if (range.kind === "month") {
    return logs.filter((l) => {
      const d = dateOf(l)
      return d !== null && d.getFullYear() === range.year && d.getMonth() === range.month - 1
    })
  }
  const start = new Date(now.getFullYear(), now.getMonth() - 11, 1).getTime()
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime()
  return logs.filter((l) => {
    const d = dateOf(l)
    return d !== null && d.getTime() >= start && d.getTime() < end
  })
}

export function filterByType<L extends StatLog>(logs: L[], type: string | "all"): L[] {
  if (type === "all") return logs
  const target = type.trim().toLowerCase()
  return logs.filter((l) => typeName(l).toLowerCase() === target)
}

/** Years that have at least one dated log, newest first. */
export function yearsPresent(logs: StatLog[]): number[] {
  const years = new Set<number>()
  for (const l of logs) {
    const d = dateOf(l)
    if (d) years.add(d.getFullYear())
  }
  return Array.from(years).sort((a, b) => b - a)
}

/** Month options for a year: count per month (1-12), so the UI can disable empty ones. */
export interface MonthOption { month: number; name: string; count: number; disabled: boolean; label: string }

export function monthOptions(logs: StatLog[], year: number): MonthOption[] {
  const counts = new Array<number>(12).fill(0)
  for (const l of logs) {
    const d = dateOf(l)
    if (d && d.getFullYear() === year) counts[d.getMonth()]++
  }
  return counts.map((count, i) => {
    const name = new Date(2000, i, 1).toLocaleDateString("en-GB", { month: "long" })
    return { month: i + 1, name, count, disabled: count === 0, label: `${name} (${count})` }
  })
}

// --- summary ---

export interface Summary {
  total: number
  byStatus: Record<StatusKey, number>
  rated: number
  avgRating: number | null
  completionRate: number | null
}

export function summary(logs: StatLog[]): Summary {
  const byStatus: Record<StatusKey, number> = { completed: 0, "in progress": 0, wishlist: 0, dropped: 0, none: 0 }
  const ratings: number[] = []
  for (const l of logs) {
    const s = (l.status ?? "").trim().toLowerCase()
    byStatus[(STATUS_KEYS as readonly string[]).includes(s) ? (s as StatusKey) : "none"]++
    const r = ratingOf(l)
    if (r !== null) ratings.push(r)
  }
  const denom = logs.length - byStatus.wishlist
  return {
    total: logs.length,
    byStatus,
    rated: ratings.length,
    avgRating: avg(ratings),
    completionRate: denom > 0 ? byStatus.completed / denom : null,
  }
}

// --- per month ---

export interface MonthBucket {
  key: string
  label: string
  total: number
  byType: Record<string, number>
}

/** Ordered months across the range, empty ones included. */
export function perMonth(logs: StatLog[], range: StatsRange, now: Date = new Date()): MonthBucket[] {
  const dated = logs.flatMap((l) => {
    const d = dateOf(l)
    return d ? [{ d, type: typeName(l) }] : []
  })
  const idx = (d: Date) => d.getFullYear() * 12 + d.getMonth()
  const nowIdx = idx(now)
  const maxLog = dated.length ? Math.max(...dated.map((x) => idx(x.d))) : -Infinity
  const minLog = dated.length ? Math.min(...dated.map((x) => idx(x.d))) : Infinity

  let start: number
  let end: number
  if (range.kind === "month") {
    start = end = range.year * 12 + range.month - 1
  } else if (range.kind === "year") {
    start = range.year * 12
    end = Math.max(range.year === now.getFullYear() ? nowIdx : range.year * 12 + 11, Math.min(maxLog, range.year * 12 + 11))
  } else if (range.kind === "last12") {
    start = nowIdx - 11
    end = nowIdx
  } else {
    if (!dated.length) return []
    start = Math.min(minLog, nowIdx)
    end = Math.max(nowIdx, maxLog)
  }

  const buckets: MonthBucket[] = []
  const byIdx = new Map<number, MonthBucket>()
  for (let i = start; i <= end; i++) {
    const y = Math.floor(i / 12)
    const m = i - y * 12
    const b: MonthBucket = { key: monthKey(y, m), label: monthLabel(y, m), total: 0, byType: {} }
    buckets.push(b)
    byIdx.set(i, b)
  }
  for (const { d, type } of dated) {
    const b = byIdx.get(idx(d))
    if (!b) continue
    b.total++
    b.byType[type] = (b.byType[type] ?? 0) + 1
  }
  return buckets
}

export type Granularity = "month" | "year"

/** All time defaults to by-month while the data spans at most 36 months, by-year beyond that. */
export function defaultGranularity(logs: StatLog[], now: Date = new Date()): Granularity {
  const idxs = logs.flatMap((l) => { const d = dateOf(l); return d ? [d.getFullYear() * 12 + d.getMonth()] : [] })
  if (!idxs.length) return "month"
  const lo = Math.min(Math.min(...idxs), now.getFullYear() * 12 + now.getMonth())
  const hi = Math.max(Math.max(...idxs), now.getFullYear() * 12 + now.getMonth())
  return hi - lo + 1 > 36 ? "year" : "month"
}

function emptyBucket(key: string, label: string): MonthBucket {
  return { key, label, total: 0, byType: {} }
}
function addTo(b: MonthBucket, type: string) {
  b.total++
  b.byType[type] = (b.byType[type] ?? 0) + 1
}

/** Every year from the first log (or this year if later) to the latest/now, empty years included. */
export function perYear(logs: StatLog[], now: Date = new Date()): MonthBucket[] {
  const dated = logs.flatMap((l) => { const d = dateOf(l); return d ? [{ y: d.getFullYear(), type: typeName(l) }] : [] })
  if (!dated.length) return []
  const start = Math.min(...dated.map((x) => x.y), now.getFullYear())
  const end = Math.max(...dated.map((x) => x.y), now.getFullYear())
  const byYear = new Map<number, MonthBucket>()
  const out: MonthBucket[] = []
  for (let y = start; y <= end; y++) {
    const b = emptyBucket(String(y), String(y))
    byYear.set(y, b)
    out.push(b)
  }
  for (const { y, type } of dated) addTo(byYear.get(y)!, type)
  return out
}

/** Every day of the month (leap years handled), empty days included. Label is the day number. */
export function perDay(logs: StatLog[], year: number, month: number): MonthBucket[] {
  const days = new Date(year, month, 0).getDate()
  const out: MonthBucket[] = Array.from({ length: days }, (_, i) =>
    emptyBucket(`${monthKey(year, month - 1)}-${String(i + 1).padStart(2, "0")}`, String(i + 1)))
  for (const l of logs) {
    const d = dateOf(l)
    if (d && d.getFullYear() === year && d.getMonth() === month - 1) addTo(out[d.getDate() - 1], typeName(l))
  }
  return out
}

// --- by type ---

export interface TypeStat { type: string; count: number; avgRating: number | null }

export function byType(logs: StatLog[]): TypeStat[] {
  const map = new Map<string, { count: number; ratings: number[] }>()
  for (const l of logs) {
    const t = typeName(l)
    const e = map.get(t) ?? { count: 0, ratings: [] }
    e.count++
    const r = ratingOf(l)
    if (r !== null) e.ratings.push(r)
    map.set(t, e)
  }
  return Array.from(map, ([type, e]) => ({ type, count: e.count, avgRating: avg(e.ratings) }))
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type, undefined, { sensitivity: "base" }))
}

// --- rating histogram ---

export interface RatingBucket { label: string; min: number; max: number; count: number }

export function ratingHistogram(logs: StatLog[]): { buckets: RatingBucket[]; unrated: number } {
  const buckets: RatingBucket[] = Array.from({ length: 10 }, (_, i) => ({
    label: i === 9 ? "90–100" : `${i * 10}–${i * 10 + 9}`,
    min: i * 10,
    max: i === 9 ? 100 : i * 10 + 9,
    count: 0,
  }))
  let unrated = 0
  for (const l of logs) {
    const r = ratingOf(l)
    if (r === null) { unrated++; continue }
    buckets[Math.min(9, Math.max(0, Math.floor(r / 10)))].count++
  }
  return { buckets, unrated }
}

// --- ranked lists ---

export interface RankedStat { name: string; count: number; avgRating: number | null }

function rank(groups: Map<string, { name: string; count: number; ratings: number[] }>, n: number, minCount = 1): RankedStat[] {
  return Array.from(groups.values())
    .filter((g) => g.count >= minCount)
    .map((g) => ({ name: g.name, count: g.count, avgRating: avg(g.ratings) }))
    .sort((a, b) =>
      b.count - a.count ||
      (b.avgRating ?? -1) - (a.avgRating ?? -1) ||
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
    .slice(0, n)
}

function add(groups: Map<string, { name: string; count: number; ratings: number[] }>, name: string, rating: number | null) {
  const key = name.toLowerCase()
  const e = groups.get(key) ?? { name, count: 0, ratings: [] }
  e.count++
  if (rating !== null) e.ratings.push(rating)
  groups.set(key, e)
}

/** Case-insensitive merge, first-seen spelling wins (same rule as the Logs Category filter). */
export function topCategories(logs: StatLog[], n = 10): RankedStat[] {
  const groups = new Map<string, { name: string; count: number; ratings: number[] }>()
  for (const l of logs) {
    const seen = new Set<string>()
    const cats = l.media.genres ?? getCategories(l.media.metadata)
    for (const raw of cats) {
      const c = raw.trim()
      if (!c || seen.has(c.toLowerCase())) continue
      seen.add(c.toLowerCase())
      add(groups, c, ratingOf(l))
    }
  }
  return rank(groups, n)
}

/** Top tags: case-insensitive merge, first-seen spelling wins (rank, #name, count, average rating). */
export function topTags(logs: StatLog[], n = 10): RankedStat[] {
  const groups = new Map<string, { name: string; count: number; ratings: number[] }>()
  for (const l of logs) {
    const seen = new Set<string>()
    for (const tag of l.tags ?? []) {
      const t = tag.name.trim()
      if (!t || seen.has(t.toLowerCase())) continue
      seen.add(t.toLowerCase())
      add(groups, t, ratingOf(l))
    }
  }
  return rank(groups, n)
}

/** Creators with at least 2 logs. Each creator is counted separately from media.creators. */
export function topCreators(logs: StatLog[], n = 10): RankedStat[] {
  const groups = new Map<string, { name: string; count: number; ratings: number[] }>()
  for (const l of logs) {
    const seen = new Set<string>()
    if (l.media.creators && l.media.creators.length > 0) {
      for (const cr of l.media.creators) {
        const c = cr.name.trim()
        if (!c || seen.has(c.toLowerCase())) continue
        seen.add(c.toLowerCase())
        add(groups, c, ratingOf(l))
      }
    } else {
      const c = (l.media.creator ?? "").trim()
      if (c) add(groups, c, ratingOf(l))
    }
  }
  return rank(groups, n, 2)
}

// --- colours ---

export const CHART_KEYS = ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5"] as const
export type ChartKey = (typeof CHART_KEYS)[number] | "type-tv" | "other"

/** Top 5 types (by overall count, pass `byType(allLogs)`) get chart-1..5, tv gets "type-tv" if not in top 5, the rest are "other". */
export function typeColorKey(types: Pick<TypeStat, "type" | "count">[]): (type: string) => ChartKey {
  const top = [...types]
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type, undefined, { sensitivity: "base" }))
    .slice(0, CHART_KEYS.length)
  const map = new Map(top.map((t, i) => [t.type, CHART_KEYS[i]] as const))
  return (type) => {
    const found = map.get(type)
    if (found) return found
    if (type.toLowerCase() === "tv") return "type-tv"
    return "other"
  }
}

// --- text summaries ---

export function mostActiveMonth(months: MonthBucket[]): MonthBucket | null {
  let best: MonthBucket | null = null
  for (const m of months) if (m.total > 0 && (!best || m.total > best.total)) best = m
  return best
}

export type Unit = "month" | "year" | "day"

// --- range <-> string (persisted per device) ---

export function rangeToString(r: StatsRange): string {
  if (r.kind === "year") return `y:${r.year}`
  if (r.kind === "month") return `${r.year}-${String(r.month).padStart(2, "0")}`
  return r.kind
}

export function rangeFromString(s: string | null | undefined): StatsRange | null {
  if (s === "all") return { kind: "all" }
  if (s === "last12") return { kind: "last12" }
  const mm = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(s ?? "")
  if (mm) return { kind: "month", year: Number(mm[1]), month: Number(mm[2]) }
  const m = /^y:(\d{4})$/.exec(s ?? "")
  return m ? { kind: "year", year: Number(m[1]) } : null
}

/** Stored range if still valid (a year must be present; a month must have logs), else this year if it has logs, else all time. */
export function initialRange(logs: StatLog[], stored: string | null, now: Date = new Date()): StatsRange {
  const years = yearsPresent(logs)
  const r = rangeFromString(stored)
  if (r && (r.kind === "month" ? filterByRange(logs, r).length > 0 : r.kind !== "year" || years.includes(r.year))) return r
  return years.includes(now.getFullYear()) ? { kind: "year", year: now.getFullYear() } : { kind: "all" }
}
