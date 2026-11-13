import { useState, useMemo } from "react"
import { type SortCriterion, type SortField } from "@/types/sort"

interface UseDataFilterProps<T> {
  data: T[]
  initialSorts?: SortCriterion[]
  searchFields: (keyof T | string)[] // Fields to search (e.g. "media.title")
  filterableFields?: {
    field: (item: T) => string | string[] | null | undefined // Value(s) to filter by; arrays match if ANY value is active
    id: string
  }[],
  getSortValue?: (item: T, field: SortField) => string | number | Date | null | undefined
}

export function useDataFilter<T>({ 
    data, 
    initialSorts = [], 
    searchFields, 
    filterableFields = [], 
    getSortValue 
}: UseDataFilterProps<T>) {
  const [searchQuery, setSearchQuery] = useState("")
  const [activeSorts, setActiveSorts] = useState<SortCriterion[]>(initialSorts)
  
  // Stores active filters: { "mediaType": ["Book", "Movie"], "status": ["completed"] }
  const [activeFilters, setActiveFilters] = useState<Record<string, string[]>>({})

  // Handlers
  const addSort = (field: SortField) => {
    if (activeSorts.find((s) => s.field === field)) return
    setActiveSorts([{ id: crypto.randomUUID(), field, direction: "asc" }, ...activeSorts])
  }

  const replaceSorts = (sorts: SortCriterion[]) => setActiveSorts(sorts)

  const removeSort = (id: string) => setActiveSorts(prev => prev.filter(s => s.id !== id))

  const toggleSortDirection = (id: string) => {
    setActiveSorts(prev => prev.map(s => s.id === id ? { ...s, direction: s.direction === "asc" ? "desc" : "asc" } : s))
  }

  const toggleFilter = (filterId: string, value: string) => {
    setActiveFilters(prev => {
      const current = prev[filterId] || []
      const updated = current.includes(value) ? current.filter(v => v !== value) : [...current, value]
      return { ...prev, [filterId]: updated }
    })
  }
  
  const clearAll = () => {
      setSearchQuery("")
      setActiveSorts([])
      setActiveFilters({})
  }

  // Processing
  const processedData = useMemo(() => {
    let result = [...data]

    // Search
    if (searchQuery) {
      const lowerQ = searchQuery.toLowerCase()
      result = result.filter(item => {
        // Simple nested property accessor
        return searchFields.some(path => { // path ex: "media.title"
            const val = path.toString().split('.')  // Becomes: ["media", "title"]
            .reduce<unknown>((obj, key) => (obj as Record<string, unknown>)?.[key], item)
            return String(val ?? "").toLowerCase().includes(lowerQ)
        })
      })
    }

    // Filters
    Object.entries(activeFilters).forEach(([filterId, activeValues]) => {
      if (activeValues.length === 0) return
      const filterDef = filterableFields.find(f => f.id === filterId)
      if (filterDef) {
        result = result.filter(item => {
          const v = filterDef.field(item)
          if (v === null || v === undefined) return false
          return Array.isArray(v) ? v.some(x => activeValues.includes(x)) : activeValues.includes(v)
        })
      }
    })

    // Sort
    if (activeSorts.length > 0 && getSortValue) {
      result.sort((a, b) => {
        for (const sort of activeSorts) {
           const valA = getSortValue(a, sort.field)
           const valB = getSortValue(b, sort.field)

           if (valA === valB) continue
           if (valA === null || valA === undefined) return 1 
           if (valB === null || valB === undefined) return -1

           let comparison = 0
           if (typeof valA === 'string' && typeof valB === 'string') {
             comparison = valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' })
           } else if (valA < valB) {
             comparison = -1
           } else if (valA > valB) {
             comparison = 1
           }

           if (comparison !== 0) {
             return sort.direction === "asc" ? comparison : -comparison
           }
        }
        return 0
      })
    }
    
    return result
  }, [data, searchQuery, activeFilters, activeSorts, searchFields, filterableFields, getSortValue])

  return {
    processedData,
    searchQuery, setSearchQuery,
    activeSorts, addSort, replaceSorts, removeSort, toggleSortDirection,
    activeFilters, toggleFilter,
    clearAll
  }
}