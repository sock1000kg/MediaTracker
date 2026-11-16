import { useCallback, useState } from "react"
import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query"
import EntityDialog from "@/components/dialogs/EntityDialog"
import { MediaSearchLogForm } from "@/forms/MediaSearchLogForm"
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
    mutationFn: ({ media, logData, parent }: { media: T; logData: Partial<Log>; parent?: MediaResult }) =>
      createMediaAndLog(media, logData, parent),
    onSuccess: refresh,
  })

  const editMutation = useMutation({ mutationFn: editLog, onSuccess: refresh })

  /** Opens the dialog for `item`; `existing` overrides the log lookup, `parentItem` is the album/show it belongs to. */
  const openLog = (item: T, opts: { parent?: MediaResult; existing?: Log | null } = {}) => {
    setTarget(item)
    setParent(opts.parent)
    setTargetLog(opts.existing ?? findLogForResult(logs, item) ?? null)
    setOpen(true)
  }

  const handleSubmit = async (formData: Partial<Log>) => {
    if (targetLog) return editMutation.mutateAsync({ ...targetLog, ...formData })
    if (!target) throw new Error("Cannot create log: Target media data is missing.")
    return createMutation.mutateAsync({ media: target, logData: formData, parent })
  }

  const renderForm = useCallback(
    (formData: Partial<Log>, setFormData: React.Dispatch<React.SetStateAction<Partial<Log>>>) =>
      target ? <MediaSearchLogForm targetMedia={target} formData={formData} setFormData={setFormData} /> : null,
    [target]
  )

  const dialog = (
    <EntityDialog
      mode={targetLog ? "edit" : "create"}
      open={open}
      onOpenChange={setOpen}
      target={targetLog ?? undefined}
      onSubmit={handleSubmit}
      renderForm={renderForm}
    />
  )

  return { openLog, dialog }
}
