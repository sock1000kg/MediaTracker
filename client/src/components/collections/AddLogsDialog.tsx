import { useState, useMemo, useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { Search } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { fetchLogsQueryOptions } from "@/queryOptions/fetchLogsQueryOptions"
import { membershipDiff } from "@/lib/collectionHelpers"
import type { Log } from "@/types/mainTypes"

interface AddLogsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  collectionId: string
  collectionTitle: string
  initialLogIds: string[]
  onApply: (diff: { added: string[]; removed: string[] }) => Promise<void>
}

export function AddLogsDialog({
  open,
  onOpenChange,
  collectionTitle,
  initialLogIds,
  onApply,
}: AddLogsDialogProps) {
  const { data: allLogs = [], isLoading } = useQuery(fetchLogsQueryOptions())
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set(initialLogIds))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setSelected(new Set(initialLogIds))
      setSearch("")
      setError(null)
    }
  }, [open, initialLogIds])

  const filteredLogs = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return allLogs
    return allLogs.filter((l: Log) => {
      const title = l.media.title.toLowerCase()
      const creator = (l.media.creator ?? "").toLowerCase()
      return title.includes(q) || creator.includes(q)
    })
  }, [allLogs, search])

  const toggleLog = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleApply = async () => {
    setSaving(true)
    setError(null)
    try {
      const diff = membershipDiff(initialLogIds, selected)
      await onApply(diff)
      onOpenChange(false)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update logs")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Add logs</DialogTitle>
          <DialogDescription>
            Select logs to include in &ldquo;{collectionTitle}&rdquo;
          </DialogDescription>
        </DialogHeader>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="relative">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search logs by title or creator…"
            className="pl-9"
            aria-label="Search logs"
          />
        </div>

        <div className="max-h-60 overflow-y-auto space-y-1 py-1">
          {isLoading ? (
            <p className="text-sm text-muted-foreground p-2">Loading your logs…</p>
          ) : filteredLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground p-2">
              {allLogs.length === 0 ? "You have no logs yet." : "No matching logs found."}
            </p>
          ) : (
            filteredLogs.map((log: Log) => {
              const isChecked = selected.has(log.id)
              return (
                <label
                  key={log.id}
                  className="flex items-center justify-between rounded-md p-2 hover:bg-muted/50 cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0 pr-2">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleLog(log.id)}
                      className="size-4 rounded border-border-strong text-primary focus:ring-ring shrink-0"
                      aria-label={`Select ${log.media.title}`}
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{log.media.title}</p>
                      {log.media.creator && (
                        <p className="text-xs text-muted-foreground truncate">{log.media.creator}</p>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground uppercase tracking-wide shrink-0">
                    {log.media.mediaType?.name}
                  </span>
                </label>
              )
            })
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" variant="default" disabled={saving} onClick={handleApply}>
            {saving ? "Saving…" : "Apply"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
