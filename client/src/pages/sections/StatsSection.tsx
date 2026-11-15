import { useEffect, useMemo, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"

import EmptyState from "@/components/EmptyState"
import { PageShell } from "@/components/layout/PageShell"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DataTable, StatsFigure } from "@/components/stats/StatsFigure"
import { Histogram, Legend, RankedList, TimeChart, TypeBars } from "@/components/stats/charts"
import { TypeStatsPanel, TypeSummaryRow } from "@/components/stats/TypeStatsCards"
import { UNIT_HEAD, bucketLabel, fmtAvg, peakSummary, ratingSummary, typeLabel } from "@/lib/statsView"
import { fetchLogsQueryOptions } from "@/queryOptions/fetchLogsQueryOptions"
import {
  byType, defaultGranularity, filterByRange, filterByType, initialRange, monthOptions, mostActiveMonth, perDay, perMonth,
  perYear, rangeFromString, rangeToString, ratingHistogram, type Granularity, type Unit, summary, topCategories, topCreators, topTags, typeColorKey, yearsPresent, type StatsRange,
} from "@/lib/stats"
import { computeTypeStatsFor } from "@/lib/typeStats"
import { EMPTY_LINES, pickLoadingLine, pickStatsLine } from "@/lib/whimsy"
import { cn, writeStoredString } from "@/lib/utils"
import { dudeSay } from "@/lib/dude"

const RANGE_KEY = "stats.range"
const GRAN_KEY = "stats.granularity"
const TYPE_KEY = "stats.type"

function readStoredGranularity(): Granularity | null {
  try {
    const v = localStorage.getItem(GRAN_KEY)
    return v === "month" || v === "year" ? v : null
  } catch { return null }
}

function readStoredRange(): string | null {
  try { return localStorage.getItem(RANGE_KEY) } catch { return null }
}

function readStoredType(): string | null {
  try { return localStorage.getItem(TYPE_KEY) } catch { return null }
}

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-card p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-display text-3xl font-semibold tabular-nums">{children}</dd>
    </div>
  )
}

