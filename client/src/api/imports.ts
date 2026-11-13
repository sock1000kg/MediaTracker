import { ApiError, apiFetch } from "./clientWrapper";

/** Thrown when an import is already running; `jobId` is the running job to attach to. */
export class ImportAlreadyRunningError extends ApiError {
    jobId: string
    constructor(message: string, jobId: string) {
        super(message, 409, { message, jobId })
        this.name = "ImportAlreadyRunningError"
        this.jobId = jobId
    }
}

export async function startGoodreadsImport(file: File): Promise<{ jobId: string }> {
    const formData = new FormData()
    formData.append('file', file) // Must match the backend field name ("file")
    try {
        return await apiFetch<{ jobId: string }>('/imports/goodreads', {
            method: 'POST',
            body: formData
        })
    } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
            const jobId = (e.data as { jobId?: unknown } | undefined)?.jobId
            if (typeof jobId === "string") throw new ImportAlreadyRunningError(e.message, jobId)
        }
        throw e
    }
}
