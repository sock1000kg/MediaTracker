export class AppError extends Error {
    status: number
    /** For auth refresh failures: false when the refresh cookie must be left alone (e.g. already rotated by a concurrent request). */
    clearSession: boolean
    /** What actually went wrong (upstream status, network error…). Logged for 5xx, never sent to the client. */
    cause?: unknown

    constructor(message: string, status = 400, options: { clearSession?: boolean, cause?: unknown } = {}) {
        super(message)
        this.status = status
        this.clearSession = options.clearSession ?? true
        if (options.cause !== undefined) this.cause = options.cause
    }
}
