import { useState, useEffect } from "react"

import type { DialogName, Log } from "@/types/media"
import type { Media } from "@/types/media"

import { Button } from "@/components/ui/button"
import { MediaTypeCard } from "@/components/cards/MediaTypeGroupCard"
import { MediaCard } from "@/components/cards/MediaCard"

import { createMedia, deleteMedia, deleteWarningMedia, editMedia, fetchMedias } from "@/api/media"
import { MediaForm } from "@/forms/MediaForm"
import { ConfirmDeleteDialog } from "../dialogs/ConfirmDeleteDialog"
import EntityDialog from "../dialogs/EntityDialog"
import { LogForm } from "@/forms/LogForm"
import { createLog, editLog, fetchLogs } from "@/api/logs"

export default function MediasSection() {
  const [openDialog, setOpenDialog] = useState<DialogName>(null)
  const [medias, setMedias] = useState<Media[]>([])
  const [target, setTarget] = useState<Media | null>(null)
  const [targetLog, setTargetLog] = useState<Log | null>(null)

  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const [logs, setLogs] = useState<Log[]>([])

  useEffect(() => {
    const loadLogs = async () => {
      try {
        const data = await fetchLogs()
        setLogs(data)
      } catch (err: any) {
        console.error("Failed to fetch logs:", err)
      }
    }
    loadLogs()
  }, [])

  useEffect(() => {
    const loadMedias = async () => {
      try {
        const data = await fetchMedias()
        console.log("Fetched media types:", data)
        setMedias(data)
      } catch (error: any) {
        setErrorMessage(error.message)
      } finally {
        setLoading(false)
      }
    }

    loadMedias()
  }, [])
  // Group Medias by type
  const groupedMedias = medias.reduce((acc, media) => {
      const type = media.mediaType.name
  
      if (!acc[type]) acc[type] = [] //Create empty type array if type doesnt exist
      acc[type].push(media)
  
      return acc
    }, {} as Record<string, Media[]>) //<key,value> object


  // MEDIA
  const handleCreated = (newMedia: Media) => {
    setMedias(prev => [ ...prev, newMedia])
  }
  
  // Delete media
  const handleDeleteClick = (media: Media) => {
    setTarget(media)
    setOpenDialog("deleteConfirm")
  }
  const handleDeleted = (deletedMedia: Media) => {
    setMedias(prev => prev.filter(media => media !== deletedMedia))
  }

  // Edit type
  const handleEditClick = (media: Media) => {
    setTarget(media)
    setOpenDialog("editForm")
  }
  
  const handleEdited = (editedMedia: Media) => {
    setMedias(prev => prev.map((media) => media.id === editedMedia.id ? editedMedia : media))
  }

  // LOG
  const handleLogged = (newLog: Log) => {
    setLogs(prev => {
      const exists = prev.find(log => log.id === newLog.id)
      if (exists) {
        // update existing
        return prev.map(log => log.id === newLog.id ? newLog : log)
      }
      // add new
      return [...prev, newLog]
    })
  }
  const handleLogClick = async (media: Media) => {
    const existingLog = logs.find(l => l.media.id === media.id)

    setTarget(media)
    setTargetLog(existingLog ?? null)
    setOpenDialog("logForm")
  }

  // Media Form
  const renderMediaForm = (
      formData: Partial<Media>,
      setFormData: React.Dispatch<React.SetStateAction<Partial<Media>>> //state setter for formData
  ) => (
    <MediaForm formData={formData} setFormData={setFormData}/>
  )

  //Log form
  const renderLogForm = (
        formData: Partial<Log>,
        setFormData: React.Dispatch<React.SetStateAction<Partial<Log>>> //state setter for formData
    ) => (
      <LogForm formData={formData} setFormData={setFormData} targetMedia={target ?? undefined}/>
  )

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex justify-between p-4 items-center bg-stone-200">
        <div>
          <p className="text-lg font-semibold">Your Medias</p>
          <p className="text-sm text-gray-600">List of medias you have</p>
        </div>
        <Button size="default" variant="amber" onClick={() => setOpenDialog("createForm")}>
          + Add Media
        </Button>
      </div>

      {loading && <p className="text-gray-500 m-4">Loading medias...</p>}

      {/* Error message */}
      {errorMessage && (
          <p className="mt-2 text-center text-sm text-red-500">
              {errorMessage}
          </p>
      )}

      {/* Media list */}
      <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar">
        {!(medias.length > 0) && !loading && <p className=" text-gray-600 m-4">You have no medias. Create one!</p>}
        {!loading && (medias.length > 0) && (
          <ul className="space-y-2">
            {Object.entries(groupedMedias).map(([type, typeMedias]) => (
              <MediaTypeCard key={type} type={type}>
                {typeMedias.map((media) => (
                  <MediaCard
                    key={media.id}
                    media={media}
                    onEdit={handleEditClick}
                    onDelete={handleDeleteClick}
                    onLog={handleLogClick}
                  />
                ))}
              </MediaTypeCard>
            ))}
          </ul>
        )}
      </div>

      {/* Dialog */}
      <EntityDialog
        mode="create"
        open={openDialog === "createForm"}
        onOpenChange={(isOpen) => setOpenDialog(isOpen ? "createForm" : null)}
        onSubmit={createMedia}
        onSubmitted={handleCreated}
        renderForm={renderMediaForm}
      />

      <ConfirmDeleteDialog
        open={openDialog === "deleteConfirm"}
        onOpenChange={(isOpen) => setOpenDialog(isOpen ? "deleteConfirm" : null)}
        target={target}
        onWarning={deleteWarningMedia}
        onDelete={deleteMedia}
        onDeleted={handleDeleted}
      />

      <EntityDialog
        mode="edit"
        open={openDialog === "editForm"}
        onOpenChange={(isOpen) => setOpenDialog(isOpen ? "editForm" : null)} 
        target={target}
        onSubmit={editMedia}
        onSubmitted={handleEdited}
        renderForm={renderMediaForm}
      />

      <EntityDialog 
        mode={targetLog ? "edit" : "create"}
        open={openDialog === "logForm"}
        onOpenChange={(isOpen) => setOpenDialog(isOpen ? "logForm" : null)}
        target={targetLog ?? undefined}
        onSubmit={targetLog ? editLog : createLog}
        onSubmitted={handleLogged}
        renderForm={renderLogForm}
      />
    </div>
  )
}
