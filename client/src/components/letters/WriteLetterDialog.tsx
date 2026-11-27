import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { createLetter } from "@/api/letters"
import { invalidateLetters } from "@/queryOptions/letterQueryOptions"
import { localDay } from "@/lib/letters"
import { useLimits } from "@/hooks/useLimits"
import { cn } from "@/lib/utils"

interface WriteLetterDialogProps {
  log: { id: string; media: { title: string } }
  onClose: () => void
}

const QUICK_DATES = [{ label: "In 1 year", years: 1 }, { label: "In 5 years", years: 5 }]

/** Mounted only while open. Saves on its own, apart from any other dialog's Save. */
export function WriteLetterDialog({ log, onClose }: WriteLetterDialogProps) {
  const limits = useLimits()
  const queryClient = useQueryClient()
  const [body, setBody] = useState("")
  const [mode, setMode] = useState<"date" | "relog">("date")
  const [date, setDate] = useState("")
  const today = localDay()
  const tomorrow = localDay(new Date(), { days: 1 })

  const seal = useMutation({
    mutationFn: () => createLetter({
      logId: log.id,
      body: body.trim(),
      ...(mode === "date" ? { opensAt: date, today } : { opensOnRelog: true }),
    }),
    onSuccess: () => {
      invalidateLetters(queryClient)
      onClose()
    },
  })

  const dateTooSoon = mode === "date" && date !== "" && date < tomorrow
  const ready = body.trim() !== "" && (mode === "relog" || (date !== "" && !dateTooSoon))

  return (
    <Dialog open onOpenChange={(next) => { if (!next && !seal.isPending) onClose() }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">A letter to later</DialogTitle>
          <DialogDescription className="[overflow-wrap:anywhere]">About {log.media.title}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (ready && !seal.isPending) seal.mutate()
          }}
        >
          <div>
            <Textarea
              aria-label="Your letter"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={limits.letters.bodyMaxLength}
              rows={7}
              placeholder="Dear future me…"
              className="max-h-64 font-display [overflow-wrap:anywhere]"
            />
            <p className="mt-1 text-right text-xs text-muted-foreground">{body.length}/{limits.letters.bodyMaxLength}</p>
          </div>

          <fieldset className="space-y-3">
            <legend className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Opens</legend>
            <div className="flex w-fit flex-wrap rounded-full bg-secondary p-1">
              {([["date", "On a date"], ["relog", "When I log this again"]] as const).map(([value, label]) => (
                <label
                  key={value}
                  className={cn(
                    "cursor-pointer rounded-full px-3 py-1 text-xs font-medium has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                    mode === value ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <input type="radio" name="letter-opens" className="sr-only" checked={mode === value} onChange={() => setMode(value)} />
                  {label}
                </label>
              ))}
            </div>
            {mode === "date" && (
              <div className="flex flex-wrap items-center gap-2">
                <Input type="date" aria-label="Opening date" value={date} min={tomorrow} onChange={(e) => setDate(e.target.value)} className="w-auto" />
                {QUICK_DATES.map((q) => (
                  <Button key={q.label} type="button" size="sm" variant="outline" className="rounded-full" onClick={() => setDate(localDay(new Date(), { years: q.years }))}>
                    {q.label}
                  </Button>
                ))}
              </div>
            )}
            {dateTooSoon && <p role="alert" className="text-xs text-destructive">Pick tomorrow or later</p>}
          </fieldset>

          <p className="text-sm text-muted-foreground">Once sealed, it can't be read or changed until then.</p>
          {seal.error && <p role="alert" className="text-sm text-destructive">{seal.error.message}</p>}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={seal.isPending}>Cancel</Button>
            <Button type="submit" variant="amber" disabled={!ready || seal.isPending}>
              {seal.isPending ? "Sealing…" : "Seal it"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
