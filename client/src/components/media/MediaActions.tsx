import { useEffect, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { MoreHorizontal, Loader2 } from "lucide-react"
import type { Media } from "@/types/mainTypes"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { providerLinks } from "@/lib/providerLinks"
import { refreshMedia } from "@/api/media"
import { fetchLogsQueryOptions } from "@/queryOptions/fetchLogsQueryOptions"
import { fetchMediasQueryOptions } from "@/queryOptions/fetchMediasQueryOptions"

interface MediaActionsProps {
  media: Media
  logged: boolean
  /** Tiles have no inline "+ Log" button, so their menu offers "Log it" when not logged. */
  logInMenu?: boolean
  onEdit: (media: Media) => void
  onDelete: (media: Media) => void
  onLog: (media: Media) => void
}

export function MediaActions({ media, logged, logInMenu = false, onEdit, onDelete, onLog }: MediaActionsProps) {
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [errorToast, setErrorToast] = useState<string | null>(null)
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!errorToast) return
    const t = setTimeout(() => setErrorToast(null), 4000)
    return () => clearTimeout(t)
  }, [errorToast])

  const links = providerLinks(media)
  const isCustom = !media.provider

  const handleRefresh = async () => {
    if (isRefreshing) return
    setIsRefreshing(true)
    try {
      await refreshMedia(media.id)
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
          <Button variant="ghost" size="icon" className="size-9 text-muted-foreground" aria-label={"Actions for " + media.title}>
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
          {!logged && logInMenu && <DropdownMenuItem onSelect={() => onLog(media)}>Log it</DropdownMenuItem>}
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
          <DropdownMenuItem onSelect={() => onEdit(media)}>Edit media</DropdownMenuItem>
          {logged && <DropdownMenuItem onSelect={() => onLog(media)}>Edit log</DropdownMenuItem>}
          <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => onDelete(media)}>Delete media</DropdownMenuItem>
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
    </>
  )
}
