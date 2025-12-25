import { Search } from "lucide-react"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"

import { searchAlbums, searchTracks } from "@/api/search"
import { useCallback, useState } from "react"
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData  } from "@tanstack/react-query"

import type { MusicResult } from "@/types/search"
import { type DialogName, type Log } from "@/types/mainTypes"

import EntityDialog from "../../components/dialogs/EntityDialog"
import { editLog } from "@/api/logs"
import { fetchLogsQueryOptions } from "@/queryOptions/fetchLogsQueryOptions"
import { fetchMediasQueryOptions } from "@/queryOptions/fetchMediasQueryOptions"
import { MediaSearchLogForm } from "@/forms/MediaSearchLogForm"
import { createMediaAndLog } from "@/api/media"
import { MusicCard } from "@/components/cards/MusicCard"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export function MusicSearchSection() {
    const [openDialog, setOpenDialog] = useState<DialogName>(null)
    const [inputValue, setInputValue] = useState("")
    const [query, setQuery] = useState("")
    const [searchMode, setSearchMode] = useState<"albums" | "tracks">("albums")

    const [targetMedia, setTargetMedia] = useState<MusicResult>()
    const [targetLog, setTargetLog] = useState<Log | null>(null)

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
        { results: MusicResult[], nextStartIndex: number | null }, //QueryFnData
        Error, //Error
        InfiniteData<{ results: MusicResult[], nextStartIndex: number | null }, number>, //TData
        [string, string, string], //QueryKey
        number //PageParam
    >({
        queryKey: ["searchMusic", searchMode, query],
        queryFn: async ({ pageParam = 1 }) => {
            return (searchMode === "tracks") ? searchTracks(query, pageParam) : searchAlbums(query, pageParam)
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

    //MUTATIONS
    const createMediaAndLogMutation = useMutation({
        mutationFn: ({ mediaData, logData }: { mediaData: MusicResult, logData: Partial<Log> }) =>
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

    const handleLogClick = (item: MusicResult) => {
        //Check if log of this item exists already
        const existingLog = logs.find(l => {
            if(!l.media.source && !l.media.sourceId) return false
            return l.media.sourceId === item.sourceId && l.media.source === item.source
        })

        //set the data of the clicked media item
        const mediaData: MusicResult = {
            ...item,
            mediaType: "music"
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
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex justify-between p-4 items-center bg-stone-200">
                <div>
                <p className="text-lg font-semibold">Music search</p>
                <p className="text-sm text-gray-600">Search and discover songs and albums</p>
                </div>

                <div className="flex gap-2">
                    {/* MODE SELECT */}
                    <Select 
                        onValueChange={(val: "albums" | "tracks") => setSearchMode(val)} 
                        value={searchMode}
                    >
                        <SelectTrigger className="rounded-md border border-gray-300 bg-gray-50 focus:ring-2">
                            <SelectValue placeholder="Mode" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="defaultMode" disabled className="text-gray-400">
                                Search Mode
                            </SelectItem>
                            <SelectItem value="albums">
                                Albums
                            </SelectItem>
                            <SelectItem value="tracks">
                                Tracks
                            </SelectItem>
                        </SelectContent>
                    </Select>

                    {/* SEARCH INPUT */}
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
                        className="block w-full rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm focus:ring-2 focus:outline-none "
                    />
                    <Button size="default" variant="amber" onClick={() => handleSearch()}>
                        <Search />
                    </Button>
                </div>
            </div>

            {/* Results */}
            <div className="p-4 flex-1 overflow-y-auto">
                {isLoading && <p>Loading...</p>}
                {error && 
                    <p className="text-red-500">
                        {error.message}
                    </p>
                }

                {results.length > 0 ? (
                <div className="grid gap-4">
                    {results.map((item) => {
                        return <MusicCard key={item.sourceId} book={item} onLog={(item) => handleLogClick(item)} />
                    })}

                    {hasNextPage && (
                        <Button variant={"amber"} onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
                            {isFetchingNextPage ? "Loading more..." : "More"}
                        </Button>
                    )}
                </div>
                ) : (
                !isLoading && <p>No results</p> 
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

export default MusicSearchSection