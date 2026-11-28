import { useState } from "react"
import type { Log } from "@/types/mainTypes"
import { WaxSeal } from "./WaxSeal"
import { LettersDialog } from "./LettersDialog"

/**
 * The wax seal on a log: nothing without letters. A ready letter wins and opens the log's letters.
 * `compact` (tiles) shows the seal alone, named for screen readers.
 */
export function LetterChip({ log, compact = false }: { log: Log; compact?: boolean }) {
  const [open, setOpen] = useState(false)
  const { sealed, ready } = log.letters ?? { sealed: 0, ready: 0 }
  // Kept mounted while its dialog is open: opening the last ready letter takes the chip away
  if (sealed === 0 && ready === 0 && !open) return null

  const text = ready > 0 ? "Letter ready" : sealed === 1 ? "Letter sealed" : `${sealed} letters sealed`
  const shape = compact
    ? "inline-flex shrink-0 items-center rounded-full p-0.5"
    : "inline-flex items-center gap-1.5 rounded-full py-0.5 pr-2 pl-1 text-xs"

  return (
    <>
      {ready > 0 ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={compact ? `${text}: ${log.media.title}` : undefined}
          className={`${shape} border border-primary bg-card font-semibold text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
        >
          <WaxSeal tone="ready" />
          {!compact && text}
        </button>
      ) : sealed > 0 ? (
        compact ? (
          <WaxSeal label={text} />
        ) : (
          <span className={`${shape} bg-tag text-tag-foreground`}>
            <WaxSeal />
            {text}
          </span>
        )
      ) : null}
      {open && <LettersDialog logId={log.id} onClose={() => setOpen(false)} />}
    </>
  )
}
