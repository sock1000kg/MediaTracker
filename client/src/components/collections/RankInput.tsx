import { useRef, useState } from "react"

interface RankInputProps {
  /** 1-based rank shown in the box */
  rank: number
  total: number
  title: string
  logId: number
  /** Called with the new 1-based rank (already clamped to 1..total) when it changed */
  onRank: (rank: number) => void
  className?: string
}

/** Type a number, then Enter (or click away) to move the item there. Escape puts the old rank back. */
export function RankInput({ rank, total, title, logId, onRank, className = "" }: RankInputProps) {
  // null = not editing: show the real rank, so it follows moves and refetches
  const [draft, setDraft] = useState<string | null>(null)
  const cancelled = useRef(false) // Escape blurs, and that blur must not commit


  const commit = () => {
    if (cancelled.current) {
      cancelled.current = false
      return
    }
    if (draft === null) return
    setDraft(null)
    const n = Number.parseInt(draft, 10)
    if (!Number.isFinite(n)) return
    const next = Math.min(Math.max(n, 1), total)
    if (next !== rank) onRank(next)
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={draft ?? String(rank)}
      onChange={(e) => setDraft(e.target.value.replace(/\D/g, ""))}
      onBlur={commit}
      onFocus={(e) => e.target.select()}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault()
          commit()
        } else if (e.key === "Escape") {
          cancelled.current = true
          setDraft(null)
          e.currentTarget.blur()
        }
      }}
      aria-label={`Rank of ${title}, 1 to ${total}`}
      title="Type a rank, then Enter"
      data-log-id={logId}
      data-action="rank"
      className={`w-9 rounded-md border border-transparent bg-transparent px-1 text-center font-display font-semibold tabular-nums text-foreground hover:border-input focus:border-input focus:bg-card focus:outline-none focus:ring-2 focus:ring-ring ${className}`}
    />
  )
}
