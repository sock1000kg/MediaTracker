import { Search, Plus, Filter, X, ArrowUp, ArrowDown } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { type SortField, type SortCriterion } from "@/types/sort"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { filterValues } from "@/lib/filterValues"

export type BadgeColor = "stone" | "amber" | "blue"

const BADGE_STYLES: Record<BadgeColor, string> = {
    stone: "bg-muted text-foreground border-border",
    amber: "bg-tag text-tag-foreground border-tag",
    blue: "bg-card text-link border-link/40",
}

interface DataControlsProps {
    searchQuery: string
    setSearchQuery: (val: string) => void
    addSort: (field: SortField) => void
    activeSorts: SortCriterion[]
    toggleSortDirection: (id: string) => void
    removeSort: (id: string) => void
    availableSorts: { value: string; label: string }[]
    filterOptions: { id: string; label: string; values: string[]; badgeColor?: BadgeColor; searchable?: boolean }[]
    activeFilters: Record<string, string[]>
    toggleFilter: (id: string, val: string) => void
    clearAll: () => void,
    extraControls?: ReactNode
    /** Rendered as the first item of the top controls row (e.g. a create button) */
    leadingControls?: ReactNode
}

const AUTO_SEARCHABLE_OVER = 12

/** One filter dropdown. With `searchable`, an input at the top filters the values by substring. */
function FilterDropdown({ opt, selected, toggleFilter }: {
    opt: DataControlsProps["filterOptions"][number]
    selected: string[]
    toggleFilter: (id: string, val: string) => void
}) {
    const [search, setSearch] = useState("")
    const [open, setOpen] = useState(false)
    const searchRef = useRef<HTMLInputElement>(null)
    const searchable = opt.searchable || opt.values.length > AUTO_SEARCHABLE_OVER
    const { values, noMatches } = searchable
        ? filterValues(opt.values, search, selected)
        : { values: opt.values, noMatches: false }
    // Radix focuses the menu itself after it mounts, so move focus to the search box on the next frame
    useEffect(() => {
        if (!open || !searchable) return
        const id = requestAnimationFrame(() => searchRef.current?.focus())
        return () => cancelAnimationFrame(id)
    }, [open, searchable])
    const placeholder = `Search ${opt.id === "category" ? "categories" : opt.label.toLowerCase()}…`

    // Radix focuses an item on pointer move, and the content itself on item pointer leave; both would pull
    // focus out of the search box mid-typing. Preventing the event skips Radix's (composed) handler.
    const keepSearchFocus = (e: { preventDefault: () => void }) => {
        if (searchable && document.activeElement === searchRef.current) e.preventDefault()
    }

    return (
        <DropdownMenu onOpenChange={(o) => { setOpen(o); if (!o) setSearch("") }}>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-fit h-9 gap-2 rounded-full border-border-strong bg-card font-normal px-3">
                    <Filter className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{opt.label}</span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                className="max-h-72 overflow-y-auto"
            >
                <DropdownMenuLabel>Filter by {opt.label}</DropdownMenuLabel>
                {searchable && (
                    <div className="sticky top-0 bg-popover z-10 px-1 pb-1">
                        <Input
                            ref={searchRef}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder={placeholder}
                            aria-label={placeholder}
                            className="h-8"
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => {
                                // Radix uses key presses for typeahead/navigation; keep them for the input,
                                // except Escape (closes), ArrowDown (to the first item) and Tab
                                if (e.key === "Escape" || e.key === "Tab") return
                                e.stopPropagation()
                                if (e.key === "ArrowDown") {
                                    e.preventDefault()
                                    const menu = e.currentTarget.closest<HTMLElement>("[role='menu']")
                                    menu?.querySelector<HTMLElement>("[role='menuitem']:not([data-disabled])")?.focus()
                                }
                            }}
                        />
                    </div>
                )}
                <DropdownMenuSeparator />
                {noMatches && <div className="px-2 py-1.5 text-sm text-muted-foreground">No matches</div>}
                {values.map((val) => (
                    <DropdownMenuItem
                        key={val}
                        disabled={selected.includes(val)}
                        onPointerMove={keepSearchFocus}
                        onPointerLeave={keepSearchFocus}
                        onSelect={(e) => { e.preventDefault(); toggleFilter(opt.id, val); }}
                    >
                        <span className="capitalize">{val}</span>
                    </DropdownMenuItem>
                ))}
                {selected.length > 0 && (
                    <>
                        <DropdownMenuSeparator />
                        <Button
                            variant="ghost"
                            size="sm"
                            className="w-full justify-center text-xs"
                            onClick={() => { selected.forEach(v => toggleFilter(opt.id, v)) }}
                        >
                            Clear Filters
                        </Button>
                    </>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

export function DataControls({ 
    searchQuery, setSearchQuery, 
    addSort, activeSorts, toggleSortDirection, removeSort,
    availableSorts,
    filterOptions,
    activeFilters, toggleFilter,
    clearAll,
    extraControls,
    leadingControls
}: DataControlsProps) {

  const hasActiveFilters = activeSorts.length > 0 || Object.values(activeFilters).flat().length > 0

  return (
    // Added max-w-full to prevent it from blowing out layout
    <div className="flex flex-col gap-3 w-full max-w-full">
        {/* Top Row: Controls */}
        <div className="flex flex-wrap gap-2 items-center justify-start">
             {leadingControls}
             <div className="relative w-full sm:w-64 lg:w-72">
                <Search className="absolute left-3.5 top-3 h-4 w-4 text-muted-foreground" />
                <Input 
                    value={searchQuery} 
                    onChange={e => setSearchQuery(e.target.value)} 
                    placeholder="Search..." 
                    className="pl-10 h-10 rounded-full border-border-strong bg-card" 
                />
             </div>
             
             {/* SORTS */}
             <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-fit h-9 gap-2 rounded-full border-border-strong bg-card px-3 font-normal">
                        <Plus className="h-3.5 w-3.5"/> 
                        <span className="hidden sm:inline">Add Sort</span>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
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
                        {activeSorts.length > 0 && (
                            <>
                                <DropdownMenuSeparator />
                                <Button 
                                variant="ghost" 
                                size="sm" 
                                className="w-full justify-center text-xs"
                                onClick={() => {
                                    activeSorts.forEach(s => removeSort(s.id))
                                }}
                                >
                                Clear Filters
                                </Button>
                            </>
                        )}
                </DropdownMenuContent>
             </DropdownMenu>

            {/* FILTERS */}
            {filterOptions.map((opt) => (
                <FilterDropdown key={opt.id} opt={opt} selected={activeFilters[opt.id] ?? []} toggleFilter={toggleFilter} />
            ))}

             {/* Extra Controls (Group By, etc) */}
             {extraControls && (
                <>
                    <div className="w-[1px] h-6 bg-border mx-1 hidden sm:block" />
                    {extraControls}
                </>
             )}
        </div>

        {/* Bottom Row: Badges & Clear All */}
        {hasActiveFilters && (
            <div className="flex flex-wrap gap-2 items-center justify-start pt-1 animate-in fade-in slide-in-from-top-1">
                <span className="text-xs font-medium text-muted-foreground mr-1">Active:</span>

                {activeSorts.map((sort) => {
                    const label = availableSorts.find(f => f.value === sort.field)?.label
                    return (
                        <div
                        key={sort.id}
                        className="flex items-center gap-1 bg-card text-foreground border border-link/40 rounded-full px-2.5 py-0.5 text-xs cursor-pointer hover:border-link transition-colors select-none group"
                        onClick={() => toggleSortDirection(sort.id)}
                        >
                        <span className="text-link font-medium">{label}</span>
                        {sort.direction === "asc" ? (
                            <ArrowUp className="h-3 w-3 text-muted-foreground group-hover:text-link" />
                        ) : (
                            <ArrowDown className="h-3 w-3 text-muted-foreground group-hover:text-link" />
                        )}
                        <div className="w-[1px] h-3 bg-border mx-1" />
                        <button
                            onClick={(e) => {
                            e.stopPropagation()
                            removeSort(sort.id)
                            }}
                            className="text-muted-foreground hover:text-destructive"
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
                    <div key={`${id}-${val}`} className={`flex items-center gap-1 border rounded-full px-2.5 py-0.5 text-xs ${colorClass}`}>
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
                    className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                >
                    Clear all
                </Button>
            </div>
        )}
    </div>
  )
}