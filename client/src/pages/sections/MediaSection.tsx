import { usePreferences } from "@/hooks/usePreferences"
import { sortPrefsToCriteria } from "@/lib/preferences"
import EmptyState from "@/components/EmptyState"
import { EMPTY_LINES, pickLoadingLine } from "@/lib/whimsy"
import { useEffect, useMemo, useRef, useState } from "react"
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query"

import type { DialogName, Log } from "@/types/mainTypes"
import type { Media, MediaMetadata } from "@/types/mainTypes"

import { Button } from "@/components/ui/button"
import { MediaRow } from "@/components/media/MediaRow"
import { MediaTile } from "@/components/media/MediaTile"
import { GroupHeading } from "@/components/media-view/GroupHeading"
import { ViewControls } from "@/components/media-view/ViewControls"
import { capitalise } from "@/lib/mediaView"
import { GroupFooter } from "@/components/media-view/GroupFooter"
import { useGroupReveal } from "@/hooks/useGroupReveal"
import { step } from "@/lib/logView"
import { readStoredString, writeStoredString } from "@/lib/utils"

import { createMedia, deleteMedia, deleteWarningMedia, editMedia } from "@/api/media"
import { createLog, editLog } from "@/api/logs"
import { fetchLogsQueryOptions } from "@/queryOptions/fetchLogsQueryOptions"
import { fetchMediasQueryOptions } from "@/queryOptions/fetchMediasQueryOptions"
import { fetchMediaTypesQueryOptions } from "@/queryOptions/fetchMediaTypesQueryOptions"
import { unionCI } from "@/lib/filterValues"

import { MediaForm } from "@/forms/MediaForm"
import { ConfirmDeleteDialog } from "../../components/dialogs/ConfirmDeleteDialog"
import EntityDialog from "../../components/dialogs/EntityDialog"
import { LogForm } from "@/forms/LogForm"
import { AVAILABLE_SORT_FIELDS_MEDIAS, type SortCriterion, type SortField } from "@/types/sort"
import { useDataFilter } from "@/hooks/useDataFilter"
import { DataControls } from "@/components/ui/DataControls"

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

const VIEWS = ["list", "grid"] as const
type MediaView = (typeof VIEWS)[number]
const GROUPS = ["type", "none"] as const
type MediaGroup = (typeof GROUPS)[number]

const INITIAL_SORTS: SortCriterion[] = [
  { id: "date", field: "date", direction: "desc" }
]
const SEARCH_FIELDS = ["title", "creator"]

