import { Search, Plus, Filter, X, ArrowUp, ArrowDown } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { type SortField, type SortCriterion } from "@/types/sort"
import type { ReactNode } from "react"

export type BadgeColor = "stone" | "amber" | "blue"

const BADGE_STYLES: Record<BadgeColor, string> = {
    stone: "bg-stone-100 text-stone-700 border-stone-200",
    amber: "bg-amber-50 text-amber-800 border-amber-200",
    blue: "bg-blue-50 text-blue-800 border-blue-200",
}

interface DataControlsProps {
    searchQuery: string
    setSearchQuery: (val: string) => void
    addSort: (field: SortField) => void
    activeSorts: SortCriterion[]
    toggleSortDirection: (id: string) => void
    removeSort: (id: string) => void
    availableSorts: { value: string; label: string }[]
    filterOptions: { id: string; label: string; values: string[]; badgeColor?: BadgeColor }[]
    activeFilters: Record<string, string[]>
    toggleFilter: (id: string, val: string) => void
    clearAll: () => void,
    extraControls?: ReactNode
}

export function DataControls({ 
    searchQuery, setSearchQuery, 
    addSort, activeSorts, toggleSortDirection, removeSort,
    availableSorts,
    filterOptions,
    activeFilters, toggleFilter,
    clearAll,
    extraControls
}: DataControlsProps) {

  const hasActiveFilters = activeSorts.length > 0 || Object.values(activeFilters).flat().length > 0

  return (
    // Added max-w-full to prevent it from blowing out layout
    <div className="flex flex-col gap-3 w-full max-w-full">
        {/* Top Row: Controls */}
        <div className="flex flex-wrap gap-2 items-center justify-end">
             <div className="relative w-full sm:w-64 lg:w-72">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-stone-400" />
                <Input 
                    value={searchQuery} 
                    onChange={e => setSearchQuery(e.target.value)} 
                    placeholder="Search..." 
                    className="pl-9 h-9 bg-white" 
                />
             </div>
             
             {/* SORTS */}
             <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-fit h-9 gap-2 border-dashed bg-white px-3 font-normal">
                        <Plus className="h-3.5 w-3.5"/> 
                        <span className="hidden sm:inline">Add Sort</span>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[160px]">
                    <DropdownMenuLabel>Sort by</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {availableSorts.map((f) => (
                        <DropdownMenuItem 
                            key={f.value} 
                            disabled={activeSorts.some((s) => s.field === f.value)}
                            onSelect={(e) => {e.preventDefault(); addSort(f.value as SortField)}}
                        >
                            {f.label}
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
             </DropdownMenu>

            {/* FILTERS */}
            {filterOptions.map((opt) => (
                <DropdownMenu key={opt.id}>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" className="w-fit h-9 gap-2 border-dashed bg-white font-normal px-3">
                            <Filter className="h-3.5 w-3.5" /> 
                            <span className="hidden sm:inline">{opt.label}</span>
                        </Button>
                    </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[200px]">
                    <DropdownMenuLabel>Filter by {opt.label}</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {opt.values.map((val) => (
                        <DropdownMenuCheckboxItem 
                            key={val} 
                            checked={activeFilters[opt.id]?.includes(val)}
                            onSelect={(e) => { e.preventDefault(); toggleFilter(opt.id, val); }}
                        >
                            <span className="capitalize">{val}</span>
                        </DropdownMenuCheckboxItem>
                    ))}
                        {activeFilters[opt.id]?.length > 0 && (
                        <>
                            <DropdownMenuSeparator />
                            <Button 
                            variant="ghost" 
                            size="sm" 
                            className="w-full justify-center text-xs"
                            onClick={() => {
                                activeFilters[opt.id].forEach(v => toggleFilter(opt.id, v))
                            }}
                            >
                            Clear Filters
                            </Button>
                        </>
                        )}
                </DropdownMenuContent>
                </DropdownMenu>
            ))}

             {/* Extra Controls (Group By, etc) */}
             {extraControls && (
                <>
                    <div className="w-[1px] h-6 bg-stone-300 mx-1 hidden sm:block" />
                    {extraControls}
                </>
             )}
        </div>

        {/* Bottom Row: Badges & Clear All */}
        {hasActiveFilters && (
            <div className="flex flex-wrap gap-2 items-center justify-end pt-1 animate-in fade-in slide-in-from-top-1">
                <span className="text-xs font-medium text-stone-500 mr-1">Active:</span>

                {activeSorts.map((sort) => {
                    const label = availableSorts.find(f => f.value === sort.field)?.label
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
                
                {Object.entries(activeFilters).map(([id, values]) => {
                    const option = filterOptions.find(o => o.id === id)
                    const colorClass = BADGE_STYLES[option?.badgeColor ?? "stone"]
                    
                    return values.map((val) => (
                    <div key={`${id}-${val}`} className={`flex items-center gap-1 border rounded-md px-2 py-1 text-xs shadow-sm ${colorClass}`}>
                        <Filter className={`h-3 w-3 opacity-50`} />
                        <span className="font-medium capitalize">{val}</span>
                        <button onClick={() => toggleFilter(id, val)} className="ml-1 hover:opacity-100 opacity-60">
                        <X className="h-3 w-3" />
                        </button>
                    </div>
                    ))
                })}

                {/* Clear All Button - Moved inline with badges */}
                <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={clearAll} 
                    className="h-6 px-2 text-xs text-stone-400 hover:text-red-500 hover:bg-red-50"
                >
                    Clear all
                </Button>
            </div>
        )}
    </div>
  )
}