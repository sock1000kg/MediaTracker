import { useCallback, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Layers, Search } from "lucide-react" // Import icons we still use

import { deleteLog, deleteWarningLog, editLog } from "@/api/logs"
import { fetchLogsQueryOptions } from "@/queryOptions/fetchLogsQueryOptions"
import { LogCard } from "@/components/cards/LogCard"
import { MediaTypeCard } from "@/components/cards/MediaTypeGroupCard"
import { Button } from "@/components/ui/button"
import EntityDialog from "@/components/dialogs/EntityDialog"
import { LogForm } from "@/forms/LogForm"
import { ConfirmDeleteDialog } from "@/components/dialogs/ConfirmDeleteDialog"

// --- NEW IMPORTS ---
import { DataControls } from "@/components/ui/DataControls" 
import { useDataFilter } from "@/hooks/useDataFilter"
import { AVAILABLE_SORT_FIELDS, type SortCriterion, type SortField } from "@/types/sort"
import type { DialogName, Log, MediaMetadata } from "@/types/mainTypes"

export default function LogsSection() {
  const [openDialog, setOpenDialog] = useState<DialogName>(null)
  const [targetLog, setTargetLog] = useState<Log | null>(null)
  
  // GroupBy is purely visual, so we keep this state here
  const [groupBy, setGroupBy] = useState<"type" | "none">("type")

  const queryClient = useQueryClient()
  
  // Fetch Data
  const { data: logs = [], error, isPending } = useQuery(fetchLogsQueryOptions())

  // Mutations
  const deleteMutation = useMutation({
    mutationFn: deleteLog,
    onSuccess: () => queryClient.refetchQueries({ queryKey: fetchLogsQueryOptions().queryKey }),
  })

  const editMutation = useMutation({
    mutationFn: editLog,
    onSuccess: () => queryClient.refetchQueries({ queryKey: fetchLogsQueryOptions().queryKey }),
  })

  //Helper function for the filters hook
  const getLogSortValue = (log: Log, field: SortField) => {
    switch (field) {
        case "title": return log.media.title
        case "creator": return log.media.creator
        case "rating": return log.rating ?? -1
        case "date": return new Date(log.logged_at).getTime()
        case "pageCount": return Number((log.media.metadata as MediaMetadata)?.pageCount ?? 0)
        case "categories": {
            const cats = (log.media.metadata as MediaMetadata)?.categories
            return Array.isArray(cats) ? cats.join(", ") : String(cats || "")
        }
        default: return ""
    }
  }

  //Filters hook config
  const INITIAL_SORTS: SortCriterion[] = [
    { id: "date", field: "date", direction: "desc" }
  ]
  const SEARCH_FIELDS = ["media.title", "media.creator"]
  const FILTER_CONFIG = [
    { id: "type", field: (log: Log) => log.media.mediaType.name },
    { id: "status", field: (log: Log) => log.status }
  ]
  
  // Filters Hook
  // We pass the raw data ('logs') into the hook.
  // The hook gives us back 'processedData' (already filtered/sorted) and all the handlers.
  const {
    processedData: processedLogs,
    searchQuery, setSearchQuery,
    activeSorts, addSort, removeSort, toggleSortDirection,
    activeFilters, toggleFilter,
    clearAll
  } = useDataFilter<Log>({
    data: logs,
    initialSorts: INITIAL_SORTS,
    searchFields: SEARCH_FIELDS,
    filterableFields: FILTER_CONFIG,
    getSortValue: getLogSortValue
  })

  // Calculate options for the dropdowns (Type, Status)
  const uniqueMediaTypes = useMemo(() => 
    Array.from(new Set(logs.map((l) => l.media.mediaType.name))).sort(), 
  [logs])

  const uniqueStatuses = useMemo(() => 
    Array.from(new Set(logs.map((l) => l.status))).filter(Boolean).sort(), 
  [logs])

  // Grouping Logic (Visual only)
  // We use 'processedLogs' here so grouping happens AFTER filters are applied
  const groupedLogs = useMemo(() => {
    if (groupBy === "none") return null
    return processedLogs.reduce((acc, log) => {
      const type = log.media.mediaType.name
      if (!acc[type]) acc[type] = []
      acc[type].push(log)
      return acc
    }, {} as Record<string, Log[]>)
  }, [processedLogs, groupBy])

  // --- Handlers (Dialogs) ---
  const handleDeleteClick = (log: Log) => {
    setTargetLog(log)
    setOpenDialog("deleteConfirm")
  }

  const handleEditClick = (log: Log) => {
    setTargetLog(log)
    setOpenDialog("logForm")
  }

  // --- Form Render ---
  const renderLogForm = useCallback((
    formData: Partial<Log>,
    setFormData: React.Dispatch<React.SetStateAction<Partial<Log>>>
  ) => {
    if (!targetLog) return null
    return <LogForm formData={formData} setFormData={setFormData} targetMedia={targetLog.media}/>
  }, [targetLog])

  return (
    <div className="flex flex-col h-full bg-stone-50/50">
      {/* Header & Controls */}
      <div className="w-full bg-stone-200 p-4 border-stone-300">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          
          {/* Title */}
          <div>
             <h1 className="text-lg font-semibold">Your Logs</h1>
             <p className="text-sm text-gray-600">Manage and organize your media history</p>
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
                    availableSorts={AVAILABLE_SORT_FIELDS}
                    activeFilters={activeFilters}
                    toggleFilter={toggleFilter}
                    clearAll={clearAll}
                    filterOptions={[
                        { id: "type", label: "Type", values: uniqueMediaTypes, badgeColor: "stone" },
                        { id: "status", label: "Status", values: uniqueStatuses, badgeColor: "amber" }
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

      {/* List Content */}
      <div className="flex-1 overflow-y-auto min-h-0 scrollbar-hide">
        {isPending && <p className="text-stone-500 m-4 animate-pulse">Loading logs...</p>}
        {error && <p className="mt-2 text-center text-sm m-4 text-red-500">{error.message}</p>}

        {!isPending && logs.length === 0 && (
            <p className="text-stone-600 m-4">You have no logs. Search for a media and create one!</p>
        )}

        {!isPending && logs.length > 0 && processedLogs.length === 0 && (
             <div className="flex flex-col items-center justify-center h-40 text-stone-500">
                 <Search className="h-8 w-8 mb-2 opacity-20"/>
                 <p>No logs match your filters.</p>
             </div>
        )}

        {!isPending && processedLogs.length > 0 && (
          <ul className="space-y-4 pb-10 pt-2">
            {/* GROUPED VIEW */}
            {groupBy === 'type' && groupedLogs && 
                Object.entries(groupedLogs).sort().map(([type, typeLogs]) => (
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

            {/* LIST VIEW */}
            {groupBy === 'none' && 
                processedLogs.map((log) => (
                  <div key={log.id} className="px-6">
                    <LogCard
                        log={log}
                        onDelete={handleDeleteClick}
                        onEdit={handleEditClick}
                    />
                  </div>
            ))}
          </ul>
        )}
      </div>

      {/* Dialogs */}
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