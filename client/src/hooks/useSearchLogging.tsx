import { useCallback, useMemo, useState } from "react"
import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query"
import EntityDialog from "@/components/dialogs/EntityDialog"
import { MediaSearchLogForm } from "@/forms/MediaSearchLogForm"
import { editLog } from "@/api/logs"
import { createMediaAndLog } from "@/api/media"
import { fetchLogsQueryOptions } from "@/queryOptions/fetchLogsQueryOptions"
import { fetchMediasQueryOptions } from "@/queryOptions/fetchMediasQueryOptions"
import { findLogForResult } from "@/lib/utils"
import { hasEntryContent, cleanEntry } from "@/lib/logStatus"
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
  const [startAdding, setStartAdding] = useState(false)

  const refresh = () => {
    queryClient.refetchQueries({ queryKey: fetchLogsQueryOptions().queryKey })
    queryClient.refetchQueries({ queryKey: fetchMediasQueryOptions().queryKey })
    queryClient.invalidateQueries({ queryKey: ["tags"] })
    for (const key of extraInvalidate) queryClient.invalidateQueries({ queryKey: key })
  }

  const createMutation = useMutation({
    mutationFn: ({ media, logData, parent }: { media: T; logData: Partial<Log>; parent?: MediaResult }) =>
      createMediaAndLog(media, logData, parent, hasEntryContent(logData.entry) ? cleanEntry(logData.entry) : null),
    onSuccess: refresh,
  })

  const editMutation = useMutation({ mutationFn: editLog, onSuccess: refresh })

  /**
   * Opens the dialog for `item`; `existing` overrides the log lookup, `parent` is the album/show it belongs to.
   * `addEntry` opens a logged item's dialog with the entry editor already open.
   */
  const openLog = (item: T, opts: { parent?: MediaResult; existing?: Log | null; addEntry?: boolean } = {}) => {
    setTarget(item)
    setParent(opts.parent)
    setTargetLog(opts.existing ?? findLogForResult(logs, item) ?? null)
    setStartAdding(Boolean(opts.addEntry))
    setOpen(true)
  }

  /** How many entries the user's log of `item` has (0 when it isn't logged). */
  const entryCountFor = (item: T): number => findLogForResult(logs, item)?.entryCount ?? 0

  const handleSubmit = async (formData: Partial<Log>) => {
    if (targetLog) return editMutation.mutateAsync({ ...targetLog, ...formData })
    if (!target) throw new Error("Cannot create log: Target media data is missing.")
    const { log } = await createMutation.mutateAsync({ media: target, logData: formData, parent })
    return log
  }

  // A book search names the edition it matched: it starts the first entry's edition
  const initialData = useMemo<Partial<Log>>(
    () => (target?.edition ? { entry: { edition: { ...target.edition } } } : {}),
    [target]
  )

  const renderForm = useCallback(
    (formData: Partial<Log>, setFormData: React.Dispatch<React.SetStateAction<Partial<Log>>>) =>
      target ? <MediaSearchLogForm targetMedia={target} formData={formData} setFormData={setFormData} startAdding={startAdding} /> : null,
    [target, startAdding]
  )

  const dialog = (
    <EntityDialog
      mode={targetLog ? "edit" : "create"}
      open={open}
      onOpenChange={setOpen}
      initialData={initialData}
      target={targetLog ?? undefined}
      onSubmit={handleSubmit}
      renderForm={renderForm}
    />
  )

  return { openLog, dialog, entryCountFor }
}
