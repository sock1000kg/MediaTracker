import { ChevronsUp } from "lucide-react"
import { Button } from "@/components/ui/button"

interface GroupFooterProps {
  total: number
  remaining: number
  /** How many items one "Load more…" reveals. */
  step: number
  expanded: boolean
  groupLabel?: string | null
  onLoadMore: () => void
  onLoadAll: () => void
  onCollapse: () => void
}

const pill = "rounded-full border-border-strong bg-card"

/** Row of pills under a group: Load more…, Load all, Collapse. Renders nothing when none apply. */
export function GroupFooter({ total, remaining, step, expanded, groupLabel, onLoadMore, onLoadAll, onCollapse }: GroupFooterProps) {
  const canMore = remaining > 0
  const canAll = remaining > step
  if (!canMore && !expanded) return null
  const g = groupLabel ? " " + groupLabel : ""
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {canMore && (
        <Button type="button" variant="outline" size="sm" className={pill}
          aria-label={`Load more${g}, ${remaining} more`} onClick={onLoadMore}>
          Load more… ({remaining} more)
        </Button>
      )}
      {canAll && (
        <Button type="button" variant="outline" size="sm" className={pill}
          aria-label={`Load all${g}, ${total} items`} onClick={onLoadAll}>
          Load all ({total})
        </Button>
      )}
      {expanded && (
        <Button type="button" variant="outline" size="sm" className={pill}
          aria-label={`Collapse${g}`} onClick={onCollapse}>
          <ChevronsUp aria-hidden="true" /> Collapse
        </Button>
      )}
    </div>
  )
}
