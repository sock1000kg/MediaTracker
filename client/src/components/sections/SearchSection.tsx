import { Search } from "lucide-react"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { BookCard } from "../cards/BookCard"

import { createMediaAndLog, searchBooks } from "@/api/search"
import { useState } from "react"
import { useInfiniteQuery, useMutation, useQueries, useQueryClient, type InfiniteData } from "@tanstack/react-query"

import type { BookResult, MediaResults } from "@/types/searchResults"
import { Book, type DialogName, type Log, type Media } from "@/types/main"

import EntityDialog from "../dialogs/EntityDialog"
import { editLog } from "@/api/logs"
import { fetchLogsQueryOptions } from "@/queryOptions/fetchLogsQueryOptions"
import { fetchMediasQueryOptions } from "@/queryOptions/fetchMediasQueryOptions"
import { MediaSearchLogForm } from "@/forms/MediaSearchLogForm"

export default function SearchSection() {
    const [openDialog, setOpenDialog] = useState<DialogName>(null)
    const [inputValue, setInputValue] = useState("")
    const [query, setQuery] = useState("")

    const [targetMedia, setTargetMedia] = useState<Partial<Media> | null>(null)
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
    } = useInfiniteQuery<BookResult[], Error, InfiniteData<BookResult[], number>, [string, string], number>({
        queryKey: ["searchBooks", query],
        queryFn: async ({ pageParam = 0 }) => {
            return searchBooks(query, pageParam)
        },
        initialPageParam: 0,
        getNextPageParam: (lastPageBookNum, allPagesCount) => {
            if (lastPageBookNum.length < 15) return undefined
            return allPagesCount.length * 15 // allPagesCount is the number of pages * 15 => the index of the next book, not pages
        },
        enabled: !!query, //fires only when query isnt empty
    })

    // media and logs cache
    const [logsQuery, mediasQuery] = useQueries({
        queries:[
            fetchLogsQueryOptions(),
            fetchMediasQueryOptions()
        ]
    })
    const logs = logsQuery.data ?? []
    const medias = mediasQuery.data ?? []

    const results = data?.pages.flatMap((page) => page) ?? []

    //MUTATIONS
    const createMediaAndLogMutation = useMutation({
        mutationFn: ({ mediaData, logData }: { mediaData: Partial<Media>, logData: Partial<Log> }) =>
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

    const handleLogClick = (item: MediaResults) => {
        //Check if log of this item exists already
        const existingLog = logs.find(l => {
            if(!l.media.source && !l.media.sourceId) return false
            return l.media.sourceId === item.sourceId && l.media.source === item.source
        })

        //set the data of the clicked media item
        const mediaData: Partial<Media> = {
            title: item.title,
            mediaType: Book,
            source: item.source,
            sourceId: item.sourceId,
            sourceRating: item.sourceRating,
            ratingsCount: item.ratingsCount,
            creator: item.creator,
            year: item.year,
            description: item.description,
            metadata: item.metadata,
            imageUrl: item.imageUrl
        }

        setTargetMedia(mediaData)
        setTargetLog(existingLog ?? null)
        setOpenDialog("logForm")
    }

    const handleSubmit = async (formData: Partial<Log>) => {
        // If a log exists, edit it
        if(targetLog) return await editLogMutation.mutateAsync({...targetLog, ...formData})

        else {
            return await createMediaAndLogMutation.mutateAsync({
                mediaData: targetMedia!,
                logData: formData
            })
        }
    }

    // Media Form
    const renderLogForm = (
        formData: Partial<Log>,
        setFormData: React.Dispatch<React.SetStateAction<Partial<Log>>> //state setter for formData
    ) => {
        return (
            <MediaSearchLogForm 
                targetMedia={targetMedia!} 
                formData={formData}
                setFormData={setFormData}
            />
        )
    }

    return(
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex justify-between p-4 items-center bg-stone-200">
                <div>
                <p className="text-lg font-semibold">Search</p>
                <p className="text-sm text-gray-600">Search and discover medias</p>
                </div>

                <div className="flex gap-2">
                    <Input
                        placeholder="Type book name..."
                        value={inputValue}
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
                {error && <p className="text-red-500">Something went wrong</p>}

                {results.length > 0 ? (
                <div className="grid gap-4">
                    {results.map((item) => {
                        switch (item.source) {
                            case "google_books":
                                return <BookCard key={item.sourceId} book={item} onLog={(item) => handleLogClick(item)} />
                            // case "spotify":
                            //     return <MusicCard key={item.sourceId} music={item} />
                            default:
                            return null
                        }
                    })}

                    {hasNextPage && (
                        <Button variant={"amber"} onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
                            {isFetchingNextPage ? "Loading more..." : "More books"}
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