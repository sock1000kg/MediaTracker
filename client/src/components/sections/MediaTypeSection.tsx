import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"

import { fetchMediaTypes, deleteMediaType, editMediaType, createMediaType } from "@/api/mediaType"

import type { MediaType, DialogName } from "@/types/media"
import { ConfirmDeleteDialog } from "../dialogs/ConfirmDeleteDialog"
import EntityDialog from "@/components/dialogs/EntityDialog"

export default function MediaTypesSection() {
  const [openDialog, setOpenDialog] = useState<DialogName>(null)
  const [mediaTypes, setMediaTypes] = useState<MediaType[]>([])
  const [target, setTarget] = useState<MediaType | null>(null)


  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Fetch for media types on load
  useEffect(() => {
    const loadMediaTypes = async () => {
      try {
        const data = await fetchMediaTypes()
        console.log("Fetched media types:", data)
        setMediaTypes(data)
      } catch (error: any) {
        setErrorMessage(error.message)
      } finally {
        setLoading(false)
      }
    }

    loadMediaTypes()
  }, [])

  // CRUD ACTIONS
  // Create new type
  const handleCreated = (newType: MediaType) => {
    setMediaTypes(prev => [ ...prev, newType])
  }
  const renderCreateField = (
    formData: Partial<MediaType>,
    setFormData: React.Dispatch<React.SetStateAction<Partial<MediaType>>> //state setter for formData
  ) => (
    <div className="space-y-4">
      <label className="block">
        <span className="text-sm">Name</span>
        <input
          type="text"
          value={formData.name ?? ""}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, name: e.target.value }))
          }
          className="mt-1 block w-full rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm focus:ring-2 focus:outline-none "
          placeholder="Media type name (e.g. Book, Movie, Game)"
        />
      </label>
    </div>
  )

  // Delete media type
  const handleDeleteClick = (mediaType: MediaType) => {
    setTarget(mediaType)
    setOpenDialog("deleteConfirm")
  }
  const handleDeleted = (deletedType: MediaType) => {
    setMediaTypes(prev => prev.filter((mediaType) => mediaType.name !== deletedType.name))
  }

  // Edit type
  const handleEditClick = (mediaType: MediaType) => {
    setTarget(mediaType)
    setOpenDialog("editForm")
  }
  const handleEdited = (editedType: MediaType) => {
    setMediaTypes(prev => prev.map((mediaType) => mediaType.id === editedType.id ? editedType : mediaType))
  }
  // Define fields for the edit forms
  const renderEditField = (
    formData: Partial<MediaType>,
    setFormData: React.Dispatch<React.SetStateAction<Partial<MediaType>>> //state setter for formData
  ) => (
    <div className="space-y-4">
      <label className="block">
        <span className="text-sm">Name (ID: {formData.id})</span>
        <input
          type="text"
          value={formData.name ?? ""}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, name: e.target.value }))
          }
          className="mt-1 block w-full rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm focus:ring-2 focus:outline-none "
        />
      </label>
    </div>
  )
    
  // MEDIA TYPE TAB RENDERING
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex justify-between p-4 items-center bg-stone-200">
        <div>
          <p className="text-lg font-semibold">Your Media Types</p>
          <p className="text-sm text-gray-600">List of categories you have created</p>
        </div>
        <Button size="default" variant="amber" onClick={() => setOpenDialog("createForm")}>
          + Add Media Type
        </Button>
      </div>

      {loading && <p className="text-gray-500 m-4">Loading media types...</p>}

      {/* Error message */}
      {errorMessage && (
          <p className="mt-2 text-center text-sm text-red-500">
              {errorMessage}
          </p>
      )}

      {/* Media Type list */}
      <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar">
        {!(mediaTypes.length > 0) && !loading && <p className=" text-gray-600 m-4">You have no media types. Create one!</p>}
        {!loading && (
          <ul className="space-y-2">
            {mediaTypes.map((mediaType) => (
              <li key={mediaType.id} className="p-3 bg-white rounded-xl shadow-sm border border-stone-200 m-4 capitalize">
                <div className="flex justify-between items-center">
                  {/* Left side info */}
                  <div className="flex-col items-center gap-1">
                    <p className="font-bold text-stone-800">{mediaType.name}</p>
                    {mediaType.userId == 0 && <p className="text-xs">(system)</p>}
                  </div>

                  {/* Right side info */}
                  <div className="flex items-center gap-4">
                    {/* Creation date display */}
                    <span className="text-xs rounded-2xl px-2 py-0.5 bg-amber-100 text-amber-800">
                      {new Date(mediaType.created_at).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                      
                    {/* Edit button */}
                    <Button
                      size="sm" 
                      variant="amber"
                      onClick={() => handleEditClick(mediaType)}
                    >
                      Edit
                    </Button>

                    {/* Delete Button */}
                    <Button 
                      size="sm" 
                      variant="destructive"
                      onClick={() => handleDeleteClick(mediaType)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Dialog */}
          <ConfirmDeleteDialog 
            open={openDialog === "deleteConfirm"} 
            onOpenChange={(isOpen) => setOpenDialog(isOpen ? "deleteConfirm" : null)}
            target={target}
            description={`Are you sure you want to delete '${target}'?`}
            onDelete={deleteMediaType}
            onDeleted={handleDeleted}
          />

          <EntityDialog
            mode="edit"
            open={openDialog === "editForm"}
            onOpenChange={(isOpen) => setOpenDialog(isOpen ? "editForm" : null)}
            target={target}
            onSubmit={(updatedData, target) => {
              if (!target) throw new Error("No target to edit")
              return editMediaType(target.name, {...target, ...updatedData})
            }}
            onSubmitted={handleEdited}
            renderForm={renderEditField}
          />
          <EntityDialog
            mode="create"
            open={openDialog === "createForm"}
            onOpenChange={(isOpen) => setOpenDialog(isOpen ? "createForm" : null)}
            onSubmit={createMediaType}
            onSubmitted={handleCreated}
            renderForm={renderCreateField}
          />
    </div>

  )
}
