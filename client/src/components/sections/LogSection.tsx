import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { deleteLog, deleteWarningLog, editLog } from "@/api/logs"
import { fetchLogsQueryOptions } from "@/queryOptions/fetchLogsQueryOptions"

import { LogCard } from "@/components/cards/LogCard"
import { MediaTypeCard } from "@/components/cards/MediaTypeGroupCard"

import type { DialogName, Log } from "@/types/main"
import EntityDialog from "../dialogs/EntityDialog"
import { LogForm } from "@/forms/LogForm"
import { ConfirmDeleteDialog } from "../dialogs/ConfirmDeleteDialog"

export default function LogsSection() {
  const [openDialog, setOpenDialog] = useState<DialogName>(null)
  const [targetLog, setTargetLog] = useState<Log | null>(null)

  const queryClient = useQueryClient()
  // Fetch logs on mount
  const { data: logs = [], error, isPending } = useQuery(fetchLogsQueryOptions())
  const deleteMutation = useMutation({
    mutationFn: deleteLog,
    onSuccess: () => queryClient.refetchQueries(fetchLogsQueryOptions()),
  })

  const editMutation = useMutation({
    mutationFn: editLog,
    onSuccess: () => queryClient.refetchQueries(fetchLogsQueryOptions()),
  })

  // Group logs by media type
  // Go through each log and see if the array acc contains its type, ex: acc["book"]
  // Then add the log to the acc array according to type, ex: acc["book"][log1, log2]
  const groupedLogs = logs.reduce((acc, log) => {
    const type = log.media.mediaType.name

    if (!acc[type]) acc[type] = [] //Create empty type array if type doesnt exist
    acc[type].push(log)

    return acc
  }, {} as Record<string, Log[]>) //<key,value> object


  const handleDeleteClick = (log: Log) => {
    setTargetLog(log)
    setOpenDialog("deleteConfirm")
  }

  const handleEditClick= (log: Log) => {
    setTargetLog(log)
    setOpenDialog("logForm")
  }

  //Log form
  const renderLogForm = (
    formData: Partial<Log>,
    setFormData: React.Dispatch<React.SetStateAction<Partial<Log>>> //state setter for formData
  ) => (
    <LogForm formData={formData} setFormData={setFormData} targetMedia={targetLog?.media ?? undefined}/>
  )

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex justify-between p-4 items-center bg-stone-200">
        <div>
          <p className="text-lg font-semibold">Your Logs</p>
          <p className="text-sm text-gray-600">List of Logs you have created</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar">
        {isPending && <p className="text-gray-500 m-4">Loading logs...</p>}
        {/* Error message */}
          {error && (
              <p className="mt-2 text-center text-sm text-red-500">
                  {error.message}
              </p>
          )}

        {logs.length === 0 && !isPending && <p className=" text-gray-600 m-4">You have no logs. Search for a media and create one!</p>}
        {!isPending && (logs.length > 0) && (
          <ul className="space-y-2">
            {Object.entries(groupedLogs).sort().map(([type, typeLogs]) => (
              <MediaTypeCard key={type} type={type}>
                {typeLogs.map((log) => (
                  <LogCard 
                    key={log.id} 
                    log={log} 
                    onDelete={handleDeleteClick}
                    onEdit={handleEditClick}
                  />
                ))}
              </MediaTypeCard>
            ))}
          </ul>
        )}
      </div>

      {/* Dialog */}
      <EntityDialog
        mode="edit"
        open={openDialog === "logForm"}
        onOpenChange={(isOpen) => setOpenDialog(isOpen ? "logForm" : null)}
        target={targetLog}
        onSubmit={(formData) => editMutation.mutateAsync(formData)}
        renderForm={renderLogForm}
      />

      <ConfirmDeleteDialog 
        open={openDialog === "deleteConfirm"}
        onOpenChange={(isOpen) => setOpenDialog(isOpen ? "deleteConfirm" : null)}
        target={targetLog}
        onWarning={deleteWarningLog}
        onDelete={deleteMutation.mutateAsync}
      />
    </div>
  )
}
