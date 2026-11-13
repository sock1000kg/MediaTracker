import { startGoodreadsImport, ImportAlreadyRunningError } from "@/api/imports"
import { fetchJob, fetchJobs } from "@/api/jobs"
import { ApiError } from "@/api/clientWrapper"
import { Button } from "@/components/ui/button"
import { importAnnouncement, importStatusLabel, INITIAL_ANNOUNCED, type AnnouncedState, isRunning, isTerminal } from "@/lib/jobs"
import { fetchLogsQueryOptions } from "@/queryOptions/fetchLogsQueryOptions"
import type { ImportResult } from "@/types/imports"
import type { JobInfo } from "@/types/jobs"
import { Label } from "@radix-ui/react-label"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"

const IMPORT_JOB = "import.goodreads"

export function ImportsForm() {
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
        queryKey: ["jobs", IMPORT_JOB, "latest"],
        queryFn: () => fetchJobs(IMPORT_JOB, 1),
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
        mutationFn: startGoodreadsImport,
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
        <div className="px-4">
            {/* Info Text */}
            <p className="text-muted-foreground text-sm">
                Import your library from an export.
            </p>
            <p className="text-muted-foreground text-xs mb-4">
                The imported medias will not be in the 'Your Medias' tab
            </p>

            {/* Always-mounted live region so announcements are picked up */}
            <p role="status" aria-live="polite" className="sr-only">{announcement}</p>

            {/* Running state */}
            {busy && (
                <div className="mb-4">
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
                <p className="text-center text-sm text-destructive mb-4">
                    {serverMessage}
                </p>
            )}

            {/* Job failed */}
            {job?.status === "failed" && (
                <p className="text-center text-sm text-destructive mb-4">
                    {job.error || "Import failed"}
                </p>
            )}

            {/* Polling lost the job (expired / unknown) */}
            {lostTrack && (
                <p className="text-sm text-muted-foreground mb-4">
                    Lost track of that import. Check your logs.
                </p>
            )}

            {/* FORM AREA */}
            <form onSubmit={handleSubmit} className="mb-6">
                <Label className="block mb-4">
                    <span className="text-foreground font-medium">Goodreads Export (.csv)</span>
                    <div className="flex gap-4 mt-1 items-center">
                        <input
                            type="file"
                            accept=".csv"
                            onChange={handleFileChange}
                            className="block w-full text-sm text-muted-foreground
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
                </Label>
            </form>

            {/* RESULT REPORT CARD */}
            {importResult && (
                <div className="bg-card rounded-lg p-4 border border-border text-sm">
                    <h3 className="font-semibold text-foreground mb-2">Import Summary</h3>
                    <div className="grid grid-cols-3 gap-4 mb-4 text-center">
                        <div className="p-2 bg-tag rounded text-tag-foreground">
                            <span className="block text-xl font-bold">{importResult.imported}</span>
                            Imported
                        </div>
                        <div className="p-2 bg-card border border-link/40 rounded text-link">
                            <span className="block text-xl font-bold">{importResult.skipped}</span>
                            Skipped
                        </div>
                        <div className={`p-2 rounded ${importResult.failures.length > 0 ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'}`}>
                            <span className="block text-xl font-bold">{importResult.failures.length}</span>
                            Failed
                        </div>
                    </div>

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

