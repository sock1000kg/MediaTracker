import { usePreferences } from "@/hooks/usePreferences"
import { sortPrefsToCriteria } from "@/lib/preferences"
import EmptyState from "@/components/EmptyState"
import { EMPTY_LINES, pickLoadingLine } from "@/lib/whimsy"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { deleteLog, deleteWarningLog, editLog } from "@/api/logs"
import { fetchLogsQueryOptions } from "@/queryOptions/fetchLogsQueryOptions"
import { fetchMediaTypesQueryOptions } from "@/queryOptions/fetchMediaTypesQueryOptions"
import { unionCI } from "@/lib/filterValues"
import { PageBackdrop } from "@/components/media-view/PageBackdrop"
import { GroupHeading } from "@/components/media-view/GroupHeading"
import { ViewControls } from "@/components/media-view/ViewControls"
import { LogRow } from "@/components/logs/LogRow"
import { LogTile } from "@/components/logs/LogTile"
import { groupLogs, type GroupMode } from "@/lib/logView"
import { GroupFooter } from "@/components/media-view/GroupFooter"
import { useGroupReveal } from "@/hooks/useGroupReveal"
import { step } from "@/lib/logView"
import EntityDialog from "@/components/dialogs/EntityDialog"
import { LogForm } from "@/forms/LogForm"
import { ConfirmDeleteDialog } from "@/components/dialogs/ConfirmDeleteDialog"

// --- NEW IMPORTS ---
import { DataControls } from "@/components/ui/DataControls" 
import { useDataFilter } from "@/hooks/useDataFilter"
import { AVAILABLE_SORT_FIELDS_LOGS, type SortCriterion, type SortField } from "@/types/sort"
import type { DialogName, Log, MediaMetadata } from "@/types/mainTypes"
import { RATING_BUCKETS, getCategories, ratingBucket, readStoredString, sourceLabel, writeStoredString } from "@/lib/utils"

const VIEWS = ["list", "grid"] as const
type LogView = (typeof VIEWS)[number]
const GROUPS = ["month", "type", "none"] as const

//Helper function for the filters hook
const getLogSortValue = (log: Log, field: SortField) => {
  switch (field) {
      case "title": return log.media.title
      case "creator": return log.media.creator
      case "rating": return log.rating ?? null // missing ratings sort last in both directions
      case "date": return new Date(log.logged_at).getTime()
      case "pageCount": return Number((log.media.metadata as MediaMetadata)?.pageCount ?? 0)
      case "categories": {
          const cats = (log.media.metadata as MediaMetadata)?.categories
          return Array.isArray(cats) ? cats.join(", ") : String(cats || "")
      }
      default: return ""
  }
}

//Filters hook config (module-level so references are stable)
const INITIAL_SORTS: SortCriterion[] = [
  { id: "date", field: "date", direction: "desc" }
]
const SEARCH_FIELDS = ["media.title", "media.creator"]

