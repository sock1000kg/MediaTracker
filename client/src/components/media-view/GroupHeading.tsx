import type { ReactNode, Ref } from "react"
import { ChevronsUp } from "lucide-react"

interface GroupHeadingProps {
  /** Group name. Omit for the unlabelled "None" group. */
  label?: ReactNode
  /** While true the row sticks to the top of the scroll area and shows Collapse. */
  expanded?: boolean
  onCollapse?: () => void
  headingRef?: Ref<HTMLHeadingElement>
  barRef?: Ref<HTMLDivElement>
}

const collapsePill = "inline-flex items-center gap-1 rounded-full border border-border-strong bg-card px-3 py-1 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"

/** Group heading pill. Once the group is expanded the row turns sticky and gains a Collapse pill. */
export function GroupHeading({ label, expanded = false, onCollapse, headingRef, barRef }: GroupHeadingProps) {
  if (!label && !expanded) return null
  const collapse = expanded && onCollapse && (
    <button
      type="button"
      className={collapsePill}
      aria-label={label ? `Collapse ${label}` : "Collapse"}
      onClick={onCollapse}
    >
      <ChevronsUp className="size-3.5" aria-hidden="true" /> Collapse
    </button>
  )
  return (
    <div
      ref={barRef}
      className={expanded
        ? "sticky top-0 z-10 -mx-6 mb-2 flex items-center justify-between gap-2 bg-background/70 px-6 py-1.5 backdrop-blur-sm"
        : "mb-2 flex items-center justify-between gap-2"}
    >
      {label ? (
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="w-fit scroll-mt-14 rounded-full bg-background/70 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground outline-none backdrop-blur-sm focus-visible:ring-2 focus-visible:ring-ring"
        >
          {label}
        </h2>
      ) : <span />}
      {collapse}
    </div>
  )
}
