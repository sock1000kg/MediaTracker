import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { MoreHorizontal, Search } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { deleteLetter, openLetter } from "@/api/letters"
import { invalidateLetters, letterSummaryQueryOptions, lettersQueryOptions } from "@/queryOptions/letterQueryOptions"
import { fetchLogsQueryOptions } from "@/queryOptions/fetchLogsQueryOptions"
import { summaryLine, whenLine } from "@/lib/letters"
import { filterLogsByQuery, formatLogDate } from "@/lib/logView"
import type { Letter } from "@/types/letters"
import type { Log } from "@/types/mainTypes"
import { WaxSeal } from "./WaxSeal"
import { LetterReader } from "./LetterReader"
import { WriteLetterDialog } from "./WriteLetterDialog"

/** Pick which log the new letter is about; the same title / creator search as adding logs to a collection. */
function LogPicker({ onPick, onCancel }: { onPick: (log: Log) => void; onCancel: () => void }) {
  const { data: logs = [], isLoading } = useQuery(fetchLogsQueryOptions())
  const [search, setSearch] = useState("")
  const found = filterLogsByQuery(logs, search)
  return (
    <div className="min-w-0 w-full space-y-2">
      <div className="relative w-full">
        <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" aria-hidden="true" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search logs by title or creator…" className="w-full pl-9" aria-label="Search logs" />
      </div>
      <ul className="w-full max-h-60 space-y-1 overflow-y-auto">
        {found.map((log) => (
          <li key={log.id} className="min-w-0 w-full">
            <button type="button" onClick={() => onPick(log)} className="w-full min-w-0 rounded-md p-2 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span className="block truncate text-sm font-medium">{log.media.title}</span>
              {log.media.creator && <span className="block truncate text-xs text-muted-foreground">{log.media.creator}</span>}
            </button>
          </li>
        ))}
      </ul>
      {found.length === 0 && (
        <p className="p-2 text-sm text-muted-foreground">
          {isLoading ? "Loading your logs…" : logs.length === 0 ? "You have no logs yet." : "No matching logs found."}
        </p>
      )}
      <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Back to letters</Button>
    </div>
  )
}

/** The list of sealed letters, all of them or one log's. Mounted only while open. */
export function LettersDialog({ logId, onClose }: { logId?: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const letters = useQuery(lettersQueryOptions())
  const summary = useQuery({ ...letterSummaryQueryOptions(), enabled: !logId })
  const [picking, setPicking] = useState(false)
  const [writeFor, setWriteFor] = useState<Log | null>(null)
  const [reading, setReading] = useState<Letter | null>(null)
  const [tearing, setTearing] = useState<Letter | null>(null)

  const open = useMutation({
    mutationFn: openLetter,
    onSuccess: (letter) => {
      setReading(letter)
      invalidateLetters(queryClient)
    },
  })
  const tear = useMutation({
    mutationFn: deleteLetter,
    onSuccess: () => invalidateLetters(queryClient),
  })

  const shown = (letters.data ?? []).filter((l) => !logId || l.logId === logId)
  const error = letters.error ?? open.error ?? tear.error

  const readyLetters = shown
    .filter((l) => l.state === "ready")
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  const openedLetters = shown
    .filter((l) => l.state === "opened")
    .sort((a, b) => new Date(b.openedAt ?? 0).getTime() - new Date(a.openedAt ?? 0).getTime())

  const sealedLetters = shown
    .filter((l) => l.state === "sealed")
    .sort((a, b) => {
      if (a.opensAt && b.opensAt) {
        return new Date(a.opensAt).getTime() - new Date(b.opensAt).getTime()
      }
      if (a.opensAt) return -1
      if (b.opensAt) return 1
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })

  const groups = [
    { key: "ready", title: "Ready to open", letters: readyLetters },
    { key: "opened", title: "Opened", letters: openedLetters },
    { key: "sealed", title: "Still sealed", letters: sealedLetters },
  ].filter((g) => g.letters.length > 0)

  return (
    <>
      <Dialog open onOpenChange={(next) => { if (!next) onClose() }}>
        <DialogContent className="max-h-[85dvh] content-start overflow-y-auto overflow-x-hidden [&>*]:min-w-0 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Letters</DialogTitle>
            <DialogDescription>
              {logId ? "The letters in this log." : summary.data ? summaryLine(summary.data) : "Letters to yourself, for later."}
            </DialogDescription>
          </DialogHeader>
          {error && <p role="alert" className="text-sm text-destructive">{error.message}</p>}

          {picking ? (
            <LogPicker onPick={(log) => { setPicking(false); setWriteFor(log) }} onCancel={() => setPicking(false)} />
          ) : (
            <>
              {!logId && (
                <Button type="button" size="sm" variant="outline" className="w-fit rounded-full" onClick={() => setPicking(true)}>
                  + Write one
                </Button>
              )}
              {letters.isPending ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : shown.length === 0 ? (
                <p className="text-sm text-muted-foreground">No letters yet.</p>
              ) : (
                <div className="space-y-4">
                  {groups.map((group) => (
                    <div key={group.key} className="space-y-1">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group.title}</h3>
                      <ul className="divide-y divide-border">
                        {group.letters.map((letter) => (
                          <li key={letter.id} className="flex items-center gap-3 py-3">
                            <WaxSeal size={26} tone={letter.state} />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold">{letter.media.title}</p>
                              <p className={`text-xs ${letter.state === "ready" ? "text-primary" : "text-muted-foreground"}`}>{whenLine(letter)}</p>
                              <p className="text-xs text-muted-foreground">Written {formatLogDate(letter.created_at)}</p>
                            </div>
                            {letter.state === "ready" && (
                              <Button type="button" size="sm" variant="amber" className="rounded-full" disabled={open.isPending} onClick={() => open.mutate(letter.id)}>
                                Open
                              </Button>
                            )}
                            {letter.state === "opened" && (
                              <Button type="button" size="sm" variant="outline" className="rounded-full" onClick={() => setReading(letter)}>
                                Read
                              </Button>
                            )}
                            <DropdownMenu modal={false}>
                              <DropdownMenuTrigger asChild>
                                <Button type="button" size="icon" variant="ghost" className="text-muted-foreground" aria-label={`Actions for the letter about ${letter.media.title}`}>
                                  <MoreHorizontal />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setTearing(letter)}>
                                  Tear it up
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {writeFor && <WriteLetterDialog log={writeFor} onClose={() => setWriteFor(null)} />}
      {reading && <LetterReader letter={reading} onClose={() => setReading(null)} />}

      <AlertDialog open={tearing !== null} onOpenChange={(next) => { if (!next) setTearing(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tear up this letter?</AlertDialogTitle>
            <AlertDialogDescription>It will be gone for good{tearing?.state === "opened" ? "" : ", unread"}.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (tearing) tear.mutate(tearing.id) }}>Tear it up</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
