import { MoreHorizontal } from "lucide-react"
import type { Log } from "@/types/mainTypes"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

interface LogActionsProps {
  log: Log
  onEdit: (log: Log) => void
  onDelete: (log: Log) => void
}

export function LogActions({ log, onEdit, onDelete }: LogActionsProps) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-9 text-muted-foreground" aria-label={"Actions for " + log.media.title}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onEdit(log)}>Edit log</DropdownMenuItem>
        <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => onDelete(log)}>Delete log</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
