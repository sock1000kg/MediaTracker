import { useState } from "react"
import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query"
import { LogJournalDialog, type JournalSave } from "@/components/logs/LogJournalDialog"
import { initialEntryOfResult, journalMediaOfResult } from "@/lib/journalDraft"
import { editLog } from "@/api/logs"
import { createMediaAndLog } from "@/api/media"
import { fetchLogsQueryOptions } from "@/queryOptions/fetchLogsQueryOptions"
import { fetchMediasQueryOptions } from "@/queryOptions/fetchMediasQueryOptions"
import { findLogForResult } from "@/lib/utils"
import type { Log } from "@/types/mainTypes"
import type { MediaResult } from "@/types/search"

/**
 * Logging from a search result: opens the log dialog for a result (editing its log when one exists),
 * then creates the media + log or saves the edit, and refreshes logs, media and tags.
 * `extraInvalidate` lists further query keys a page shows logged state from (e.g. album tracks).
 */
export function useSearchLogging<T extends MediaResult>(logs: Log[], extraInvalidate: QueryKey[] = []) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [target, setTarget] = useState<T>()
  const [parent, setParent] = useState<MediaResult>()
  const [targetLog, setTargetLog] = useState<Log | null>(null)

  const refresh = () => {
    queryClient.refetchQueries({ queryKey: fetchLogsQueryOptions().queryKey })
    queryClient.refetchQueries({ queryKey: fetchMediasQueryOptions().queryKey })
    queryClient.invalidateQueries({ queryKey: ["tags"] })
    for (const key of extraInvalidate) queryClient.invalidateQueries({ queryKey: key })
  }

  const createMutation = useMutation({
    mutationFn: ({ media, save, parent }: { media: T; save: JournalSave; parent?: MediaResult }) =>
      createMediaAndLog(media, save.log, parent, save.entry ?? null),
    onSuccess: refresh,
  })

  const editMutation = useMutation({
    mutationFn: ({ log, save }: { log: Log; save: JournalSave }) => editLog({ id: log.id, ...save.log }, save.entries),
    onSuccess: refresh,
  })

  /** Opens the dialog for `item`; `existing` overrides the log lookup, `parent` is the album/show it belongs to. */
  const openLog = (item: T, opts: { parent?: MediaResult; existing?: Log | null } = {}) => {
    setTarget(item)
    setParent(opts.parent)
    setTargetLog(opts.existing ?? findLogForResult(logs, item) ?? null)
    setOpen(true)
  }

  /** How many entries the user's log of `item` has (0 when it isn't logged). */
  const entryCountFor = (item: T): number => findLogForResult(logs, item)?.entryCount ?? 0

  const handleSubmit = async (save: JournalSave) => {
    if (targetLog) return editMutation.mutateAsync({ log: targetLog, save })
    if (!target) throw new Error("Cannot create log: Target media data is missing.")
    return createMutation.mutateAsync({ media: target, save, parent })
  }

  const dialog = target ? (
    <LogJournalDialog
      open={open}
      onOpenChange={setOpen}
      media={journalMediaOfResult(target, targetLog?.media.id)}
      log={targetLog}
      initialEntry={initialEntryOfResult(target)}
      onSave={handleSubmit}
    />
  ) : null

  return { openLog, dialog, entryCountFor }
}
