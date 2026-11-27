import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { formatLogDate } from "@/lib/logView"
import type { Letter } from "@/types/letters"

/** The reading view of an opened letter. */
export function LetterReader({ letter, onClose }: { letter: Letter; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display [overflow-wrap:anywhere]">{letter.media.title}</DialogTitle>
          <DialogDescription>Written {formatLogDate(letter.created_at)}</DialogDescription>
        </DialogHeader>
        <p className="whitespace-pre-wrap font-display text-base leading-[1.7] [overflow-wrap:anywhere]">{letter.body}</p>
      </DialogContent>
    </Dialog>
  )
}
