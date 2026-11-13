import { MoreHorizontal } from "lucide-react"
import type { Media } from "@/types/mainTypes"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

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
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-9 text-muted-foreground" aria-label={"Actions for " + media.title}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {!logged && logInMenu && <DropdownMenuItem onSelect={() => onLog(media)}>Log it</DropdownMenuItem>}
        <DropdownMenuItem onSelect={() => onEdit(media)}>Edit media</DropdownMenuItem>
        {logged && <DropdownMenuItem onSelect={() => onLog(media)}>Edit log</DropdownMenuItem>}
        <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => onDelete(media)}>Delete media</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
