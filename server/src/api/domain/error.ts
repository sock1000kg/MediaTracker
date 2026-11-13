export class AppError extends Error {
    status: number
    /** For auth refresh failures: false when the refresh cookie must be left alone (e.g. already rotated by a concurrent request). */
    clearSession: boolean

    constructor(message: string, status = 400, options: { clearSession?: boolean } = {}) {
        super(message)
        this.status = status
        this.clearSession = options.clearSession ?? true
    }
}
