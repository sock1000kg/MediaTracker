import { useState } from "react"

import { useIsDesktop } from "@/hooks/useIsDesktop"
import { colorVar, fmtAvg, monthText, typeLabel } from "@/lib/statsView"
import type { ChartKey, MonthBucket, Unit, RankedStat, RatingBucket, TypeStat } from "@/lib/stats"

// ---- Logged over time ----

const PLOT_H = 150

export function TimeChart({ months, colorOf, order, unit = "month" }: { months: MonthBucket[]; colorOf: (t: string) => ChartKey; order: string[]; unit?: Unit }) {
  const isDesktop = useIsDesktop()
  const [active, setActive] = useState<number | null>(null)
  const max = Math.max(1, ...months.map((m) => m.total))
  const step = unit === "day"
    ? (isDesktop ? 1 : 5)
    : unit === "year" ? (months.length > 12 && !isDesktop ? 3 : 1)
    : months.length > 12 && !isDesktop ? 3 : months.length > 24 ? 3 : 1
  const rank = (t: string) => { const i = order.indexOf(t); return i === -1 ? order.length : i }

  return (
    <div className="min-w-0">
      <p aria-hidden="true" className="mb-2 min-h-5 text-sm tabular-nums text-foreground">
        {active !== null ? monthText(months[active], unit) : <span className="text-muted-foreground">Hover, tap or focus a bar for details</span>}
      </p>
      <div className="overflow-x-auto pb-1" onMouseLeave={() => setActive(null)}>
        <ul className="flex items-end gap-1" style={{ minWidth: months.length * (unit === "day" ? 20 : 28) }}>
          {months.map((m, i) => (
            <li key={m.key} className={`flex ${unit === "day" ? "min-w-[16px]" : "min-w-[24px]"} flex-1 flex-col items-stretch`}>
              <div
                tabIndex={0}
                role="img"
                aria-label={monthText(m, unit)}
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                onClick={() => setActive(i)}
                className={`flex flex-col-reverse justify-start rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring ${active === i ? "bg-accent" : ""}`}
                style={{ height: PLOT_H }}
              >
                {m.total === 0 ? (
                  <span className="h-px w-full bg-border-strong" />
                ) : (
                  Object.entries(m.byType)
                    .sort((a, b) => rank(a[0]) - rank(b[0]))
                    .map(([t, n]) => (
                      <span
                        key={t}
                        className="block w-full border-t border-card first:border-t-0"
                        style={{ height: (n / max) * PLOT_H, background: colorVar(colorOf(t)) }}
                      />
                    ))
                )}
              </div>
              <span className="mt-1 h-7 text-center text-[10px] leading-tight text-muted-foreground" aria-hidden="true">
                {i % step === 0 ? (
                  <>
                    {unit === "month" ? (
                      <>
                        {m.label.slice(0, 3)}
                        {(i === 0 || m.key.endsWith("-01")) && <><br />{m.label.slice(-4)}</>}
                      </>
                    ) : m.label}
                  </>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export function Legend({ entries }: { entries: { key: ChartKey; label: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Legend">
      {entries.map((e) => (
        <li key={e.key + e.label} className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block size-3 rounded-sm" style={{ background: colorVar(e.key) }} />
          {e.label}
        </li>
      ))}
    </ul>
  )
}

// ---- By type ----

export function TypeBars({ types, colorOf }: { types: TypeStat[]; colorOf: (t: string) => ChartKey }) {
  const max = Math.max(1, ...types.map((t) => t.count))
  return (
    <ul className="flex flex-col gap-2">
      {types.map((t) => (
        <li key={t.type} className="text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate">{typeLabel(t.type)}</span>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {t.count} {t.count === 1 ? "log" : "logs"} · avg {fmtAvg(t.avgRating)}
            </span>
          </div>
          <div className="mt-0.5 h-2.5 rounded-sm bg-muted">
            <div className="h-full rounded-sm" style={{ width: `${(t.count / max) * 100}%`, background: colorVar(colorOf(t.type)) }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

// ---- Rating distribution ----

export function Histogram({ buckets, unrated }: { buckets: RatingBucket[]; unrated: number }) {
  const max = Math.max(1, ...buckets.map((b) => b.count))
  return (
    <div>
      <ul className="flex items-end gap-1">
        {buckets.map((b) => (
          <li key={b.label} className="flex flex-1 flex-col items-center">
            <span className="text-[10px] tabular-nums text-muted-foreground">{b.count || ""}</span>
            <div className="flex w-full items-end" style={{ height: 100 }}>
              <div
                role="img"
                aria-label={`${b.label}: ${b.count} ${b.count === 1 ? "log" : "logs"}`}
                className="w-full rounded-t-sm"
                style={{ height: b.count === 0 ? 1 : Math.max(2, (b.count / max) * 100), background: b.count === 0 ? "var(--border-strong)" : "var(--chart-2)" }}
              />
            </div>
            <span className="mt-1 text-[9px] tabular-nums text-muted-foreground" aria-hidden="true">{b.min}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-sm text-muted-foreground tabular-nums">Unrated: {unrated}</p>
    </div>
  )
}

// ---- Ranked lists ----

export function RankedList({
  items,
  asTag,
  asUserTag,
  label,
}: {
  items: RankedStat[]
  asTag?: boolean
  asUserTag?: boolean
  label: string
}) {
  const max = Math.max(1, ...items.map((i) => i.count))
  return (
    <ol aria-label={label} className="flex flex-col gap-2">
      {items.map((it, i) => (
        <li key={it.name} className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-x-2 text-sm">
          <span className="text-xs tabular-nums text-muted-foreground">{i + 1}</span>
          <span className="min-w-0 truncate">
            {asUserTag ? (
              <span className="user-tag pointer-events-none">#{it.name}</span>
            ) : asTag ? (
              <span className="tag">{it.name}</span>
            ) : (
              it.name
            )}
          </span>
          <span className="text-xs tabular-nums text-muted-foreground">{it.count} · avg {fmtAvg(it.avgRating)}</span>
          <span className="col-start-2 col-span-2 mt-0.5 h-1 rounded-sm bg-muted" aria-hidden="true">
            <span className="block h-full rounded-sm" style={{ width: `${(it.count / max) * 100}%`, background: "var(--chart-3)" }} />
          </span>
        </li>
      ))}
    </ol>
  )
}
