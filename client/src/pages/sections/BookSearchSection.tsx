import { PageBackdrop } from "@/components/media-view/PageBackdrop"
import { effectiveHideLogged } from "@/lib/preferences"
import { usePreferences } from "@/hooks/usePreferences"
import EmptyState from "@/components/EmptyState"
import { EMPTY_LINES, pickLoadingLine } from "@/lib/whimsy"
import { Filter, Search, X } from "lucide-react"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { Label } from "../../components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select"
import { ResultList } from "@/components/search/ResultList"
import { ViewControls } from "@/components/media-view/ViewControls"
import { useStoredView } from "@/hooks/useStoredView"

import { searchBooks } from "@/api/search"
import { useCallback, useEffect, useRef, useState } from "react"
import { findLogForResult, isResultLogged, readStoredBool, writeStoredBool } from "@/lib/utils"
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData  } from "@tanstack/react-query"

import type { BookResult, BookSearchFilters, BookSort } from "@/types/search"
import { type DialogName, type Log } from "@/types/mainTypes"

import EntityDialog from "../../components/dialogs/EntityDialog"
import { editLog } from "@/api/logs"
import { fetchLogsQueryOptions } from "@/queryOptions/fetchLogsQueryOptions"
import { fetchMediasQueryOptions } from "@/queryOptions/fetchMediasQueryOptions"
import { MediaSearchLogForm } from "@/forms/MediaSearchLogForm"
import { createMediaAndLog } from "@/api/media"

const LANGUAGES: { value: string, label: string }[] = [
    { value: "eng", label: "English" },
    { value: "fre", label: "French" },
    { value: "ger", label: "German" },
    { value: "spa", label: "Spanish" },
    { value: "ita", label: "Italian" },
    { value: "por", label: "Portuguese" },
    { value: "rus", label: "Russian" },
    { value: "jpn", label: "Japanese" },
    { value: "chi", label: "Chinese" },
    { value: "kor", label: "Korean" },
    { value: "vie", label: "Vietnamese" },
]

const SORTS: { value: BookSort, label: string }[] = [
    { value: "relevance", label: "Relevance" },
    { value: "new", label: "Newest" },
    { value: "old", label: "Oldest" },
    { value: "rating", label: "Top rated" },
]

const ANY = "any" // Radix Select doesn't allow an empty-string item value

// Draft filters are kept as strings for the inputs; applied ones are cleaned up
function cleanFilters(f: BookSearchFilters): BookSearchFilters {
    const out: BookSearchFilters = {}
    if (f.author?.trim()) out.author = f.author.trim()
    if (f.subject?.trim()) out.subject = f.subject.trim()
    if (f.language) out.language = f.language
    if (f.yearFrom !== undefined && !Number.isNaN(f.yearFrom)) out.yearFrom = f.yearFrom
    if (f.yearTo !== undefined && !Number.isNaN(f.yearTo)) out.yearTo = f.yearTo
    if (f.sort && f.sort !== "relevance") out.sort = f.sort
    return out
}

function filterChips(f: BookSearchFilters): { key: keyof BookSearchFilters, label: string }[] {
    const chips: { key: keyof BookSearchFilters, label: string }[] = []
    if (f.author) chips.push({ key: "author", label: `Author: ${f.author}` })
    if (f.subject) chips.push({ key: "subject", label: `Subject: ${f.subject}` })
    if (f.language) chips.push({ key: "language", label: `Language: ${LANGUAGES.find(l => l.value === f.language)?.label ?? f.language}` })
    if (f.yearFrom !== undefined) chips.push({ key: "yearFrom", label: `From: ${f.yearFrom}` })
    if (f.yearTo !== undefined) chips.push({ key: "yearTo", label: `To: ${f.yearTo}` })
    if (f.sort) chips.push({ key: "sort", label: `Sort: ${SORTS.find(s => s.value === f.sort)?.label ?? f.sort}` })
    return chips
}