export default function LogsSection() {
  const [loadingLine] = useState(() => pickLoadingLine())
  const [openDialog, setOpenDialog] = useState<DialogName>(null)
  const [targetLog, setTargetLog] = useState<Log | null>(null)
  
  // View and grouping are purely visual, remembered per device
  const [view, setViewState] = useState<LogView>(() => readStoredString("logs.view", VIEWS, "list"))
  const [groupBy, setGroupByState] = useState<GroupMode>(() => readStoredString("logs.group", GROUPS, "month"))
  const setView = (v: LogView) => { setViewState(v); writeStoredString("logs.view", v) }
  const setGroupBy = (g: GroupMode) => { setGroupByState(g); writeStoredString("logs.group", g) }

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

  // Case-insensitive unique categories, first spelling seen wins
  const uniqueCategories = useMemo(() => {
    const seen = new Map<string, string>()
    logs.forEach(l => getCategories(l.media.metadata).forEach(c => {
      const key = c.toLowerCase()
      if (!seen.has(key)) seen.set(key, c)
    }))
    return Array.from(seen.values()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
  }, [logs])

  // Filter config depends on the canonical category spellings, so memoize it
  // (the hook's useMemo would otherwise recompute on every render)
  const filterConfig = useMemo(() => {
    const canonical = new Map(uniqueCategories.map(c => [c.toLowerCase(), c]))
    return [
      { id: "type", field: (log: Log) => log.media.mediaType.name },
      { id: "status", field: (log: Log) => log.status },
      { id: "category", field: (log: Log) => getCategories(log.media.metadata).map(c => canonical.get(c.toLowerCase()) ?? c) },
      { id: "source", field: (log: Log) => sourceLabel(log.media.source) },
      { id: "rating", field: (log: Log) => ratingBucket(log.rating) },
    ]
  }, [uniqueCategories])

  // Filters Hook
  // We pass the raw data ('logs') into the hook.
  // The hook gives us back 'processedData' (already filtered/sorted) and all the handlers.
  const {
    processedData: processedLogs,
    searchQuery, setSearchQuery,
    activeSorts, addSort, replaceSorts, removeSort, toggleSortDirection,
    activeFilters, toggleFilter,
    clearAll
  } = useDataFilter<Log>({
    data: logs,
    initialSorts: INITIAL_SORTS,
    searchFields: SEARCH_FIELDS,
    filterableFields: filterConfig,
    getSortValue: getLogSortValue
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
    const criteria = sortPrefsToCriteria(prefs.defaultSort?.logs)
    if (criteria && !sortsTouched.current) replaceSorts(criteria)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefsLoaded, prefs.defaultSort?.logs])

  // Calculate options for the dropdowns (Type, Status)
  // Every available type (system + user), not only the ones that appear in the loaded logs. If the query is
  // loading or fails (e.g. a 404 for an empty list), `knownTypes` is [] and only the types in the data show.
  const { data: knownTypes = [] } = useQuery(fetchMediaTypesQueryOptions())
  const uniqueMediaTypes = useMemo(() =>
    unionCI(logs.map((l) => l.media.mediaType.name), knownTypes.map((t) => t.name)),
  [logs, knownTypes])

  const uniqueStatuses = useMemo(() => 
    Array.from(new Set(logs.map((l) => l.status))).filter(Boolean).sort(), 
  [logs])

  const uniqueSources = useMemo(() =>
    Array.from(new Set(logs.map(l => sourceLabel(l.media.source)))).sort(),
  [logs])

  const presentRatings = useMemo(() => {
    const present = new Set(logs.map(l => ratingBucket(l.rating)))
    return RATING_BUCKETS.filter(b => present.has(b))
  }, [logs])

  // Grouping happens AFTER filters/sorts, so group order follows the sorted list
  const groups = useMemo(() => groupLogs(processedLogs, groupBy), [processedLogs, groupBy])

  // Per-group "Load more…": resets when filters, search or sorts change (and on view / group changes)
  const reveal = useGroupReveal(
    view, groupBy,
    JSON.stringify([searchQuery, activeSorts.map((s) => [s.field, s.direction]), activeFilters])
  )

  // --- Handlers (Dialogs) ---
  const handleDeleteClick = (log: Log) => {
    setTargetLog(log)
    setOpenDialog("deleteConfirm")
  }

  const handleEditClick = (log: Log) => {
    setTargetLog(log)
    setOpenDialog("logForm")
  }

  const logsThisYear = useMemo(() => {
    const year = new Date().getFullYear()
    return logs.filter((l) => new Date(l.logged_at).getFullYear() === year).length
  }, [logs])

  // --- Form Render ---
  const renderLogForm = useCallback((
    formData: Partial<Log>,
    setFormData: React.Dispatch<React.SetStateAction<Partial<Log>>>
  ) => {
    if (!targetLog) return null
    return <LogForm formData={formData} setFormData={setFormData} targetMedia={targetLog.media}/>
  }, [targetLog])

  return (
    <div className="relative isolate flex flex-col h-full overflow-hidden">
      <PageBackdrop page="logs" />
      {/* Header & Controls */}
      <div className="relative w-full px-6 pt-6 pb-4">
        <div className="flex flex-col gap-4">
          
          {/* Title */}
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
             <h1 className="font-display text-4xl font-semibold">Your logs</h1>
             {logs.length > 0 && (
               <p className="text-sm text-muted-foreground">
                 {logs.length} {logs.length === 1 ? "log" : "logs"} · {logsThisYear} this year
               </p>
             )}
          </div>

          {/* Controls Area */}
          <div className="flex flex-col items-start gap-3">
            <div className="flex flex-wrap gap-2 items-center">
                <DataControls 
                    searchQuery={searchQuery}
                    setSearchQuery={setSearchQuery}
                    addSort={markSorted(addSort)}
                    activeSorts={activeSorts}
                    toggleSortDirection={markSorted(toggleSortDirection)}
                    removeSort={markSorted(removeSort)}
                    availableSorts={AVAILABLE_SORT_FIELDS_LOGS}
                    activeFilters={activeFilters}
                    toggleFilter={toggleFilter}
                    clearAll={clearAll}
                    filterOptions={[
                        { id: "type", label: "Type", values: uniqueMediaTypes, badgeColor: "stone" },
                        { id: "status", label: "Status", values: uniqueStatuses, badgeColor: "amber" },
                        ...(uniqueCategories.length > 0
                          ? [{ id: "category", label: "Category", values: uniqueCategories, badgeColor: "amber" as const, searchable: true }]
                          : []),
                        { id: "source", label: "Source", values: uniqueSources, badgeColor: "blue" },
                        { id: "rating", label: "Rating", values: [...presentRatings], badgeColor: "stone" }
                    ]}
                    extraControls={
                      <ViewControls
                        view={view}
                        onView={setView}
                        group={groupBy}
                        onGroup={(g) => setGroupBy(g as GroupMode)}
                        groupAriaLabel="Group logs"
                        groupOptions={[{ value: "month", label: "Month" }, { value: "type", label: "Type" }, { value: "none", label: "None" }]}
                      />
                    }
                />
            </div>
          </div>
        </div>
      </div>

      {/* List Content */}
      <div className="relative flex-1 overflow-y-auto min-h-0 scrollbar-hide">
        {isPending && <p className="text-muted-foreground m-4 animate-pulse">{loadingLine}</p>}
        {error && <p className="mt-2 text-center text-sm m-4 text-destructive">{error.message}</p>}

        {!isPending && !(logs.length > 0) && (
            <EmptyState line={EMPTY_LINES.noLogs}>
              <p>Search for a media and create one!</p>
            </EmptyState>
        )}

        {!isPending && logs.length > 0 && !(processedLogs.length > 0) && (
             <EmptyState line={EMPTY_LINES.noMatch}>
                 <p>No logs match your filters.</p>
             </EmptyState>
        )}

        {!isPending && processedLogs.length > 0 && (
          <div className="px-6 pb-10 pt-2">
            {groups.map((group) => {
              const { visible, remaining } = reveal.slice(group.key, group.logs)
              return (
                <section key={group.key} className="mb-6">
                  <GroupHeading label={group.label} expanded={reveal.isExpanded(group.key)} onCollapse={() => reveal.collapse(group.key)} headingRef={reveal.headingRef(group.key)} />
                  {view === "list" ? (
                    <ul ref={reveal.listRef(group.key)} className="flex flex-col gap-3">
                      {visible.map((log) => (
                        <LogRow key={log.id} log={log} onEdit={handleEditClick} onDelete={handleDeleteClick} />
                      ))}
                    </ul>
                  ) : (
                    <ul ref={reveal.listRef(group.key)} className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-5 gap-y-7">
                      {visible.map((log) => (
                        <LogTile key={log.id} log={log} onEdit={handleEditClick} onDelete={handleDeleteClick} />
                      ))}
                    </ul>
                  )}
                  <GroupFooter
                    total={group.logs.length} remaining={remaining} step={step(view, groupBy)}
                    expanded={reveal.isExpanded(group.key)} groupLabel={group.label}
                    onLoadMore={() => reveal.loadMore(group.key)}
                    onLoadAll={() => reveal.loadAll(group.key, group.logs.length)}
                    onCollapse={() => reveal.collapse(group.key)}
                  />
                </section>
              )
            })}
          </div>
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