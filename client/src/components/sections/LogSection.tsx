import { useEffect, useState } from "react"

import { deleteLog, editLog, fetchLogs } from "@/api/logs"

import { LogCard } from "@/components/cards/LogCard"
import { MediaTypeCard } from "@/components/cards/MediaTypeGroupCard"

import type { DialogName, Log } from "@/types/media"
import EntityDialog from "../dialogs/EntityDialog"
import { LogForm } from "@/forms/LogForm"
import { ConfirmDeleteDialog } from "../dialogs/ConfirmDeleteDialog"

export default function LogsSection() {
  const [openDialog, setOpenDialog] = useState<DialogName>(null)
  const [logs, setLogs] = useState<Log[]>([])
  const [targetLog, setTargetLog] = useState<Log | null>(null)

  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Group logs by media type
  // Go through each log and see if the array acc contains its type, ex: acc["book"]
  // Then add the log to the acc array according to type, ex: acc["book"][log1, log2]
  const groupedLogs = logs.reduce((acc, log) => {
    const type = log.media.mediaType.name

    if (!acc[type]) acc[type] = [] //Create empty type array if type doesnt exist
    acc[type].push(log)

    return acc
  }, {} as Record<string, Log[]>) //<key,value> object

  // Fetch logs on mount
  useEffect(() => {
    const loadLogs = async () => {
      try {
        const data = await fetchLogs()
        setLogs(data)
      } catch (error: any) {
          setErrorMessage(error.message)
      } finally {
        setLoading(false)
      }
    }

    loadLogs()
  }, [])

  const handleDeleteClick = (log: Log) => {
    setTargetLog(log)
    setOpenDialog("deleteConfirm")
  }
  const handleDeleted= (deletedLog: Log) => {
    setLogs(prev => prev.filter(log => log !== deletedLog))
  }

  const handleEditClick= (log: Log) => {
    setTargetLog(log)
    setOpenDialog("editForm")
  }
  const handleEditLog = (editedLog: Log) => {
    setLogs(prev => 
      prev.map(log => log.id === editedLog.id ? editedLog : log)
    )
  }
  //Log form
  const renderLogForm = (
    formData: Partial<Log>,
    setFormData: React.Dispatch<React.SetStateAction<Partial<Log>>> //state setter for formData
  ) => (
    <LogForm formData={formData} setFormData={setFormData} targetLog={targetLog ?? undefined} targetMedia={targetLog?.media ?? undefined}/>
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
        {loading && <p className="text-gray-500 m-4">Loading logs...</p>}
        {/* Error message */}
          {errorMessage && (
              <p className="mt-2 text-center text-sm text-red-500">
                  {errorMessage}
              </p>
          )}

        {!(logs.length > 0) && !loading && <p className=" text-gray-600 m-4">You have no logs. Create one!</p>}
        {!loading && (logs.length > 0) && (
          <ul className="space-y-2">
            {Object.entries(groupedLogs).map(([type, typeLogs]) => (
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
        open={openDialog === "editForm"}
        onOpenChange={(isOpen) => setOpenDialog(isOpen ? "editForm" : null)}
        target={targetLog}
        onSubmit={editLog}
        onSubmitted={handleEditLog}
        renderForm={renderLogForm}
      />

      <ConfirmDeleteDialog 
        open={openDialog === "deleteConfirm"}
        onOpenChange={(isOpen) => setOpenDialog(isOpen ? "deleteConfirm" : null)}
        target={targetLog}
        onDelete={deleteLog}
        onDeleted={handleDeleted}
      />
    </div>
  )
}
