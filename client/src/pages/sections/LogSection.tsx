import { useCallback, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { deleteLog, deleteWarningLog, editLog } from "@/api/logs"
import { fetchLogsQueryOptions } from "@/queryOptions/fetchLogsQueryOptions"

import { LogCard } from "@/components/cards/LogCard"
import { MediaTypeCard } from "@/components/cards/MediaTypeGroupCard"

import type { DialogName, Log, MediaMetadata } from "@/types/mainTypes"
import EntityDialog from "../../components/dialogs/EntityDialog"
import { LogForm } from "@/forms/LogForm"
import { ConfirmDeleteDialog } from "../../components/dialogs/ConfirmDeleteDialog"
import { AVAILABLE_SORT_FIELDS, type SortCriterion, type SortField } from "@/types/sort"
import { ArrowDown, ArrowUp, CircleDashed, Filter, Layers, Plus, Search, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

export default function LogsSection() {
  const [openDialog, setOpenDialog] = useState<DialogName>(null)
  const [targetLog, setTargetLog] = useState<Log | null>(null)

  // --- FILTER & SORT STATE ---
  const [searchQuery, setSearchQuery] = useState("")
  const [filterMediaTypes, setFilterMediaTypes] = useState<string[]>([]) // List of media types to include
  const [filterStatuses, setFilterStatuses] = useState<string[]>([])
  const [activeSorts, setActiveSorts] = useState<SortCriterion[]>([])
  const [groupBy, setGroupBy] = useState<"type" | "none">("type")

  const queryClient = useQueryClient()
  // Fetch logs on mount
  const { data: logs = [], error, isPending } = useQuery(fetchLogsQueryOptions())
  const deleteMutation = useMutation({
    mutationFn: deleteLog,
    onSuccess: () => queryClient.refetchQueries({queryKey: fetchLogsQueryOptions().queryKey}),
  })

  const editMutation = useMutation({
    mutationFn: editLog,
    onSuccess: () => queryClient.refetchQueries({queryKey: fetchLogsQueryOptions().queryKey}),
  })

  const handleDeleteClick = (log: Log) => {
    setTargetLog(log)
    setOpenDialog("deleteConfirm")
  }

  const handleEditClick= (log: Log) => {
    setTargetLog(log)
    setOpenDialog("logForm")
  }

  const handleAddSort = (field: SortField) => {
    // Prevent duplicates
    if (activeSorts.find((s) => s.field === field)) return
    
    // Prepend new sort (unshift) so it becomes the PRIMARY sort immediately.
    // This solves the issue where adding a sort feels like it "does nothing" 
    // because the previous sort (e.g., Title) was already unique.
    setActiveSorts([{ id: crypto.randomUUID(), field, direction: "asc" }, ...activeSorts])
  }

  const toggleSortDirection = (id: string) => {
    setActiveSorts(
      activeSorts.map((s) =>
        s.id === id ? { ...s, direction: s.direction === "asc" ? "desc" : "asc" } : s
      )
    )
  }

  const removeSort = (id: string) => {
    setActiveSorts(activeSorts.filter((s) => s.id !== id))
  }

  const toggleMediaTypeFilter = (type: string) => {
    setFilterMediaTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    )
  }

  const toggleStatusFilter = (status: string) => {
    setFilterStatuses((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
    )
  }

  // --- PROCESSING DATA ---
  const processedLogs = useMemo(() => {
    let result = [...logs]

    // Filter by Search (Title or Creator)
    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase()
      result = result.filter(
        (log) =>
          log.media.title.toLowerCase().includes(lowerQuery) ||
          (log.media.creator && log.media.creator.toLowerCase().includes(lowerQuery))
      )
    }

    // Filter by Media Type
    if (filterMediaTypes.length > 0) {
      result = result.filter((log) => filterMediaTypes.includes(log.media.mediaType.name))
    }

    if (filterStatuses.length > 0) {
      result = result.filter((log) => filterStatuses.includes(log.status))
    }

    // Multi-Sort
    // If no custom sorts, default to Date Descending (standard log view)
    const sortsToApply = activeSorts.length > 0 ? activeSorts : [{ field: "date", direction: "desc" } as SortCriterion]

    result.sort((a, b) => {
      for (const sort of sortsToApply) {
        let valA: unknown
        let valB: unknown

        // Extract values based on field
        switch (sort.field) {
          case "title":
            valA = a.media.title
            valB = b.media.title
            break
          case "creator":
            valA = a.media.creator || ""
            valB = b.media.creator || ""
            break
          case "rating":
            valA = a.rating ?? -1
            valB = b.rating ?? -1
            break
          case "date":
            valA = new Date(a.logged_at).getTime()
            valB = new Date(b.logged_at).getTime()
            break
          case "pageCount":
            valA = Number((a.media.metadata as MediaMetadata)?.pageCount ?? 0)
            valB = Number((b.media.metadata as MediaMetadata)?.pageCount ?? 0)
            break
          case "categories":
            const catsA = (a.media.metadata as MediaMetadata)?.categories
            const catsB = (b.media.metadata as MediaMetadata)?.categories
            valA = Array.isArray(catsA) ? catsA.join(", ") : String(catsA || "")
            valB = Array.isArray(catsB) ? catsB.join(", ") : String(catsB || "")
            break
        }

        // If items are identical, continue to next sort criterion (return 0)
        if (valA === valB) continue;

        let comparison = 0;

        // Use localeCompare for strings (Handles accents, Case Insensitive, Numeric "10" vs "2")
        if (typeof valA === 'string' && typeof valB === 'string') {
          comparison = valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' })
        } else if (typeof valA === 'number' && typeof valB === 'number') {
          // Standard numeric comparison
          if (valA < valB) comparison = -1
          if (valA > valB) comparison = 1
        }

        // Apply direction and return immediately if not equal
        if (comparison !== 0) {
           return sort.direction === "asc" ? comparison : -comparison
        }
      }
      return 0
    })

    return result
  }, [logs, searchQuery, filterMediaTypes, activeSorts, filterStatuses])

  // Grouping Logic (only if enabled)
  const groupedLogs = useMemo(() => {
    if (groupBy === "none") return null

    return processedLogs.reduce((acc, log) => {
      const type = log.media.mediaType.name
      if (!acc[type]) acc[type] = []
      acc[type].push(log)
      return acc
    }, {} as Record<string, Log[]>)
  }, [processedLogs, groupBy])

  // Available Media Types for Type filter Dropdown
  const uniqueMediaTypes = useMemo(() => {
    return Array.from(new Set(logs.map((l) => l.media.mediaType.name))).sort()
  }, [logs])

  // Available Media Types for Status filter Dropdown
  const uniqueStatuses = useMemo(() => {
    return Array.from(new Set(logs.map((l) => l.status))).filter(Boolean).sort()
  }, [logs])


  // --- FORM RENDER ---
  //Log form
  const renderLogForm = useCallback((
    formData: Partial<Log>,
    setFormData: React.Dispatch<React.SetStateAction<Partial<Log>>> //state setter for formData
  ) => {
    if (!targetLog) {
        // This case should theoretically never be reached if handleEditClick worked correctly
        console.error("Attempted to render LogForm without a targetLog.")
        return null
    }
      return <LogForm formData={formData} setFormData={setFormData} targetMedia={targetLog.media}/>
  }, [targetLog])

  return (
    <div className="flex flex-col h-full bg-stone-50/50">
      {/* Header & Controls */}
      <div className="w-full bg-stone-200 p-4 border-stone-300">
        {/* Main Row: Title Left, Controls Right */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Left: Title */}
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-lg font-semibold">Your Logs</h1>
              <p className="text-sm text-gray-600">Manage and organize your media history</p>
            </div>
          </div>

          {/* Right: Controls */}
          <div className="flex flex-col gap-3 justify-end">
            {/* Top Row: Search & Toggles */}
            <div className="flex flex-wrap gap-2 items-center">
              <div className="relative flex-1 min-w-[200px] max-w-md">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-stone-400" />
                <Input
                  placeholder="Search title or creator..."
                  className="pl-9 h-9 bg-white"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              {/* Add Sort Dropdown */}
              <Select onValueChange={(val) => handleAddSort(val as SortField)}>
                <SelectTrigger className="w-fit h-9 gap-2 border-dashed bg-white">
                  <Plus className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Add Sort</span>
                </SelectTrigger>
                <SelectContent>
                  {AVAILABLE_SORT_FIELDS.map((field) => (
                    <SelectItem
                        key={field.value} 
                        value={field.value}
                        disabled={!!activeSorts.find(s => s.field === field.value)}
                      >
                      {field.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Filter Type Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-fit h-9 gap-2 border-dashed bg-white font-normal px-3">
                    <Filter className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Filter Type</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[200px]">
                  <DropdownMenuLabel>Select Types</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {uniqueMediaTypes.map((type) => (
                    <DropdownMenuCheckboxItem
                      key={type}
                      checked={filterMediaTypes.includes(type)}
                      onCheckedChange={() => toggleMediaTypeFilter(type)}
                      // preventDefault onSelect ensures the menu stays open while toggling multiple
                      onSelect={(e) => e.preventDefault()}
                    >
                      {type}
                    </DropdownMenuCheckboxItem>
                  ))}
                  {filterMediaTypes.length > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <div>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="w-full justify-center text-xs"
                          onClick={() => setFilterMediaTypes([])}
                        >
                          Clear Filters
                        </Button>
                      </div>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Filter Status */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-fit h-9 gap-2 border-dashed bg-white font-normal px-3">
                    <CircleDashed className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Status</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[200px]">
                  <DropdownMenuLabel>Select Status</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {uniqueStatuses.map((status) => (
                    <DropdownMenuCheckboxItem
                      key={status}
                      checked={filterStatuses.includes(status)}
                      onCheckedChange={() => toggleStatusFilter(status)}
                      onSelect={(e) => e.preventDefault()}
                    >
                      <span className="capitalize">{status}</span>
                    </DropdownMenuCheckboxItem>
                  ))}
                  {filterStatuses.length > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <div>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="w-full justify-center text-xs"
                          onClick={() => setFilterStatuses([])}
                        >
                          Clear Filters
                        </Button>
                      </div>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              
              {/* Group By Toggle */}
              <div className="flex items-center border rounded-md h-9 overflow-hidden ml-auto sm:ml-0">
                  <Button
                    variant="ghost" 
                    size="sm"
                    className={`h-full rounded-none px-3 gap-2 font-normal ${groupBy === 'type' ? 'bg-stone-100' : 'bg-white'}`}
                    onClick={() => setGroupBy('type')}
                  >
                    <Layers className="h-3.5 w-3.5" />
                    Grouped
                  </Button>
                  <div className="w-[1px] h-4 bg-stone-200" />
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className={`h-full rounded-none px-3 font-normal ${groupBy === 'none' ? 'bg-stone-100' : 'bg-white'}`}
                    onClick={() => setGroupBy('none')}
                  >
                    List
                  </Button>
              </div>
            </div>

            {/* Bottom Row: Active Filter/Sort Badges */}
            {(activeSorts.length > 0 || filterMediaTypes.length > 0 || filterStatuses.length > 0) && (
              <div className="flex flex-wrap gap-2 items-center pt-1 animate-in fade-in slide-in-from-top-1">
                <span className="text-xs font-medium text-stone-500 mr-1">Active:</span>
                
                {/* Media Type Filters */}
                {filterMediaTypes.map((type) => (
                  <div key={type} className="flex items-center gap-1 bg-stone-100 text-stone-700 border border-stone-200 rounded-md px-2 py-1 text-xs shadow-sm">
                    <Filter className="h-3 w-3 text-stone-400" />
                    <span className="font-medium">{type}</span>
                    <button onClick={() => toggleMediaTypeFilter(type)} className="ml-1 hover:text-red-500">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}

                {/* Sort Badges */}
                {activeSorts.map((sort) => {
                  const label = AVAILABLE_SORT_FIELDS.find(f => f.value === sort.field)?.label
                  return (
                    <div
                      key={sort.id}
                      className="flex items-center gap-1 bg-white text-stone-700 border border-blue-200 rounded-md px-2 py-1 text-xs shadow-sm cursor-pointer hover:border-blue-300 transition-colors select-none group"
                      onClick={() => toggleSortDirection(sort.id)}
                    >
                      <span className="text-blue-500/70 font-medium">{label}</span>
                      {sort.direction === "asc" ? (
                        <ArrowUp className="h-3 w-3 text-stone-400 group-hover:text-blue-600" />
                      ) : (
                        <ArrowDown className="h-3 w-3 text-stone-400 group-hover:text-blue-600" />
                      )}
                      <div className="w-[1px] h-3 bg-stone-200 mx-1" />
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          removeSort(sort.id)
                        }}
                        className="text-stone-400 hover:text-red-500"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )
                })}

                {filterStatuses.map((status) => (
                  <div key={status} className="flex items-center gap-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-md px-2 py-1 text-xs shadow-sm">
                    <CircleDashed className="h-3 w-3 text-amber-500" />
                    <span className="font-medium capitalize">{status}</span>
                    <button onClick={() => toggleStatusFilter(status)} className="ml-1 hover:text-amber-700">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                
                {(activeSorts.length > 0 || filterMediaTypes.length > 0) && (
                    <Button 
                        variant="link" 
                        size="sm" 
                        className="h-auto p-0 text-xs text-stone-500"
                        onClick={() => {
                            setActiveSorts([])
                            setFilterMediaTypes([])
                        }}
                    >
                        Clear all
                    </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* List Content */}
      <div className="flex-1 overflow-y-auto min-h-0 scrollbar-hide">
        {isPending && <p className="text-stone-500 animate-pulse">Loading logs...</p>}

        {error && (
          <p className="mt-2 text-center text-sm text-red-500">{error.message}</p>
        )}

        {!isPending && logs.length === 0 && (
            <p className="text-stone-600">You have no logs. Search for a media and create one!</p>
        )}

        {!isPending && logs.length > 0 && processedLogs.length === 0 && (
             <div className="flex flex-col items-center justify-center h-40 text-stone-500">
                 <Search className="h-8 w-8 mb-2 opacity-20"/>
                 <p>No logs match your filters.</p>
             </div>
        )}

        {!isPending && processedLogs.length > 0 && (
          <ul className="space-y-4 pb-10 pt-2">
            {/* MODE: GROUPED */}
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

            {/* MODE: FLAT LIST */}
            {groupBy === 'none' && 
                processedLogs.map((log) => (
                  <div className="px-6">
                    <LogCard
                        key={log.id}
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
