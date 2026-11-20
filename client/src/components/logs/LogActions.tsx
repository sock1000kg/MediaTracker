import { useEffect, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { MoreHorizontal, Loader2 } from "lucide-react"
import type { Log } from "@/types/mainTypes"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { providerLinks } from "@/lib/providerLinks"
import { AddToCollectionDialog } from "@/components/collections/AddToCollectionDialog"
import { refreshMedia } from "@/api/media"
import { fetchLogsQueryOptions } from "@/queryOptions/fetchLogsQueryOptions"
import { fetchMediasQueryOptions } from "@/queryOptions/fetchMediasQueryOptions"

interface LogActionsProps {
  log: Log
  onEdit: (log: Log) => void
  onDelete: (log: Log) => void
  /** Opens the edit dialog on a new entry. Hidden when a page can't do it. */
  onAddEntry?: (log: Log) => void
  extraMenuItems?: React.ReactNode
}

export function LogActions({ log, onEdit, onDelete, onAddEntry, extraMenuItems }: LogActionsProps) {
  const [collectionDialogOpen, setCollectionDialogOpen] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [errorToast, setErrorToast] = useState<string | null>(null)
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!errorToast) return
    const t = setTimeout(() => setErrorToast(null), 4000)
    return () => clearTimeout(t)
  }, [errorToast])

  const links = providerLinks(log.media)
  const isCustom = !log.media.provider

  const handleRefresh = async () => {
    if (isRefreshing) return
    setIsRefreshing(true)
    try {
      await refreshMedia(log.media.id)
      queryClient.invalidateQueries({ queryKey: fetchLogsQueryOptions().queryKey })
      queryClient.invalidateQueries({ queryKey: fetchMediasQueryOptions().queryKey })
    } catch (err: unknown) {
      setErrorToast((err as Error)?.message || "Failed to refresh media")
    } finally {
      setIsRefreshing(false)
    }
  }

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-9 text-muted-foreground" aria-label={"Actions for " + log.media.title}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {links.map((link) => (
            <DropdownMenuItem key={link.href} asChild>
              <a href={link.href} target="_blank" rel="noopener noreferrer">{link.label}</a>
            </DropdownMenuItem>
          ))}
          {links.length > 0 && <DropdownMenuSeparator />}
          <DropdownMenuItem onSelect={() => setCollectionDialogOpen(true)}>Add to collection…</DropdownMenuItem>
          {extraMenuItems}
          {!isCustom && (
            <DropdownMenuItem
              disabled={isRefreshing}
              onSelect={(e) => {
                e.preventDefault()
                handleRefresh()
              }}
            >
              {isRefreshing ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Refreshing…
                </>
              ) : (
                "Refresh from provider"
              )}
            </DropdownMenuItem>
          )}
          {onAddEntry && <DropdownMenuItem onSelect={() => onAddEntry(log)}>Add entry</DropdownMenuItem>}
          <DropdownMenuItem onSelect={() => onEdit(log)}>Edit log</DropdownMenuItem>
          <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => onDelete(log)}>Delete log</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {errorToast && (
        <div
          role="alert"
          className="fixed bottom-4 right-4 z-50 rounded-lg border border-destructive/20 bg-card px-4 py-2.5 text-sm text-destructive shadow-lg flex items-center gap-2"
        >
          <span>{errorToast}</span>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setErrorToast(null)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </div>
      )}

      <AddToCollectionDialog
        log={log}
        open={collectionDialogOpen}
        onOpenChange={setCollectionDialogOpen}
      />
    </>
  )
}
