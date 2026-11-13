import { AppError } from "@/api/domain/error.js"

export const MAX_PAYLOAD_BYTES = 3 * 1024 * 1024

export function assertPayloadSize(payload: unknown): void {
    const json = JSON.stringify(payload) ?? ""
    if (Buffer.byteLength(json) > MAX_PAYLOAD_BYTES) {
        throw new AppError("Job payload too large", 413)
    }
}

/** Clamps progress to 0-100; a non-finite value (NaN, Infinity) becomes 0. */
export function clampProgress(pct: number): number {
    return Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 0
}