export default function MediasSection() {
  const [loadingLine] = useState(() => pickLoadingLine())
  const queryClient = useQueryClient()

  const [openDialog, setOpenDialog] = useState<DialogName>(null)

  // View and grouping are purely visual, remembered per device
  const [view, setViewState] = useState<MediaView>(() => readStoredString("media.view", VIEWS, "list"))
  const [groupBy, setGroupByState] = useState<MediaGroup>(() => readStoredString("media.group", GROUPS, "type"))
  const setView = (v: MediaView) => { setViewState(v); writeStoredString("media.view", v) }
  const setGroupBy = (g: MediaGroup) => { setGroupByState(g); writeStoredString("media.group", g) }

  const [targetMediaMain, setTargetMediaMain] = useState<Media | null>(null)
  const [targetMediaForLog, setTargetMediaForLog] = useState<Media>()
  const [targetLog, setTargetLog] = useState<Log | null>(null)

  const [logsQuery, mediasQuery] = useQueries({
    queries:[
      fetchLogsQueryOptions(),
      fetchMediasQueryOptions()
    ]
  })

  // useMemo to avoid rerenders
  const logs = useMemo(
    () => logsQuery.data ?? [],
    [logsQuery.data]
  )
  const medias = useMemo(
    () => mediasQuery.data ?? [],
    [mediasQuery.data]
  )
  
  const pending = logsQuery.isPending || mediasQuery.isPending
  const errorMessage = logsQuery.error?.message || mediasQuery.error?.message || null

    // Logged state per media id (logs include shared media, medias are user-created)
    const logByMediaId = useMemo(() => new Map(logs.map(l => [l.media.id, l])), [logs])

    const filterConfig = useMemo(() => [
      { id: "type", field: (media: Media) => media.mediaType.name },
      { id: "logged", field: (media: Media) => logByMediaId.has(media.id) ? "Logged" : "Not logged" },
      { id: "status", field: (media: Media) => logByMediaId.get(media.id)?.status ?? "not logged" },
    ], [logByMediaId])

    // Filters Hook
    // We pass the raw data ('logs') into the hook.
    // The hook gives us back 'processedData' (already filtered/sorted) and all the handlers.
    const {
      processedData: processedMedias,
      searchQuery, setSearchQuery,
      activeSorts, addSort, replaceSorts, removeSort, toggleSortDirection,
      activeFilters, toggleFilter,
      clearAll
    } = useDataFilter<Media>({
      data: medias,
      initialSorts: INITIAL_SORTS,
      searchFields: SEARCH_FIELDS,
      filterableFields: filterConfig,
      getSortValue: getMediaSortValue
    })

    // Saved default sort: applied once when prefs load, unless the user already changed sorts
    const { prefs, isLoaded: prefsLoaded } = usePreferences()
    const sortsTouched = useRef(false)
    const defaultSortApplied = useRef(false)
    const markSorted = <A extends unknown[]>(fn: (...a: A) => void) => (...a: A) => {
      sortsTouched.current = true
      fn(...a)
    }
    useEffect(() => {
      if (!prefsLoaded || defaultSortApplied.current) return
      defaultSortApplied.current = true
      const criteria = sortPrefsToCriteria(prefs.defaultSort?.medias)
      if (criteria && !sortsTouched.current) replaceSorts(criteria)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [prefsLoaded, prefs.defaultSort?.medias])
  
    // Calculate options for the dropdowns (Type, Status)
    // Every available type (system + user), not only the ones that appear in the loaded media
    const { data: knownTypes = [] } = useQuery(fetchMediaTypesQueryOptions())
    const uniqueMediaTypes = useMemo(() =>
      unionCI(medias.map((media) => media.mediaType.name), knownTypes.map((t) => t.name)),
    [medias, knownTypes])
  
    const loggedValues = useMemo(() => {
      const present = new Set<string>(medias.map(m => logByMediaId.has(m.id) ? "Logged" : "Not logged"))
      return ["Logged", "Not logged"].filter(v => present.has(v))
    }, [medias, logByMediaId])

    const statusValues = useMemo(() =>
      Array.from(new Set(medias.map(m => logByMediaId.get(m.id)?.status ?? "not logged"))).sort(),
    [medias, logByMediaId])

    // Grouping Logic (Visual only)
    // We use 'processedMedias' here so grouping happens AFTER filters are applied
    const sections = useMemo(() => {
      if (groupBy === "none") return processedMedias.length ? [{ key: "all", label: null as string | null, items: processedMedias }] : []
      const map = new Map<string, Media[]>()
      for (const media of processedMedias) {
        const type = media.mediaType.name
        if (!map.has(type)) map.set(type, [])
        map.get(type)!.push(media)
      }
      return Array.from(map.entries())
        .sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: "base" }))
        .map(([type, items]) => ({ key: type, label: (capitalise(type) || "Other") as string | null, items }))
    }, [processedMedias, groupBy])

  // Per-group "Load more…": resets when filters, search or sorts change (and on view / group changes)
  const reveal = useGroupReveal(
    view, groupBy,
    JSON.stringify([searchQuery, activeSorts.map((s) => [s.field, s.direction]), activeFilters])
  )

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
      <div className="flex flex-col gap-4 px-6 pt-6 pb-4">
        <div>
          <h1 className="font-display text-4xl font-semibold">Your media</h1>
        </div>

        <div className="flex flex-col items-start gap-3 w-full">
        <DataControls
            leadingControls={
              <Button size="default" variant="amber" className="h-10 rounded-full" onClick={() => handleCreateClick()}>
                + Add Media
              </Button>
            }
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            addSort={markSorted(addSort)}
            activeSorts={activeSorts}
            toggleSortDirection={markSorted(toggleSortDirection)}
            removeSort={markSorted(removeSort)}
            availableSorts={AVAILABLE_SORT_FIELDS_MEDIAS}
            activeFilters={activeFilters}
            toggleFilter={toggleFilter}
            clearAll={clearAll}
            filterOptions={[
                { id: "type", label: "Type", values: uniqueMediaTypes, badgeColor: "stone" },
                { id: "logged", label: "Logged", values: loggedValues, badgeColor: "blue" },
                { id: "status", label: "Status", values: statusValues, badgeColor: "amber" },
            ]}
            extraControls={
              <ViewControls
                view={view}
                onView={setView}
                group={groupBy}
                onGroup={(g) => setGroupBy(g as MediaGroup)}
                groupAriaLabel="Group media"
                groupOptions={[{ value: "type", label: "Type" }, { value: "none", label: "None" }]}
              />
            }
        />
        </div>
      </div>

      {pending && <p className="text-muted-foreground m-4 animate-pulse">{loadingLine}</p>}

      {/* Error message */}
      {errorMessage && (
          <p className="mt-2 text-center text-sm text-destructive">
              {errorMessage}
          </p>
      )}

      {/* Media list */}
      <div className="flex-1 overflow-y-auto min-h-0 scrollbar-hide">
        {!(medias.length > 0) && !pending && 
          <EmptyState line={EMPTY_LINES.noMedias}>
            <p>Create one!</p>
          </EmptyState>
        }

        {!pending && medias.length > 0 && !(processedMedias.length > 0) && (
             <EmptyState line={EMPTY_LINES.noMatch}>
                 <p>No medias match your filters.</p>
             </EmptyState>
        )}


        {!pending && (processedMedias.length > 0) && (
          <div className="px-6 pb-10 pt-2">
            {sections.map((section) => {
              const { visible, remaining } = reveal.slice(section.key, section.items)
              return (
                <section key={section.key} className="mb-6">
                  <GroupHeading label={section.label} expanded={reveal.isExpanded(section.key)} onCollapse={() => reveal.collapse(section.key)} headingRef={reveal.headingRef(section.key)} />
                  {view === "list" ? (
                    <ul ref={reveal.listRef(section.key)} className="flex flex-col gap-3">
                      {visible.map((media) => (
                        <MediaRow key={media.id} media={media} log={logByMediaId.get(media.id)} onEdit={handleEditClick} onDelete={handleDeleteClick} onLog={handleLogClick} />
                      ))}
                    </ul>
                  ) : (
                    <ul ref={reveal.listRef(section.key)} className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-5 gap-y-7">
                      {visible.map((media) => (
                        <MediaTile key={media.id} media={media} log={logByMediaId.get(media.id)} onEdit={handleEditClick} onDelete={handleDeleteClick} onLog={handleLogClick} />
                      ))}
                    </ul>
                  )}
                  <GroupFooter
                    total={section.items.length} remaining={remaining} step={step(view, groupBy)}
                    expanded={reveal.isExpanded(section.key)} groupLabel={section.label}
                    onLoadMore={() => reveal.loadMore(section.key)}
                    onLoadAll={() => reveal.loadAll(section.key, section.items.length)}
                    onCollapse={() => reveal.collapse(section.key)}
                  />
                </section>
              )
            })}
          </div>
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
