import { useId, useState, type ReactNode } from "react"

interface StatsFigureProps {
  title: string
  /** One-sentence text summary, also the figure's accessible name. */
  summary: string
  chart: ReactNode
  table: ReactNode
  /** Extra content under the chart (legend, notes). */
  footer?: ReactNode
  /** Controls shown under the summary in both chart and table mode (e.g. a granularity toggle). */
  controls?: ReactNode
}

/** A chart card: heading, one-sentence summary, the chart and a real table alternative. */
export function StatsFigure({ title, summary, chart, table, footer, controls }: StatsFigureProps) {
  const [asTable, setAsTable] = useState(false)
  const id = useId()
  return (
    <figure aria-label={`${title}. ${summary}`} className="min-w-0 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-display text-xl font-semibold">{title}</h2>
        <button
          type="button"
          aria-pressed={asTable}
          aria-controls={id}
          onClick={() => setAsTable((v) => !v)}
          className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground underline underline-offset-2 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          {asTable ? "Show as chart" : "Show as table"}
        </button>
      </div>
      <figcaption className="mt-1 text-sm text-muted-foreground">{summary}</figcaption>
      {controls && <div className="mt-2">{controls}</div>}
      <div id={id} className="mt-3 min-w-0">
        {asTable ? <div className="overflow-x-auto">{table}</div> : chart}
      </div>
      {footer && !asTable && <div className="mt-3">{footer}</div>}
    </figure>
  )
}

export function DataTable({ caption, head, rows }: { caption: string; head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="w-full text-left text-sm tabular-nums">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr className="border-b border-border text-xs text-muted-foreground">
          {head.map((h, i) => <th key={h} scope="col" className={`py-1 pr-3 font-medium ${i > 0 ? "text-right" : ""}`}>{h}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, ri) => (
          <tr key={ri} className="border-b border-border/50 last:border-0">
            {r.map((c, i) => i === 0
              ? <th key={i} scope="row" className="py-1 pr-3 font-normal">{c}</th>
              : <td key={i} className="py-1 pr-3 text-right">{c}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
