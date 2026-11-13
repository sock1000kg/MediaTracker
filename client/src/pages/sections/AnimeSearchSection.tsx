import { PageBackdrop } from "@/components/media-view/PageBackdrop"
import { effectiveHideLogged } from "@/lib/preferences"
import { usePreferences } from "@/hooks/usePreferences"
import EmptyState from "@/components/EmptyState"
import { EMPTY_LINES, pickLoadingLine } from "@/lib/whimsy"
import { Search } from "lucide-react"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"

import { searchAnime } from "@/api/search"
import { useCallback, useEffect, useRef, useState } from "react"
import { findLogForResult, isResultLogged, readStoredBool, writeStoredBool } from "@/lib/utils"
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData  } from "@tanstack/react-query"

import type { AnimeKind, AnimeResult, AnimeSort } from "@/types/search"
import { ANIME_SORT_OPTIONS, ANIME_TYPE_OPTIONS } from "@/lib/animeFormat"
import { type DialogName, type Log } from "@/types/mainTypes"

import EntityDialog from "../../components/dialogs/EntityDialog"
import { editLog } from "@/api/logs"
import { fetchLogsQueryOptions } from "@/queryOptions/fetchLogsQueryOptions"
import { fetchMediasQueryOptions } from "@/queryOptions/fetchMediasQueryOptions"
import { MediaSearchLogForm } from "@/forms/MediaSearchLogForm"
import { createMediaAndLog } from "@/api/media"
import { ResultList } from "@/components/search/ResultList"
import { ViewControls } from "@/components/media-view/ViewControls"
import { useStoredView } from "@/hooks/useStoredView"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export function AnimeSearchSection() {
  const [loadingLine] = useState(() => pickLoadingLine())
    const [openDialog, setOpenDialog] = useState<DialogName>(null)
    const [inputValue, setInputValue] = useState("")
    const [query, setQuery] = useState("")
    const [searchMode, setSearchMode] = useState<AnimeKind>("anime")
    const [type, setType] = useState("")
    const [sort, setSort] = useState<AnimeSort>("relevance")

    const [targetMedia, setTargetMedia] = useState<AnimeResult>()
    const [targetLog, setTargetLog] = useState<Log | null>(null)

    const { prefs, isLoaded: prefsLoaded, updatePrefs } = usePreferences()
    const [view, setView] = useStoredView("search.view.anime")
    const [hideLogged, setHideLogged] = useState(() => effectiveHideLogged(prefs.hideLogged?.anime, readStoredBool("hideLogged.anime")))
    const hideTouched = useRef(false)
    // Prefs arriving after mount: adopt the server value unless the toggle was used
    useEffect(() => {
        const v = prefs.hideLogged?.anime
        if (prefsLoaded && !hideTouched.current && v !== undefined) setHideLogged(v)
    }, [prefsLoaded, prefs.hideLogged?.anime])
    const toggleHideLogged = () => {
        const next = !hideLogged
        hideTouched.current = true
        setHideLogged(next)
        writeStoredBool("hideLogged.anime", next)
        updatePrefs({ hideLogged: { anime: next } })
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
        { results: AnimeResult[], nextStartIndex: number | null }, //QueryFnData
        Error, //Error
        InfiniteData<{ results: AnimeResult[], nextStartIndex: number | null }, number>, //TData
        [string, string, string, string, string], //QueryKey
        number //PageParam
    >({
        queryKey: ["searchAnime", searchMode, query, type, sort],
        queryFn: async ({ pageParam = 1 }) => {
            return searchAnime(query, pageParam, { type: type || undefined, sort: sort === "relevance" ? undefined : sort }, searchMode)
        },
        getNextPageParam: (lastPage) => {
            return lastPage.nextStartIndex
        },
        initialPageParam: 1,  
        enabled: !!query, //fires only when query isnt empty
    })

    // media and logs cache
    const { data: logs = [] } = useQuery(fetchLogsQueryOptions())

    const results = Array.from(
        new Map(
            data?.pages
                .flatMap((p) => p.results)
                .map(item => [item.sourceId, item])
        ).values()
    )

    const visibleResults = hideLogged ? results.filter(r => !isResultLogged(logs, r)) : results
    const hiddenCount = results.length - visibleResults.length

    //MUTATIONS
    const createMediaAndLogMutation = useMutation({
        mutationFn: ({ mediaData, logData }: { mediaData: AnimeResult, logData: Partial<Log> }) =>
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

    const handleSearch = () => {
        if (inputValue.trim()) {
            setQuery(inputValue.trim())
        }
    }

    const handleLogClick = (item: AnimeResult) => {
        //Check if log of this item exists already
        const existingLog = findLogForResult(logs, item)

        //set the data of the clicked media item
        const mediaData: AnimeResult = {
            ...item,
            mediaType: item.metadata.kind
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
        return <MediaSearchLogForm 
            targetMedia={targetMedia} 
            formData={formData}
            setFormData={setFormData}
        />
    }, [targetMedia])
    

    return(
        <div className="relative isolate flex flex-col h-full overflow-hidden">
            <PageBackdrop page="anime" />
            {/* Header */}
            <div className="flex flex-col gap-4 px-6 pt-6 pb-4">
                <div>
                <h1 className="font-display text-4xl font-semibold">Anime &amp; manga search</h1>
                </div>

                <div className="flex flex-wrap gap-2 items-center">
                    <Input
                        placeholder="Type a title..."
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
                    <Button size="icon" variant="amber" aria-label="Search" className="h-10 w-10 rounded-full" onClick={() => handleSearch()}>
                        <Search />
                    </Button>
                    <div className="basis-full sm:basis-auto flex flex-wrap items-center gap-2">
                    {/* MODE SELECT */}
                    <Select
                        onValueChange={(val: AnimeKind) => { setSearchMode(val); setType(""); setSort("relevance") }}
                        value={searchMode}
                    >
                        <SelectTrigger aria-label="Anime or manga" className="rounded-md border border-input bg-card focus:ring-2">
                            <SelectValue placeholder="Mode" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="anime">Anime</SelectItem>
                            <SelectItem value="manga">Manga</SelectItem>
                        </SelectContent>
                    </Select>
                    {/* TYPE SELECT */}
                    <Select onValueChange={(val) => setType(val === "any" ? "" : val)} value={type || "any"}>
                        <SelectTrigger aria-label="Type" className="rounded-md border border-input bg-card focus:ring-2">
                            <SelectValue placeholder="Type" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="any">Any type</SelectItem>
                            {ANIME_TYPE_OPTIONS[searchMode].map(o => (
                                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {/* SORT SELECT */}
                    <Select onValueChange={(val: AnimeSort) => setSort(val)} value={sort}>
                        <SelectTrigger aria-label="Sort" className="rounded-md border border-input bg-card focus:ring-2">
                            <SelectValue placeholder="Sort" />
                        </SelectTrigger>
                        <SelectContent>
                            {ANIME_SORT_OPTIONS.map(o => (
                                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    </div>
                </div>
            </div>

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
                        kindOf={(item) => item.metadata.kind}
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
                            {isFetchingNextPage ? "Loading more..." : "More"}
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

export default AnimeSearchSection