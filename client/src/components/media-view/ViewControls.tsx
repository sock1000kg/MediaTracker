import { LayoutGrid, List } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export type View = "list" | "grid"

interface ViewControlsProps {
  view: View
  onView: (v: View) => void
  group?: string
  onGroup?: (g: string) => void
  /** Leave out to hide the "Group:" select (search pages only switch view). */
  groupOptions?: { value: string; label: string }[]
  groupAriaLabel?: string
}

/** List/Grid segmented pill plus the "Group:" select. */
export function ViewControls({ view, onView, group, onGroup, groupOptions, groupAriaLabel = "Group" }: ViewControlsProps) {
  return (
    <>
      <div role="group" aria-label="View" className="flex items-center border border-border-strong rounded-full h-9 overflow-hidden bg-card">
        <Button
          variant="ghost" size="sm" aria-pressed={view === "list"}
          className={`h-full rounded-none px-3 gap-2 font-normal ${view === "list" ? "bg-muted text-foreground" : "bg-card text-muted-foreground hover:text-foreground"}`}
          onClick={() => onView("list")}
        >
          <List className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">List</span>
        </Button>
        <div className="w-[1px] h-4 bg-border" />
        <Button
          variant="ghost" size="sm" aria-pressed={view === "grid"}
          className={`h-full rounded-none px-3 gap-2 font-normal ${view === "grid" ? "bg-muted text-foreground" : "bg-card text-muted-foreground hover:text-foreground"}`}
          onClick={() => onView("grid")}
        >
          <LayoutGrid className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Grid</span>
        </Button>
      </div>
      {groupOptions && group !== undefined && onGroup && (
      <Select value={group} onValueChange={onGroup}>
        <SelectTrigger aria-label={groupAriaLabel} className="h-9 w-fit gap-2 rounded-full border-border-strong bg-card px-3 text-sm font-normal">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {groupOptions.map((o) => <SelectItem key={o.value} value={o.value}>Group: {o.label}</SelectItem>)}
        </SelectContent>
      </Select>
      )}
    </>
  )
}
