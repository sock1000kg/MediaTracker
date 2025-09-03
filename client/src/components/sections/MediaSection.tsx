import { useState, useEffect } from "react"

import type { DialogName } from "@/types/media"
import type { Media } from "@/types/media"

import { Button } from "@/components/ui/button"
import { MediaTypeCard } from "@/components/cards/MediaTypeGroupCard"
import { MediaCard } from "@/components/cards/MediaCard"

import { createMedia, deleteMedia, editMedia, fetchMedias } from "@/api/media"
import { CreateMediaForm } from "@/forms/MediaForm"
import { ConfirmDeleteDialog } from "../dialogs/ConfirmDeleteDialog"
import EntityDialog from "../dialogs/EntityDialog"

export default function MediasSection() {
  const [openDialog, setOpenDialog] = useState<DialogName>(null)
  const [medias, setMedias] = useState<Media[]>([])
  const [target, setTarget] = useState<Media | null>(null)

  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Group Medias by type
  const groupedMedias = medias.reduce((acc, media) => {
      const type = media.mediaType.name
  
      if (!acc[type]) acc[type] = [] //Create empty type array if type doesnt exist
      acc[type].push(media)
  
      return acc
    }, {} as Record<string, Media[]>) //<key,value> object

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


  // ACTIONS
  const handleCreated = (newMedia: Media) => {
      setMedias(prev => [ ...prev, newMedia])
  }
  
  // Delete media type
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

  // Media Form
  const renderMediaForm = (
      formData: Partial<Media>,
      setFormData: React.Dispatch<React.SetStateAction<Partial<Media>>> //state setter for formData
  ) => (
    <CreateMediaForm formData={formData} setFormData={setFormData}/>
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

      {loading && <p className="text-gray-500">Loading medias...</p>}

      {/* Error message */}
      {errorMessage && (
          <p className="mt-2 text-center text-sm text-red-500">
              {errorMessage}
          </p>
      )}

      {/* Media list */}
      <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar">
        {!(medias.length > 0) && !loading && <p className=" text-gray-600">You have no medias. Create one!</p>}
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
    </div>
  )
}
