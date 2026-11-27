import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { openLetter } from "@/api/letters"
import { invalidateLetters } from "@/queryOptions/letterQueryOptions"
import { logVerb } from "@/lib/letters"
import { formatLogDate } from "@/lib/logView"
import type { Letter } from "@/types/letters"
import { WaxSeal } from "./WaxSeal"
import { LetterReader } from "./LetterReader"

/** "You left yourself a letter", after logging something again. "Later" leaves it ready. */
export function RelogPrompt({ letter, onClose }: { letter: Letter; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [opened, setOpened] = useState<Letter | null>(null)
  const open = useMutation({
    mutationFn: () => openLetter(letter.id),
    onSuccess: (result) => {
      setOpened(result)
      invalidateLetters(queryClient)
    },
  })

  if (opened) return <LetterReader letter={opened} onClose={onClose} />

  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <WaxSeal size={34} />
            <DialogTitle className="font-display">You left yourself a letter</DialogTitle>
          </div>
          <DialogDescription>
            Sealed on {formatLogDate(letter.created_at)}, for the next time you {logVerb(letter.media.mediaType)} {letter.media.title}.
          </DialogDescription>
        </DialogHeader>
        {open.error && <p role="alert" className="text-sm text-destructive">{open.error.message}</p>}
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>Later</Button>
          <Button type="button" variant="amber" disabled={open.isPending} onClick={() => open.mutate()}>Open it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
