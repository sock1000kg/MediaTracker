// Single import point for the generated Prisma client (Prisma 7 generates into src/generated/prisma).
import { Prisma, PrismaClient } from "@/generated/prisma/client.js"
import { IdSource, MediaSubtype, LogStatus, ApiKeyService } from "@/generated/prisma/enums.js"

export * from "@/generated/prisma/client.js"
export { IdSource, MediaSubtype, LogStatus, ApiKeyService }

/** A full client or an interactive-transaction client; both expose the model delegates. */
export type DbClient = PrismaClient | Prisma.TransactionClient

const ID_SOURCE_VALUES = new Set<string>(Object.values(IdSource))

export function toIdSource(val: unknown): IdSource | null {
    if (typeof val !== "string") return null
    const p = val.trim().toLowerCase()
    if (!p) return null
    if (ID_SOURCE_VALUES.has(p)) {
        return p as IdSource
    }
    return null
}

const MEDIA_SUBTYPE_VALUES = new Set<string>(Object.values(MediaSubtype))

export function toMediaSubtype(val: unknown): MediaSubtype | null {
    if (typeof val !== "string") return null
    const s = val.trim().toLowerCase()
    if (!s) return null
    if (MEDIA_SUBTYPE_VALUES.has(s)) {
        return s as MediaSubtype
    }
    return null
}

export function toLogStatus(val: unknown): LogStatus | null {
    if (typeof val !== "string") return null
    const s = val.trim().toLowerCase()
    if (!s) return null
    if (s === "completed") return LogStatus.completed
    if (s === "wishlist") return LogStatus.wishlist
    if (s === "dropped") return LogStatus.dropped
    if (s === "in progress" || s === "in_progress") return LogStatus.in_progress
    return null
}

export function fromLogStatus(val: LogStatus | null | undefined): string | null {
    if (!val) return null
    if (val === LogStatus.in_progress) return "in progress"
    return val
}

const API_KEY_SERVICE_VALUES = new Set<string>(Object.values(ApiKeyService))

export function toApiKeyService(val: unknown): ApiKeyService | null {
    if (typeof val !== "string") return null
    const s = val.trim().toLowerCase()
    if (!s) return null
    if (API_KEY_SERVICE_VALUES.has(s)) {
        return s as ApiKeyService
    }
    return null
}
