import { useMemo, useState } from "react"
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query"

import type { DialogName, Log } from "@/types/mainTypes"
import type { Media, MediaMetadata } from "@/types/mainTypes"

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
import { AVAILABLE_SORT_FIELDS_MEDIAS, type SortCriterion, type SortField } from "@/types/sort"
import { useDataFilter } from "@/hooks/useDataFilter"
import { Layers, Search } from "lucide-react"
import { DataControls } from "@/components/ui/DataControls"

export default function MediasSection() {
  const queryClient = useQueryClient()

  const [openDialog, setOpenDialog] = useState<DialogName>(null)

  // GroupBy is purely visual
  const [groupBy, setGroupBy] = useState<"type" | "none">("type")

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

    //Helper function for the filters hook
    const getMediaSortValue = (media: Media, field: SortField) => {
      switch (field) {
          case "title": return media.title
          case "creator": return media.creator
          case "date": return new Date(media.created_at).getTime()
          case "pageCount": return Number((media.metadata as MediaMetadata)?.pageCount ?? 0)
          case "categories": {
              const cats = (media.metadata as MediaMetadata)?.categories
              return Array.isArray(cats) ? cats.join(", ") : String(cats || "")
          }
          default: return ""
      }
    }
  
    //Filters hook config
    const INITIAL_SORTS: SortCriterion[] = [
      { id: "date", field: "date", direction: "desc" }
    ]
    const SEARCH_FIELDS = ["title", "creator"]
    const FILTER_CONFIG = [
      { id: "type", field: (media: Media) => media.mediaType.name },
    ]
    
    // Filters Hook
    // We pass the raw data ('logs') into the hook.
    // The hook gives us back 'processedData' (already filtered/sorted) and all the handlers.
    const {
      processedData: processedMedias,
      searchQuery, setSearchQuery,
      activeSorts, addSort, removeSort, toggleSortDirection,
      activeFilters, toggleFilter,
      clearAll
    } = useDataFilter<Media>({
      data: medias,
      initialSorts: INITIAL_SORTS,
      searchFields: SEARCH_FIELDS,
      filterableFields: FILTER_CONFIG,
      getSortValue: getMediaSortValue
    })
  
    // Calculate options for the dropdowns (Type, Status)
    const uniqueMediaTypes = useMemo(() => 
      Array.from(new Set(medias.map((media) => media.mediaType.name))).sort(), 
    [medias])
  
    // Grouping Logic (Visual only)
    // We use 'processedMedias' here so grouping happens AFTER filters are applied
    const groupedMedias = useMemo(() => {
      if (groupBy === "none") return null
      return processedMedias.reduce((acc, media) => {
        const type = media.mediaType.name
        if (!acc[type]) acc[type] = []
        acc[type].push(media)
        return acc
      }, {} as Record<string, Media[]>)
    }, [processedMedias, groupBy])

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

        <div className="flex gap-4">
          <div>
            <Button size="default" variant="amber" onClick={() => handleCreateClick()}>
              + Add Media
            </Button>
          </div>

          {/* Controls Area */}
          <div className="flex flex-col items-end gap-3">
            <div className="flex flex-wrap gap-2 items-center">
                <DataControls
                    searchQuery={searchQuery}
                    setSearchQuery={setSearchQuery}
                    addSort={addSort}
                    activeSorts={activeSorts}
                    toggleSortDirection={toggleSortDirection}
                    removeSort={removeSort}
                    availableSorts={AVAILABLE_SORT_FIELDS_MEDIAS}
                    activeFilters={activeFilters}
                    toggleFilter={toggleFilter}
                    clearAll={clearAll}
                    filterOptions={[
                        { id: "type", label: "Type", values: uniqueMediaTypes, badgeColor: "stone" },
                    ]}
                    extraControls={
                      <div className="flex items-center border rounded-md h-9 overflow-hidden bg-white shadow-sm">
                          <Button
                            variant="ghost" size="sm"
                            className={`h-full rounded-none px-3 gap-2 font-normal ${groupBy === 'type' ? 'bg-stone-100 text-stone-900' : 'bg-white text-stone-500 hover:text-stone-900'}`}
                            onClick={() => setGroupBy('type')}
                          >
                            <Layers className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Grouped</span>
                          </Button>
                          <div className="w-[1px] h-4 bg-stone-200" />
                          <Button 
                            variant="ghost" size="sm" 
                            className={`h-full rounded-none px-3 font-normal ${groupBy === 'none' ? 'bg-stone-100 text-stone-900' : 'bg-white text-stone-500 hover:text-stone-900'}`}
                            onClick={() => setGroupBy('none')}
                          >
                            List
                          </Button>
                      </div>
                    }
                />
            </div>
          </div>
        </div>
      </div>

      {pending && <p className="text-gray-500 m-4 animate-pulse">Loading medias...</p>}

      {/* Error message */}
      {errorMessage && (
          <p className="mt-2 text-center text-sm text-red-500">
              {errorMessage}
          </p>
      )}

      {/* Media list */}
      <div className="flex-1 overflow-y-auto min-h-0 scrollbar-hide">
        {!(medias.length > 0) && !pending && 
          <p className=" text-gray-600 m-4">You have no medias. Create one!</p>
        }

        {!pending && medias.length > 0 && !(processedMedias.length > 0) && (
             <div className="flex flex-col items-center justify-center h-40 text-stone-500">
                 <Search className="h-8 w-8 mb-2 opacity-20"/>
                 <p>No medias match your filters.</p>
             </div>
        )}


        {!pending && (processedMedias.length > 0) && (
          <ul className="space-y-4 pb-10 pt-2">
            {groupBy === 'type' && groupedMedias && 
              Object.entries(groupedMedias).sort().map(([type, typeMedias]) => (
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

            {/* LIST VIEW */}
            {groupBy === 'none' && 
                processedMedias.map((media) => (
                  <div key={media.id} className="px-6">
                    <MediaCard
                      key={media.id}
                      media={media}
                      onEdit={handleEditClick}
                      onDelete={handleDeleteClick}
                      onLog={handleLogClick}
                    />
                  </div>
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
