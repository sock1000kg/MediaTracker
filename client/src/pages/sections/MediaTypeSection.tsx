import EmptyState from "@/components/EmptyState"
import { EMPTY_LINES, pickLoadingLine } from "@/lib/whimsy"
import { useState } from "react"

import { Button } from "@/components/ui/button"

import { deleteMediaType, editMediaType, createMediaType, deleteWarningMediaType } from "@/api/mediaType"

import type { MediaType, DialogName } from "@/types/mainTypes"
import { ConfirmDeleteDialog } from "../../components/dialogs/ConfirmDeleteDialog"
import EntityDialog from "@/components/dialogs/EntityDialog"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { fetchMediaTypesQueryOptions } from "@/queryOptions/fetchMediaTypesQueryOptions"
import { fetchMediasQueryOptions } from "@/queryOptions/fetchMediasQueryOptions"
import { fetchLogsQueryOptions } from "@/queryOptions/fetchLogsQueryOptions"

export default function MediaTypesSection() {
  const [loadingLine] = useState(() => pickLoadingLine())
  const queryClient = useQueryClient()

  const [openDialog, setOpenDialog] = useState<DialogName>(null)
  const [target, setTarget] = useState<MediaType | null>(null)
  
  // Fetch for media types on load
  const  { data: mediaTypes = [], error, isPending } = useQuery(fetchMediaTypesQueryOptions())

  //Mutations
  const createMutation = useMutation({
    mutationFn: createMediaType,
    onSuccess: () => { 
      queryClient.refetchQueries({queryKey: fetchMediaTypesQueryOptions().queryKey})
    }
  })

  const deleteMutation = useMutation({
    mutationFn: deleteMediaType,
    onSuccess: () => { 
      queryClient.refetchQueries({queryKey: fetchLogsQueryOptions().queryKey})
      queryClient.refetchQueries({queryKey: fetchMediaTypesQueryOptions().queryKey})
      queryClient.refetchQueries({queryKey: fetchMediasQueryOptions().queryKey})
    }
  })

  const editMutation = useMutation({
    mutationFn: ({name, newMediaType} : {name: string, newMediaType: Partial<MediaType>}) => editMediaType(name, newMediaType),
    onSuccess: () => { 
      queryClient.refetchQueries({queryKey: fetchLogsQueryOptions().queryKey})
      queryClient.refetchQueries({queryKey: fetchMediaTypesQueryOptions().queryKey})
      queryClient.refetchQueries({queryKey: fetchMediasQueryOptions().queryKey})
    }
  })

  
  // Handlers
  const handleDeleteClick = (mediaType: MediaType) => {
    setTarget(mediaType)
    setOpenDialog("deleteConfirm")
  }

  const handleEditClick = (mediaType: MediaType) => {
    setTarget(mediaType)
    setOpenDialog("mediaTypeForm")
  }
  
  const handleCreateClick = () => {
    setTarget(null)
    setOpenDialog("mediaTypeForm")
  }
  
  // Forms
  // Define fields for the edit forms
  const renderEditField = (
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
          className="mt-1 block w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:ring-2 focus:outline-none "
          placeholder="Media type name (e.g. Book, Movie, Game)"
        />
      </label>
    </div>
  )
    
  // MEDIA TYPE TAB RENDERING
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex justify-between px-6 pt-6 pb-4 items-end gap-4">
        <div>
          <h1 className="font-display text-4xl font-semibold">Media types</h1>
        </div>
        <Button size="default" variant="amber" onClick={() => handleCreateClick()}>
          + Add Media Type
        </Button>
      </div>

      {isPending && <p className="text-muted-foreground m-4 animate-pulse">{loadingLine}</p>}

      {/* Error message */}
      {error && (
          <p className="mt-2 text-center text-sm text-destructive">
              {error.message}
          </p>
      )}

      {/* Media Type list */}
      <div className="flex-1 overflow-y-auto min-h-0 scrollbar-hide">
        {!(mediaTypes.length > 0) && !isPending && <EmptyState line={EMPTY_LINES.noTypes}><p>You have no media types. Create one!</p></EmptyState>}
        {!isPending && (
          <ul className="space-y-2">
            {mediaTypes
              .slice() //copy so we dont mess with cache
              .sort((a,b) => a.name.localeCompare(b.name)) // alphabetical sort
              .map((mediaType) => (
              <li key={mediaType.id} className="p-3 rounded-xl border border-border bg-card shadow-paper transition-colors hover:border-border-strong m-4 capitalize">
                <div className="flex justify-between items-center">
                  {/* Left side info */}
                  <div className="flex-col items-center gap-1">
                    <p className="font-bold text-foreground">{mediaType.name}</p>
                    {mediaType.userId == 0 && <p className="text-xs">(system)</p>}
                  </div>

                  {/* Right side info */}
                  <div className="flex items-center gap-4">
                    {/* Creation date display */}
                    <span className="text-xs rounded-2xl px-2 py-0.5 bg-tag text-tag-foreground tabular-nums">
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
            onWarning={deleteWarningMediaType}
            onDelete={deleteMutation.mutateAsync}
          />

          <EntityDialog
            mode={target ? "edit" : "create"}
            open={openDialog === "mediaTypeForm"}
            onOpenChange={(isOpen) => setOpenDialog(isOpen ? "mediaTypeForm" : null)}
            target={target ?? undefined}
            onSubmit={target ? 
              (formData) => editMutation.mutateAsync({ name: target.name, newMediaType: formData }) : 
              (formData) => createMutation.mutateAsync(formData)}
            renderForm={renderEditField}
          />
    </div>

  )
}