export default function StatsSection() {
  const [loadingLine] = useState(() => pickLoadingLine())
  const { data: logs = [], error, isPending } = useQuery(fetchLogsQueryOptions())
  const [chosen, setChosen] = useState<string | null>(null)

  const years = useMemo(() => yearsPresent(logs), [logs])
  const range: StatsRange = useMemo(
    () => (chosen && rangeFromString(chosen)) || initialRange(logs, readStoredRange()),
    [chosen, logs],
  )
  // Period select: a month range still shows its year
  const periodValue = range.kind === "month" ? `y:${range.year}` : rangeToString(range)
  const selectedYear = range.kind === "year" || range.kind === "month" ? range.year : null
  const monthOpts = useMemo(() => (selectedYear === null ? [] : monthOptions(logs, selectedYear)), [logs, selectedYear])
  const setRange = (v: string) => { setChosen(v); writeStoredString(RANGE_KEY, v) }
  const setMonth = (v: string) => {
    if (selectedYear !== null) setRange(v === "year" ? `y:${selectedYear}` : rangeToString({ kind: "month", year: selectedYear, month: Number(v) }))
  }

  const [storedGran, setStoredGran] = useState<Granularity | null>(readStoredGranularity)
  const granularity: Granularity = storedGran ?? defaultGranularity(logs)
  const setGranularity = (g: Granularity) => { setStoredGran(g); writeStoredString(GRAN_KEY, g) }

  // 1. Logs in the selected date range
  const inRange = useMemo(() => filterByRange(logs, range), [logs, range])

  // 2. Types present in this range (in count descending order)
  const types = useMemo(() => byType(inRange), [inRange])

  // 3. Stored type choice and fallback to "all" if not present in this range
  const [storedType, setStoredType] = useState<string | null>(readStoredType)
  const setType = (t: string) => {
    setStoredType(t)
    try {
      localStorage.setItem(TYPE_KEY, t)
    } catch {
      // storage unavailable or quota exceeded
    }
  }

  const selectedType = useMemo(() => {
    if (!storedType || storedType === "all") return "all"
    const match = types.find((t) => t.type.toLowerCase() === storedType.toLowerCase())
    return match ? match.type : "all"
  }, [storedType, types])

  // 4. Pure filterByType step
  const filteredLogs = useMemo(() => filterByType(inRange, selectedType), [inRange, selectedType])

  const sum = useMemo(() => summary(filteredLogs), [filteredLogs])
  const unit: Unit = range.kind === "month" ? "day" : range.kind === "all" && granularity === "year" ? "year" : "month"
  const months = useMemo(
    () => range.kind === "month" ? perDay(filteredLogs, range.year, range.month)
      : unit === "year" ? perYear(filteredLogs)
      : perMonth(filteredLogs, range),
    [filteredLogs, range, unit],
  )

  // Colours are assigned from the overall counts so they stay put when the range changes
  const colorOf = useMemo(() => typeColorKey(byType(logs)), [logs])
  const hist = useMemo(() => ratingHistogram(filteredLogs), [filteredLogs])
  const cats = useMemo(() => topCategories(filteredLogs), [filteredLogs])
  const creators = useMemo(() => topCreators(filteredLogs), [filteredLogs])
  const tags = useMemo(() => topTags(filteredLogs), [filteredLogs])
  const hasTagsInRange = useMemo(() => filteredLogs.some((l) => (l.tags ?? []).length > 0), [filteredLogs])
  const line = pickStatsLine({ total: sum.total, completed: sum.byStatus.completed, avgRating: sum.avgRating })

  const lastLineSaid = useRef<string | null>(null)
  useEffect(() => {
    if (!line) return
    if (lastLineSaid.current === line) return
    lastLineSaid.current = line
    dudeSay(line)
  }, [line])

  const legend = useMemo(() => {
    if (selectedType !== "all") {
      const k = colorOf(selectedType)
      return [{ key: k, label: typeLabel(selectedType) }]
    }
    const seen = new Map<string, { key: ReturnType<typeof colorOf>; label: string }>()
    let other = false
    for (const t of types) {
      const k = colorOf(t.type)
      if (k === "other") other = true
      else seen.set(t.type, { key: k, label: typeLabel(t.type) })
    }
    const entries = Array.from(seen.values()).sort((a, b) => a.key.localeCompare(b.key))
    if (other) entries.push({ key: "other", label: "Other" })
    return entries
  }, [selectedType, types, colorOf])

  const typeOrder = useMemo(
    () => (selectedType !== "all" ? [selectedType] : types.map((t) => t.type)),
    [selectedType, types],
  )

  // Compact summary row for "All types": metrics per type in this range
  const detailStats = useMemo(() => {
    return types.map((t) => {
      const matchingLogs = inRange.filter(
        (l) => (l.media.mediaType?.name?.trim() || "Unknown").toLowerCase() === t.type.toLowerCase(),
      )
      const completed = matchingLogs.filter((l) => (l.status ?? "").trim().toLowerCase() === "completed")
      return {
        type: t.type,
        stats: computeTypeStatsFor(t.type, completed),
      }
    })
  }, [types, inRange])

  // Single type panel when a type is selected
  const selectedTypeStats = useMemo(() => {
    if (selectedType === "all") return null
    const completed = filteredLogs.filter((l) => (l.status ?? "").trim().toLowerCase() === "completed")
    return computeTypeStatsFor(selectedType, completed)
  }, [selectedType, filteredLogs])

  const peak = mostActiveMonth(months)
  const timeSummary = peakSummary(peak, unit)
  const topType = types[0]
  const typeSummary = topType ? `${typeLabel(topType.type)} leads with ${topType.count} ${topType.count === 1 ? "log" : "logs"}.` : "No logs in this range."
  const modal = hist.buckets.reduce((a, b) => (b.count > a.count ? b : a), hist.buckets[0])
  const histSummary = ratingSummary(sum.avgRating, sum.rated > 0 ? modal.label : null, hist.unrated)

  const typeKeys = selectedType !== "all"
    ? [selectedType]
    : Array.from(new Set(months.flatMap((m) => Object.keys(m.byType)))).sort((a, b) => typeOrder.indexOf(a) - typeOrder.indexOf(b))

  const hasLogs = logs.length > 0

  // Tabs for type selection
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const tabs = useMemo(() => [
    { value: "all", label: "All types" },
    ...types.map((t) => ({ value: t.type, label: typeLabel(t.type) })),
  ], [types])

  const handleTabKeyDown = (e: React.KeyboardEvent, index: number) => {
    let next = -1
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault()
      next = (index + 1) % tabs.length
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault()
      next = (index - 1 + tabs.length) % tabs.length
    } else if (e.key === "Home") {
      e.preventDefault()
      next = 0
    } else if (e.key === "End") {
      e.preventDefault()
      next = tabs.length - 1
    }

    if (next !== -1) {
      const targetTab = tabs[next]
      setType(targetTab.value)
      tabRefs.current[next]?.focus()
    }
  }

  const sectionSuffix = selectedType === "all" ? "" : ` · ${typeLabel(selectedType)}`

  return (
    <PageShell
      title="Your stats"
      controls={
        hasLogs ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
              <div className="flex flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="stats-range" className="text-sm text-muted-foreground">Period</Label>
                    <Select value={periodValue} onValueChange={setRange}>
                      <SelectTrigger id="stats-range" className="w-40"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All time</SelectItem>
                        <SelectItem value="last12">Last 12 months</SelectItem>
                        {years.map((y) => <SelectItem key={y} value={`y:${y}`}>{y}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="stats-month" className="text-sm text-muted-foreground">Month</Label>
                    <Select value={range.kind === "month" ? String(range.month) : "year"} onValueChange={setMonth} disabled={selectedYear === null}>
                      <SelectTrigger id="stats-month" className="w-40"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="year">Whole year</SelectItem>
                        {monthOpts.map((o) => <SelectItem key={o.month} value={String(o.month)} disabled={o.disabled}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">Dated by finish date when set, otherwise the logged date.</p>
              </div>
            </div>

            {/* Type tabs */}
            {tabs.length > 1 && (
              <div
                role="tablist"
                aria-label="Filter stats by type"
                className="inline-flex flex-wrap gap-1 rounded-lg border border-border p-0.5 text-xs w-fit"
              >
                {tabs.map((tab, idx) => {
                  const isSelected = (selectedType === "all" && tab.value === "all") ||
                    (selectedType.toLowerCase() === tab.value.toLowerCase())
                  return (
                    <button
                      key={tab.value}
                      ref={(el) => { tabRefs.current[idx] = el }}
                      role="tab"
                      aria-selected={isSelected}
                      tabIndex={isSelected ? 0 : -1}
                      onClick={() => setType(tab.value)}
                      onKeyDown={(e) => handleTabKeyDown(e, idx)}
                      className={cn(
                        "rounded-md px-3 py-1 font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors cursor-pointer",
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {tab.label}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        ) : undefined
      }
      contentClassName="overflow-x-hidden scrollbar-hide"
    >
      {isPending && <p className="font-hand text-lg animate-pulse text-muted-foreground">{loadingLine}</p>}
      {error && <p className="text-center text-sm text-destructive">{error.message}</p>}

      {!isPending && !hasLogs && (
        <EmptyState line={EMPTY_LINES.noStats}>
          <p>Log something and your stats will show up here.</p>
        </EmptyState>
      )}

      {!isPending && hasLogs && inRange.length === 0 && (
        <p className="text-sm text-muted-foreground">Nothing logged in this range. Pick another one above.</p>
      )}

      {!isPending && hasLogs && inRange.length > 0 && (
        <div className="flex flex-col gap-5">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            <Tile label="Logged">{sum.total}</Tile>
            <Tile label="Completed">{sum.byStatus.completed}</Tile>
            <Tile label="In progress">{sum.byStatus["in progress"]}</Tile>
            <Tile label="Wishlist">{sum.byStatus.wishlist}</Tile>
            <Tile label="Average rating">
              {fmtAvg(sum.avgRating)}{sum.avgRating !== null && <span className="text-base font-normal text-muted-foreground"> /100</span>}
            </Tile>
            <Tile label="Completion rate">{sum.completionRate === null ? "–" : `${Math.round(sum.completionRate * 100)}%`}</Tile>
          </dl>

          {/* Type stats panel when a single type is selected */}
          {selectedTypeStats && (
            <TypeStatsPanel type={selectedType} stats={selectedTypeStats} />
          )}

          <StatsFigure
            title={`Logged over time${sectionSuffix}`}
            summary={timeSummary}
            controls={range.kind === "all" ? (
              <div role="group" aria-label="Group the chart" className="inline-flex rounded-lg border border-border p-0.5 text-xs">
                {(["month", "year"] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    aria-pressed={granularity === g}
                    onClick={() => setGranularity(g)}
                    className={`rounded-md px-3 py-1 font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring ${granularity === g ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    By {g}
                  </button>
                ))}
              </div>
            ) : undefined}
            chart={<TimeChart months={months} colorOf={colorOf} order={typeOrder} unit={unit} />}
            footer={<Legend entries={legend} />}
            table={
              <DataTable
                caption={selectedType === "all" ? `Logs per ${unit} by type` : `Logs per ${unit} · ${typeLabel(selectedType)}`}
                head={[UNIT_HEAD[unit], "Total", ...typeKeys.map(typeLabel)]}
                rows={months.map((m) => [bucketLabel(m, unit), m.total, ...typeKeys.map((t) => m.byType[t] ?? 0)])}
              />
            }
          />

          {selectedType === "all" ? (
            <>
              <div className="grid gap-5 lg:grid-cols-2">
                <StatsFigure
                  title="By type"
                  summary={typeSummary}
                  chart={<TypeBars types={types} colorOf={colorOf} />}
                  table={<DataTable caption="Logs by type" head={["Type", "Logs", "Avg rating"]} rows={types.map((t) => [typeLabel(t.type), t.count, fmtAvg(t.avgRating)])} />}
                />
                <StatsFigure
                  title="Rating distribution"
                  summary={histSummary}
                  chart={<Histogram buckets={hist.buckets} unrated={hist.unrated} />}
                  table={<DataTable caption="Logs per rating range" head={["Rating", "Logs"]} rows={[...hist.buckets.map((b) => [b.label, b.count]), ["Unrated", hist.unrated]]} />}
                />
              </div>

              {detailStats.length > 0 && (
                <section aria-labelledby="by-type-detail-heading" className="flex flex-col gap-3">
                  <h2 id="by-type-detail-heading" className="font-display text-xl font-semibold">
                    By type in detail
                  </h2>
                  <TypeSummaryRow items={detailStats} onSelectType={setType} />
                </section>
              )}
            </>
          ) : (
            <StatsFigure
              title={`Rating distribution${sectionSuffix}`}
              summary={histSummary}
              chart={<Histogram buckets={hist.buckets} unrated={hist.unrated} />}
              table={<DataTable caption={`Logs per rating range${sectionSuffix}`} head={["Rating", "Logs"]} rows={[...hist.buckets.map((b) => [b.label, b.count]), ["Unrated", hist.unrated]]} />}
            />
          )}

          <div className="grid gap-5 lg:grid-cols-2">
            <section className="min-w-0 rounded-xl border border-border bg-card p-4">
              <h2 className="mb-3 font-display text-xl font-semibold">Top categories{sectionSuffix}</h2>
              {cats.length > 0 ? <RankedList items={cats} asTag label={`Top categories${sectionSuffix}`} /> : <p className="text-sm text-muted-foreground">No categories on these logs.</p>}
            </section>
            <section className="min-w-0 rounded-xl border border-border bg-card p-4">
              <h2 className="mb-3 font-display text-xl font-semibold">Top creators{sectionSuffix}</h2>
              {creators.length > 0 ? <RankedList items={creators} label={`Top creators${sectionSuffix}`} /> : <p className="text-sm text-muted-foreground">No creator appears twice yet.</p>}
            </section>
            {hasTagsInRange && (
              <section className="min-w-0 rounded-xl border border-border bg-card p-4">
                <h2 className="mb-3 font-display text-xl font-semibold">Top tags{sectionSuffix}</h2>
                {tags.length > 0 ? <RankedList items={tags} asUserTag label={`Top tags${sectionSuffix}`} /> : <p className="text-sm text-muted-foreground">No tags on these logs.</p>}
              </section>
            )}
          </div>
        </div>
      )}
    </PageShell>
  )
}