export default function BooksSearchSection() {
  const [loadingLine] = useState(() => pickLoadingLine())
    const [openDialog, setOpenDialog] = useState<DialogName>(null)
    const [inputValue, setInputValue] = useState("")
    const [query, setQuery] = useState("")

    //FILTERS: draft = what's in the panel, applied = what the search uses
    const [showFilters, setShowFilters] = useState(false)
    const [draftFilters, setDraftFilters] = useState<BookSearchFilters>({})
    const [appliedFilters, setAppliedFilters] = useState<BookSearchFilters>({})

    //TARGET MEDIA/LOG FOR LOGGING
    const [targetMedia, setTargetMedia] = useState<BookResult>()
    const [targetLog, setTargetLog] = useState<Log | null>(null)

    const { prefs, isLoaded: prefsLoaded, updatePrefs } = usePreferences()
    const [view, setView] = useStoredView("search.view.books")
    const [hideLogged, setHideLogged] = useState(() => effectiveHideLogged(prefs.hideLogged?.books, readStoredBool("hideLogged.books")))
    const hideTouched = useRef(false)
    // Prefs arriving after mount: adopt the server value unless the toggle was used
    useEffect(() => {
        const v = prefs.hideLogged?.books
        if (prefsLoaded && !hideTouched.current && v !== undefined) setHideLogged(v)
    }, [prefsLoaded, prefs.hideLogged?.books])
    const toggleHideLogged = () => {
        const next = !hideLogged
        hideTouched.current = true
        setHideLogged(next)
        writeStoredBool("hideLogged.books", next)
        updatePrefs({ hideLogged: { books: next } })
    }

    const queryClient = useQueryClient()

    //Infinite search
    const {
        data,
        error,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        isLoading,
    } = useInfiniteQuery<
        { results: BookResult[], nextStartIndex: number | null }, //QueryFnData
        Error, //Error
        InfiniteData<{ results: BookResult[], nextStartIndex: number | null }, number>, //TData
        [string, string, BookSearchFilters], //QueryKey
        number //PageParam
    >({
        queryKey: ["searchBooks", query, appliedFilters],
        queryFn: async ({ pageParam = 0 }) => {
            return searchBooks(query, pageParam, appliedFilters)
        },
        getNextPageParam: (lastPage) => {
            return lastPage.nextStartIndex
        },
        initialPageParam: 1,  
        enabled: !!query, //fires only when query isnt empty
    })

    // media and logs cache
    const { data: logs = [] } = useQuery(fetchLogsQueryOptions())

    const results = data?.pages.flatMap((page) => page.results) ?? []

    const visibleResults = hideLogged ? results.filter(r => !isResultLogged(logs, r)) : results
    const hiddenCount = results.length - visibleResults.length

    //MUTATIONS
    const createMediaAndLogMutation = useMutation({
        mutationFn: ({ mediaData, logData }: { mediaData: BookResult, logData: Partial<Log> }) =>
            createMediaAndLog(mediaData, logData),

        onSuccess: () => {
            queryClient.refetchQueries({ queryKey: fetchMediasQueryOptions().queryKey})
            queryClient.refetchQueries({ queryKey: fetchLogsQueryOptions().queryKey })
        }
    })

    const editLogMutation = useMutation({
        mutationFn: editLog,
        onSuccess: () => queryClient.refetchQueries({ queryKey: fetchLogsQueryOptions().queryKey}),
    })

    // Applies the panel's filters together with the typed query
    const handleSearch = () => {
        setAppliedFilters(cleanFilters(draftFilters))
        if (inputValue.trim()) {
            setQuery(inputValue.trim())
        }
    }

    const applyFilters = (next: BookSearchFilters) => {
        const cleaned = cleanFilters(next)
        setDraftFilters(cleaned)
        setAppliedFilters(cleaned)
    }

    const removeChip = (key: keyof BookSearchFilters) => {
        const next = { ...appliedFilters }
        delete next[key]
        applyFilters(next)
    }

    const chips = filterChips(appliedFilters)

    const handleLogClick = (item: BookResult) => {
        //Check if log of this item exists already
        const existingLog = findLogForResult(logs, item)

        //set the data of the clicked media item
        const mediaData: BookResult = {
            ...item,
            mediaType: "book"
        }

        setTargetMedia(mediaData)
        setTargetLog(existingLog ?? null)
        setOpenDialog("logForm")
    }

    const handleSubmit = async (formData: Partial<Log>) => {
        // If a log exists, edit it
        if(targetLog) return await editLogMutation.mutateAsync({...targetLog, ...formData})
        
        if (!targetMedia) {
            // This case should theoretically never be reached if handleLogClick worked correctly
            console.error("targetMedia is missing for creation.")
            // Rejecting the Promise will prevent onSuccess from running and display error message
            return Promise.reject(new Error("Cannot create log: Target media data is missing."))
        }

        else {
            return await createMediaAndLogMutation.mutateAsync({
                mediaData: targetMedia,
                logData: formData
            })
        }
    }

    // Media Form
    const renderLogForm = useCallback((
        formData: Partial<Log>,
        setFormData: React.Dispatch<React.SetStateAction<Partial<Log>>> //state setter for formData
    ) => {
        if (!targetMedia) {
            // This case should theoretically never be reached if handleLogClick worked correctly
            console.error("Attempted to render MediaSearchLogForm without a targetMedia.")
            return null
        } 
        return (
            <MediaSearchLogForm 
                targetMedia={targetMedia} 
                formData={formData}
                setFormData={setFormData}
            />
        )
    }, [targetMedia])

    return(
        <div className="relative isolate flex flex-col h-full overflow-hidden">
            <PageBackdrop page="books" />
            {/* Header */}
            <div className="flex flex-col gap-4 px-6 pt-6 pb-4">
                <div>
                <h1 className="font-display text-4xl font-semibold">Book search</h1>
                </div>

                <div className="flex flex-wrap gap-2 items-center">
                    <Input
                        placeholder="Type book name..."
                        value={inputValue}
                        maxLength={100}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={(e) => { 
                            if(e.key === "Enter") {
                                e.preventDefault()
                                handleSearch()
                            }
                        }}
                        className="h-10 flex-1 min-w-[12rem] rounded-full border-border-strong bg-card px-4"
                        />
                    <Button size="icon" variant="amber" aria-label="Search" className="h-10 w-10 rounded-full" disabled={isLoading || isFetchingNextPage} onClick={() => handleSearch()}>
                        <Search />
                    </Button>
                    <div className="basis-full sm:basis-auto flex flex-wrap items-center gap-2">
                    <Button size="default" variant="outline" className="h-10 rounded-full border-border-strong bg-card" onClick={() => setShowFilters(v => !v)} aria-expanded={showFilters}>
                        <Filter /> Filters
                    </Button>
                    </div>
                </div>
                {chips.length > 0 && (
                    <div className="flex flex-wrap gap-2 items-center mt-1">
                        <span className="text-xs font-medium text-muted-foreground">Filters:</span>
                        {chips.map(chip => (
                            <div key={chip.key} className="flex items-center gap-1 border rounded-full px-2.5 py-0.5 text-xs bg-tag text-tag-foreground border-tag">
                                <Filter className="h-3 w-3 opacity-50" />
                                <span className="font-medium">{chip.label}</span>
                                <button aria-label={`Remove ${chip.label}`} onClick={() => removeChip(chip.key)} className="ml-1 hover:opacity-100 opacity-60">
                                    <X className="h-3 w-3" />
                                </button>
                            </div>
                        ))}
                        <button className="text-xs text-muted-foreground hover:underline" onClick={() => applyFilters({})}>Clear all</button>
                    </div>
                )}
            </div>

            {showFilters && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 p-4 bg-background border-b border-border">
                    <div className="grid gap-1">
                        <Label htmlFor="book-filter-author">Author</Label>
                        <Input id="book-filter-author" maxLength={100} value={draftFilters.author ?? ""}
                            onChange={(e) => setDraftFilters(f => ({ ...f, author: e.target.value }))} />
                    </div>
                    <div className="grid gap-1">
                        <Label htmlFor="book-filter-subject">Subject</Label>
                        <Input id="book-filter-subject" maxLength={100} value={draftFilters.subject ?? ""}
                            onChange={(e) => setDraftFilters(f => ({ ...f, subject: e.target.value }))} />
                    </div>
                    <div className="grid gap-1">
                        <Label>Language</Label>
                        <Select value={draftFilters.language ?? ANY}
                            onValueChange={(v) => setDraftFilters(f => ({ ...f, language: v === ANY ? undefined : v }))}>
                            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value={ANY}>Any</SelectItem>
                                {LANGUAGES.map(l => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid gap-1">
                        <Label htmlFor="book-filter-year-from">Year from</Label>
                        <Input id="book-filter-year-from" type="number" min={0} max={2100} value={draftFilters.yearFrom ?? ""}
                            onChange={(e) => setDraftFilters(f => ({ ...f, yearFrom: e.target.value === "" ? undefined : Number(e.target.value) }))} />
                    </div>
                    <div className="grid gap-1">
                        <Label htmlFor="book-filter-year-to">Year to</Label>
                        <Input id="book-filter-year-to" type="number" min={0} max={2100} value={draftFilters.yearTo ?? ""}
                            onChange={(e) => setDraftFilters(f => ({ ...f, yearTo: e.target.value === "" ? undefined : Number(e.target.value) }))} />
                    </div>
                    <div className="grid gap-1">
                        <Label>Sort</Label>
                        <Select value={draftFilters.sort ?? "relevance"}
                            onValueChange={(v) => setDraftFilters(f => ({ ...f, sort: v as BookSort }))}>
                            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {SORTS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="col-span-2 md:col-span-3 flex justify-end">
                        <Button variant="amber" onClick={() => applyFilters(draftFilters)}>Apply</Button>
                    </div>
                </div>
            )}

            {/* Results */}
            <div className="p-4 flex-1 overflow-y-auto min-h-0 scrollbar-hide border-t border-border">
                {isLoading && <p className="animate-pulse">{loadingLine}</p>}
                {error && 
                    <p className="text-destructive">
                        {error.message}
                    </p>
                }

                {results.length > 0 && (
                    <div className="flex items-center justify-between gap-2 mb-3">
                        <p className="text-xs text-muted-foreground">
                            {hideLogged && hiddenCount > 0 ? `${hiddenCount} logged result${hiddenCount === 1 ? "" : "s"} hidden` : ""}
                        </p>
                        <div className="flex items-center gap-2">
                            <ViewControls view={view} onView={setView} />
                            <Button size="sm" variant="outline" onClick={toggleHideLogged} aria-pressed={hideLogged}>
                            {hideLogged ? "Showing unlogged only" : "Hide logged"}
                        </Button>
                        </div>
                    </div>
                )}

                {results.length > 0 ? (
                <div className="grid gap-4">
                    <ResultList
                        results={visibleResults}
                        view={view}
                        kindOf={() => "book"}
                        isLogged={(item) => isResultLogged(logs, item)}
                        onLog={handleLogClick}
                    />

                    {hideLogged && visibleResults.length === 0 && (
                        <EmptyState line={EMPTY_LINES.allHidden}>
                            <p>All loaded results are already logged.</p>
                        </EmptyState>
                    )}

                    {hasNextPage && (
                        <Button variant={"amber"} onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
                            {isFetchingNextPage ? "Loading more..." : "More books"}
                        </Button>
                    )}
                </div>
                ) : (
                !isLoading && !error && query !== "" && (
                    <EmptyState line={EMPTY_LINES.noResults}><p>No results</p></EmptyState>
                )
                )}
            </div>

            <EntityDialog 
                mode={targetLog ? "edit" : "create"}
                open={openDialog === "logForm"}
                onOpenChange={(isOpen) => setOpenDialog(isOpen ? "logForm" : null)}
                target={targetLog ?? undefined}
                onSubmit={handleSubmit}
                renderForm={renderLogForm}
            />
        </div>
    )
}