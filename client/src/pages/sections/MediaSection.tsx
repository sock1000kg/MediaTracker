import { useState } from "react"
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query"

import type { DialogName, Log } from "@/types/mainTypes"
import type { Media } from "@/types/mainTypes"

import { Button } from "@/components/ui/button"
import { MediaTypeCard } from "@/components/cards/MediaTypeGroupCard"
import { MediaCard } from "@/components/cards/MediaCard"

import { createMedia, deleteMedia, deleteWarningMedia, editMedia } from "@/api/media"
import { createLog, editLog } from "@/api/logs"
import { fetchLogsQueryOptions } from "@/queryOptions/fetchLogsQueryOptions"
import { fetchMediasQueryOptions } from "@/queryOptions/fetchMediasQueryOptions"

import { MediaForm } from "@/forms/MediaForm"
import { ConfirmDeleteDialog } from "../../components/dialogs/ConfirmDeleteDialog"
import EntityDialog from "../../components/dialogs/EntityDialog"
import { LogForm } from "@/forms/LogForm"

export default function MediasSection() {
  const queryClient = useQueryClient()

  const [openDialog, setOpenDialog] = useState<DialogName>(null)

  const [targetMediaMain, setTargetMediaMain] = useState<Media | null>(null)
  const [targetMediaForLog, setTargetMediaForLog] = useState<Media>()
  const [targetLog, setTargetLog] = useState<Log | null>(null)

  const [logsQuery, mediasQuery] = useQueries({
    queries:[
      fetchLogsQueryOptions(),
      fetchMediasQueryOptions()
    ]
  })

  const logs = logsQuery.data ?? []
  const medias = mediasQuery.data ?? []
  const pending = logsQuery.isPending || mediasQuery.isPending
  const errorMessage = logsQuery.error?.message || mediasQuery.error?.message || null

  // Group Medias by type
  const groupedMedias = medias.reduce((acc, media) => {
      const type = media.mediaType.name ?? "Unknown"
  
      if (!acc[type]) acc[type] = [] //Create empty type array if type doesnt exist
      acc[type].push(media)
  
      return acc
    }, {} as Record<string, Media[]>) //<key,value> object

  //MUTATIONS
  // MEDIA
  const createMediaMutation = useMutation({
    mutationFn: createMedia,
    onSuccess: () => {
      queryClient.refetchQueries({queryKey: fetchMediasQueryOptions().queryKey})
      queryClient.refetchQueries({queryKey: fetchLogsQueryOptions().queryKey})
    }
  })
  
  const deleteMediaMutation = useMutation({
    mutationFn: deleteMedia,
    onSuccess: () => {
      queryClient.refetchQueries({queryKey: fetchMediasQueryOptions().queryKey})
      queryClient.refetchQueries({queryKey: fetchLogsQueryOptions().queryKey})
    }
  })
  
  const editMediaMutation = useMutation({
    mutationFn: editMedia,
    onSuccess: () => {
      queryClient.refetchQueries({queryKey: fetchMediasQueryOptions().queryKey})
      queryClient.refetchQueries({queryKey: fetchLogsQueryOptions().queryKey})
    }
  })
  // LOG
  const createLogMutation = useMutation({
    mutationFn: createLog,
    onSuccess: () => queryClient.refetchQueries({ queryKey: fetchLogsQueryOptions().queryKey}),
  })
  
  const editLogMutation = useMutation({
    mutationFn: editLog,
    onSuccess: () => queryClient.refetchQueries({ queryKey: fetchLogsQueryOptions().queryKey}),
  })
  
  //HANDLERS
  // Edit type
  const handleEditClick = (media: Media) => {
    setTargetMediaMain(media)
    setOpenDialog("mediaForm")
  }

  const handleCreateClick = () => {
    setTargetMediaMain(null)
    setOpenDialog("mediaForm")
  }

  // Delete media
  const handleDeleteClick = (media: Media) => {
    setTargetMediaMain(media)
    setOpenDialog("deleteConfirm")
  }
  //Edit or create logs
  const handleLogClick = async (media: Media) => {
    const existingLog = logs.find(l => l.media.id === media.id)
    
    setTargetMediaForLog(media)
    setTargetLog(existingLog ?? null)
    setOpenDialog("logForm")
  }

  //FORMS
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
      <LogForm formData={formData} setFormData={setFormData} targetMedia={targetMediaForLog as Media}/>
  )

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex justify-between p-4 items-center bg-stone-200">
        <div>
          <p className="text-lg font-semibold">Your Medias</p>
          <p className="text-sm text-gray-600">List of medias you created</p>
        </div>
        <Button size="default" variant="amber" onClick={() => handleCreateClick()}>
          + Add Media
        </Button>
      </div>

      {pending && <p className="text-gray-500 m-4">Loading medias...</p>}

      {/* Error message */}
      {errorMessage && (
          <p className="mt-2 text-center text-sm text-red-500">
              {errorMessage}
          </p>
      )}

      {/* Media list */}
      <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar">
        {!(medias.length > 0) && !pending && <p className=" text-gray-600 m-4">You have no medias. Create one!</p>}
        {!pending && (medias.length > 0) && (
          <ul className="space-y-2">
            {Object.entries(groupedMedias).sort().map(([type, typeMedias]) => (
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

      <ConfirmDeleteDialog
        open={openDialog === "deleteConfirm"}
        onOpenChange={(isOpen) => setOpenDialog(isOpen ? "deleteConfirm" : null)}
        target={targetMediaMain}
        onWarning={deleteWarningMedia}
        onDelete={deleteMediaMutation.mutateAsync}
      />

      <EntityDialog
        mode={targetMediaMain ? "edit" : "create"}
        open={openDialog === "mediaForm"}
        onOpenChange={(isOpen) => setOpenDialog(isOpen ? "mediaForm" : null)} 
        target={targetMediaMain ?? undefined}
        onSubmit={targetMediaMain ? 
          (formData) => editMediaMutation.mutateAsync(formData) :
          (formData) => createMediaMutation.mutateAsync(formData)
        }
        renderForm={renderMediaForm}
      />

      <EntityDialog 
        mode={targetLog ? "edit" : "create"}
        open={openDialog === "logForm"}
        onOpenChange={(isOpen) => setOpenDialog(isOpen ? "logForm" : null)}
        target={targetLog ?? undefined}
        onSubmit={targetLog ? 
          (formData) => editLogMutation.mutateAsync(formData) : 
          (formData) => createLogMutation.mutateAsync(formData)}
        renderForm={renderLogForm}
      />
    </div>
  )
}
