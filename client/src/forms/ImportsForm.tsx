import { startGoodreadsImport, startMalImport, startLetterboxdImport, ImportAlreadyRunningError } from "@/api/imports"
import { fetchJob, fetchJobs } from "@/api/jobs"
import { fetchApiKeysQueryOptions } from "@/queryOptions/fetchApiKeysQueryOptions"
import { ApiError } from "@/api/clientWrapper"
import { Button } from "@/components/ui/button"
import { importAnnouncement, importStatusLabel, INITIAL_ANNOUNCED, type AnnouncedState, isRunning, isTerminal } from "@/lib/jobs"
import { fetchLogsQueryOptions } from "@/queryOptions/fetchLogsQueryOptions"
import type { ImportResult } from "@/types/imports"
import type { JobInfo } from "@/types/jobs"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"

interface ImportCardProps {
    title: string
    formats: string
    accept: string
    jobName: "import.goodreads" | "import.mal" | "import.letterboxd"
    startImport: (file: File) => Promise<{ jobId: string }>
    extraHint?: React.ReactNode
}

function ImportCard({
    title,
    formats,
    accept,
    jobName,
    startImport,
    extraHint,
}: ImportCardProps) {
    const queryClient = useQueryClient()

    // state to manage file selection and result display
    const [selectedFile, setSelectedFile] = useState<File | null>(null)
    const [jobId, setJobId] = useState<string | null>(null)
    const [serverMessage, setServerMessage] = useState<string | null>(null)
    const [lostTrack, setLostTrack] = useState(false)
    const [announcement, setAnnouncement] = useState("")
    const resumedRef = useRef(false)
    const refreshedJobRef = useRef<string | null>(null)
    const announcedRef = useRef<AnnouncedState>(INITIAL_ANNOUNCED)

    // Resume: if the newest import job is still running, attach to it. Old finished summaries aren't shown.
    const latestQuery = useQuery({
        queryKey: ["jobs", jobName, "latest"],
        queryFn: () => fetchJobs(jobName, 1),
        staleTime: 0,
        gcTime: 0,
    })
    useEffect(() => {
        if (resumedRef.current || !latestQuery.data) return
        resumedRef.current = true
        const newest = latestQuery.data[0]
        if (newest && isRunning(newest.status)) setJobId(newest.id)
    }, [latestQuery.data])

    const jobQuery = useQuery<JobInfo, Error>({
        queryKey: ["job", jobId],
        queryFn: () => fetchJob(jobId!),
        enabled: !!jobId,
        retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 3,
        refetchInterval: (q) => (isTerminal(q.state.data?.status) ? false : 1000),
    })
    const job = jobId ? jobQuery.data : undefined
    const notFound = jobQuery.error instanceof ApiError && jobQuery.error.status === 404

    // Expired or unknown job: stop polling and tell the user where to look
    useEffect(() => {
        if (jobId && notFound) {
            setJobId(null)
            setLostTrack(true)
        }
    }, [jobId, notFound])

    // Refresh the logs once per completed job
    useEffect(() => {
        if (job?.status === "completed" && refreshedJobRef.current !== job.id) {
            refreshedJobRef.current = job.id
            queryClient.refetchQueries({ queryKey: fetchLogsQueryOptions().queryKey })
        }
    }, [job?.status, job?.id, queryClient])

    // Screen reader updates: status changes, and progress only at 25/50/75/100 %
    useEffect(() => {
        if (!job) return
        const { text, next } = importAnnouncement(announcedRef.current, job)
        announcedRef.current = next
        if (text) setAnnouncement(text)
    }, [job])

    const startMutation = useMutation({
        mutationFn: startImport,
        onSuccess: ({ jobId: id }) => {
            setJobId(id)
            setLostTrack(false)
            setServerMessage(null)
            setSelectedFile(null)
        },
        onError: (error: Error) => {
            if (error instanceof ImportAlreadyRunningError) {
                // Attach to the import that is already running
                setJobId(error.jobId)
                setLostTrack(false)
                setServerMessage(null)
                return
            }
            setServerMessage(error.message || "Import failed")
            setTimeout(() => setServerMessage(null), 3000)
        }
    })

    const busy = startMutation.isPending || (!!jobId && (!job || isRunning(job.status)))
    const importResult = job?.status === "completed" ? (job.result as ImportResult | null) : null
    const truncated = importResult?.failuresTruncated ?? 0

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setSelectedFile(e.target.files[0])
            setServerMessage(null)
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedFile || busy) return
        // Picking a new file starts a new import: drop the previous job's summary
        setJobId(null)
        await startMutation.mutateAsync(selectedFile).catch(() => undefined)
    }

    return (
        <div className="bg-card rounded-lg p-4 border border-border">
            {/* One row: name and formats on the left, file picker and upload on the right */}
            <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                    <h3 className="font-semibold text-foreground text-base">{title}</h3>
                    <p className="text-muted-foreground text-xs">{formats}</p>
                </div>
                <div className="flex items-center gap-3">
                    <input
                        type="file"
                        accept={accept}
                        aria-label={`${title} export file`}
                        onChange={handleFileChange}
                        className="block w-full sm:w-72 text-sm text-muted-foreground
                            file:mr-4 file:py-2 file:px-4
                            file:rounded-md file:border-0
                            file:text-sm file:font-semibold
                            file:bg-tag file:text-tag-foreground
                            hover:file:bg-tag/70
                            border border-input rounded-md cursor-pointer"
                    />
                    <Button
                        type="submit"
                        variant="amber"
                        disabled={!selectedFile || busy}
                    >
                        {busy ? "Importing..." : "Upload"}
                    </Button>
                </div>
            </form>

            {extraHint && <div className="mt-3">{extraHint}</div>}

            {/* Always-mounted live region so announcements are picked up */}
            <p role="status" aria-live="polite" className="sr-only">{announcement}</p>

            {/* Running state */}
            {busy && (
                <div className="mt-4">
                    <p className="text-muted-foreground text-sm">
                        {job ? importStatusLabel(job) : "Starting import…"}
                    </p>
                    {job?.status === "active" && (
                        <div
                            role="progressbar"
                            aria-label="Import progress"
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={Math.round(job.progress)}
                            className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted"
                        >
                            <div
                                className="h-full bg-primary transition-[width] motion-reduce:transition-none"
                                style={{ width: `${Math.min(100, Math.max(0, job.progress))}%` }}
                            />
                        </div>
                    )}
                    <p className="text-muted-foreground text-xs mt-2">
                        You can leave this page; the import keeps going.
                    </p>
                </div>
            )}

            {/* General Error Message */}
            {serverMessage && (
                <p className="mt-3 text-sm text-destructive">
                    {serverMessage}
                </p>
            )}

            {/* Job failed */}
            {job?.status === "failed" && (
                <p className="mt-3 text-sm text-destructive">
                    {job.error || "Import failed"}
                </p>
            )}

            {/* Polling lost the job (expired / unknown) */}
            {lostTrack && (
                <p className="mt-3 text-sm text-muted-foreground">
                    Lost track of that import. Check your logs.
                </p>
            )}

            {/* RESULT REPORT CARD */}
            {importResult && (
                <div className="bg-card rounded-lg p-4 border border-border text-sm mt-4">
                    <h4 className="font-semibold text-foreground mb-2">Import Summary</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-4 text-center">
                        <div className="p-2 bg-tag rounded text-tag-foreground">
                            <span className="block text-xl font-bold">{importResult.imported}</span>
                            Imported
                        </div>
                        <div className="p-2 bg-card border border-link/40 rounded text-link">
                            <span className="block text-xl font-bold">{importResult.skipped}</span>
                            Skipped
                        </div>
                        <div className="p-2 bg-accent rounded text-accent-foreground">
                            <span className="block text-xl font-bold">{importResult.updated}</span>
                            Updated
                        </div>
                        <div className={`p-2 rounded ${importResult.failures.length > 0 ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'}`}>
                            <span className="block text-xl font-bold">{importResult.failures.length}</span>
                            Failed
                        </div>
                    </div>

                    {/* Unmatched note when unmatched > 0 and not already in notes */}
                    {importResult.unmatched !== undefined &&
                        importResult.unmatched > 0 &&
                        (!importResult.notes || !importResult.notes.some(n => n.includes("couldn't be matched to TMDB"))) && (
                            <p className="text-xs text-muted-foreground mb-3">
                                {importResult.unmatched} films couldn't be matched to TMDB and were added by title.
                            </p>
                        )}

                    {/* Notes (e.g. entries without covers) */}
                    {importResult.notes && importResult.notes.length > 0 && (
                        <div className="mb-3 space-y-1 text-xs text-muted-foreground">
                            {importResult.notes.map((note, idx) => (
                                <p key={idx}>{note}</p>
                            ))}
                        </div>
                    )}

                    {/* DETAILED FAILURE LIST */}
                    {importResult.failures.length > 0 && (
                        <div className="mt-4">
                            <p className="font-semibold text-destructive mb-2">Error Details:</p>
                            <div className="max-h-40 overflow-y-auto bg-card border rounded p-2 text-xs">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="border-b text-muted-foreground">
                                            <th className="py-1 w-12">Row</th>
                                            <th className="py-1">Title</th>
                                            <th className="py-1">Reason</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {importResult.failures.map((fail, idx) => (
                                            <tr key={idx} className="border-b last:border-0 hover:bg-destructive/10">
                                                <td className="py-1 text-muted-foreground">{fail.row === -1 ? "-" : fail.row}</td>
                                                <td className="py-1 font-medium truncate max-w-[150px]" title={fail.title}>
                                                    {fail.title}
                                                </td>
                                                <td className="py-1 text-destructive truncate max-w-[200px]" title={fail.reason}>
                                                    {fail.reason}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                    {truncated > 0 && (
                        <p className="mt-2 text-xs text-muted-foreground">…and {truncated} more</p>
                    )}
                </div>
            )}
        </div>
    )
}

interface ImportsFormProps {
    onNavigateToApiKeys?: () => void
}

export function ImportsForm({ onNavigateToApiKeys }: ImportsFormProps = {}) {
    const { data: apiKeys } = useQuery(fetchApiKeysQueryOptions())
    const hasTmdbKey = apiKeys?.some(k => k.service === "tmdb")
    const hasNoTmdbKey = apiKeys !== undefined && !hasTmdbKey

    const tmdbHint = hasNoTmdbKey ? (
        <p className="text-xs text-muted-foreground">
            No TMDB key found. Unmatched films won&apos;t have posters or metadata. Add one under{" "}
            <button
                type="button"
                onClick={onNavigateToApiKeys}
                className="text-primary underline hover:text-primary/80 focus:outline-none"
            >
                Settings → API Keys
            </button>
            .
        </p>
    ) : null

    return (
        <div className="px-4">
            {/* Info Text */}
            <p className="text-muted-foreground text-sm">
                Import your library from an export.
            </p>
            <p className="text-muted-foreground text-xs mb-6">
                The imported medias will not be in the &apos;Your Medias&apos; tab
            </p>

            <div className="flex flex-col gap-3">
                <ImportCard
                    title="Goodreads"
                    formats=".csv"
                    accept=".csv"
                    jobName="import.goodreads"
                    startImport={startGoodreadsImport}
                />

                <ImportCard
                    title="MyAnimeList"
                    formats=".xml or .xml.gz, anime or manga list"
                    accept=".xml,.gz,application/xml,application/gzip"
                    jobName="import.mal"
                    startImport={startMalImport}
                />

                <ImportCard
                    title="Letterboxd"
                    formats=".zip (ratings, diary, watchlist, likes and your lists)"
                    accept=".zip,application/zip"
                    jobName="import.letterboxd"
                    startImport={startLetterboxdImport}
                    extraHint={tmdbHint}
                />
            </div>
        </div>
    )
}
