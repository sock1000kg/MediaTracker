import { useState } from "react"
import { MoreHorizontal } from "lucide-react"
import type { Log } from "@/types/mainTypes"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { AddToCollectionDialog } from "@/components/collections/AddToCollectionDialog"

interface LogActionsProps {
  log: Log
  onEdit: (log: Log) => void
  onDelete: (log: Log) => void
  extraMenuItems?: React.ReactNode
}

export function LogActions({ log, onEdit, onDelete, extraMenuItems }: LogActionsProps) {
  const [collectionDialogOpen, setCollectionDialogOpen] = useState(false)

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-9 text-muted-foreground" aria-label={"Actions for " + log.media.title}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setCollectionDialogOpen(true)}>Add to collection…</DropdownMenuItem>
          {extraMenuItems}
          <DropdownMenuItem onSelect={() => onEdit(log)}>Edit log</DropdownMenuItem>
          <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => onDelete(log)}>Delete log</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AddToCollectionDialog
        log={log}
        open={collectionDialogOpen}
        onOpenChange={setCollectionDialogOpen}
      />
    </>
  )
}
