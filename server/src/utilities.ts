import '@/env.js'
import { Prisma } from "@/db.js"
import { ZodSchema, ZodError } from "zod"
import crypto from "crypto"
import { LIMITS } from "@/config/limits.js"

// USERS
// password strength check
export function checkPasswordStrength(password: string | undefined | null): boolean {
    if (!password) return false
    // At least 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special char
    return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>]).{8,}$/.test(password)
}
// Sanitize username: max 30 chars, min 3 chars
export function sanitizeUsername(username: string | undefined | null): string | null {
    if (!username) return null
    let clean = String(username).trim().slice(0, 30)

    // Reject if contains any whitespace (spaces, tabs, etc.)
    if (/\s/.test(clean)) return null

    // Require at least 3 chars and at most 50
    if (clean.length > 50) clean = clean.slice(0, 50)

    return clean.length >= 3 ? clean : null
}

export function sanitizeDisplayName(name: unknown): string | null {
    if (typeof name !== "string") return null

    // Trim whitespace and collapse multiple spaces
    let clean = name.trim().replace(/\s+/g, " ")

    // Require at least 3 chars and at most 50
    if (clean.length > 50) clean = clean.slice(0, 50)

    return clean.length >= 3 ? clean : null
}

//Used in Media Type and Media to normalize names of media types
export function normalizeTypeName(name: string | null | undefined): string {
    // Sanitize name: no extra spaces, lowercase
    if (typeof name !== "string") return ""
    const trimmed = name.trim().toLowerCase()
    return trimmed
}

//MEDIA
// Sanitize rating between 0 and 100
export function sanitizeRating(rating: number | string | undefined | null): number | null {
    if (rating === undefined || rating === null) return null

    const num = Number(rating)
    if (isNaN(num)) return null
    if (num < 0 || num > 100) return null // ignore invalid
    return num
}

// Long enough for imported reviews (Goodreads, Letterboxd) to survive whole. Keep in sync with client/src/lib/logView.ts.
export const MAX_NOTES_LENGTH = LIMITS.notes.maxLength

// Sanitize notes: trim whitespace, limit length to MAX_NOTES_LENGTH chars
export function sanitizeNotes(notes: string | undefined | null): string | null{
    if (!notes) return null
    return String(notes).trim().slice(0, MAX_NOTES_LENGTH)
}

// Sanitize title: trim, limit length to 100 chars
export function sanitizeTitle(title: string | undefined | null): string | null {
    if (!title) return null

    title = String(title).trim().slice(0, 100)
    if(title === "") return null

    return title
}

// Sanitize creator: trim, limit length to 100 chars
export function sanitizeCreator(creator: string | undefined | null): string | null {
    if (!creator) return null
    return String(creator).trim().slice(0, 100)
}

// Sanitize status: only allow known statuses
export const allowedStatuses = ["completed", "in progress", "wishlist", "dropped"] as const //declare as array to check if status belongs there
export type AllowedStatus = (typeof allowedStatuses)[number]
export function sanitizeStatus(status: string | undefined | null): AllowedStatus | null {
  if (status === undefined || status === null) return null

  const cleaned = String(status).trim().toLowerCase()
  return allowedStatuses.includes(cleaned as AllowedStatus) ? (cleaned as AllowedStatus) : null
}

// Sanitize year: convert to number, allow any integer
export function sanitizeYear(year: number | string | undefined | null): number | null {
    if (year == null) return null
    const num = Number(year)
    return Number.isInteger(num) ? num : null
}

// Sanitize details: make sure it's valid JSON/object
export function sanitizeDetails(input: unknown): Prisma.JsonValue | null {
    if (input === null || input === undefined) return null

    // If it's a string, try to parse as JSON
    if (typeof input === 'string') {
        try {
            return JSON.parse(input)
        } catch {
            return null
        }
    }

    // If it's already an object/array/primitive, make sure it's JSON-compatible
    if (typeof input === 'object') {
        try {
            return JSON.parse(JSON.stringify(input))
        } catch {
            return null
        }
    }

    // For numbers, booleans, etc.
    if (['number', 'boolean'].includes(typeof input)) return input

    return null
}
export const sanitizeMetadata = sanitizeDetails

// Sanitize description: trim whitespace, limit to 3000 chars
export function sanitizeDescription(desc: string | undefined | null): string | null {
    if (!desc) return null
    return String(desc).trim().slice(0, 3000)
}

// Sanitize image URL: require https, trim, allow null
export function sanitizeImageUrl(url: string | undefined | null): string | null {
    if (!url) return null
    const clean = String(url).trim()
    // only allow https, turns http into https
    try {
        const parsed = new URL(clean)

        // Auto-upgrade http to https
        if (parsed.protocol === "http:") {
            parsed.protocol = "https:"
        }

        // Only allow https after upgrade
        if (parsed.protocol === "https:") {
            return parsed.toString()
        }
    } catch {
        // Invalid URL
        return null
    }
    //url is valid but is not https -> gone
    return null
}

// Sanitize sourceId: trim, max 200 chars
export function sanitizeSourceId(id: string | undefined | null): string | null {
    if (!id) return null
    return String(id).trim().slice(0, 200)
}

// Long enough for a TMDB v4 read access token (a ~240-270 char JWT)
export const MAX_API_KEY_LENGTH = LIMITS.apiKeys.maxLength

// Sanitize Api Key: trim; keys longer than MAX_API_KEY_LENGTH are rejected (null), never truncated
export function sanitizeApiKey(key: string | undefined | null): string | null {
    if(key === null || key === undefined) return null
    const trimmed = key.trim()
    return trimmed.length > MAX_API_KEY_LENGTH ? null : trimmed
}

export function sanitizeQuery(query: string | undefined | null): string | null {
    if (!query) return null

    query = String(query).trim().slice(0, LIMITS.search.queryMaxLength)
    if(query === "") return null

    return query
}

// Validate Zod schema
export function validateSchema<T>(schema: ZodSchema<T>, data: unknown): T {
    const result = schema.safeParse(data)
    if (!result.success) {
        const firstError = result.error.issues[0]?.message || "Validation failed"
        throw new ZodError([{ ...result.error.issues[0], message: firstError }])
    }
    return result.data
}

// API KEY ENCRYPTION
const ALGO = "aes-256-gcm"
const SECRET = crypto.createHash("sha256").update(process.env.API_KEY_SECRET!).digest()
export function encryptKey(key: string) {
    const iv = crypto.randomBytes(16)
    
    const cipher = crypto.createCipheriv(ALGO, Buffer.from(SECRET), iv)
    let encrypted = cipher.update(key, "utf8", "hex")
    encrypted += cipher.final("hex")
    const authTag = cipher.getAuthTag().toString("hex")
    return `${iv.toString("hex")}:${authTag}:${encrypted}`
}

export function decryptKey(stored: string) {
    const [ivHex, authTagHex, encrypted] = stored.split(":")
    
    const decipher = crypto.createDecipheriv(ALGO, Buffer.from(SECRET), Buffer.from(ivHex, "hex"))
    decipher.setAuthTag(Buffer.from(authTagHex, "hex"))
    let decrypted = decipher.update(encrypted, "hex", "utf8")
    decrypted += decipher.final("utf8")

    return decrypted
}


// API usage header
export function createUserAgentHeader(): RequestInit {
    const contact = process.env.CONTACT_EMAIL || "not-main-dev"
    const version = process.env.VERSION || "not-prod"
    return {
        headers: {
            "User-Agent": `MediaTracker/${version} (${contact})`
        }
    }
}
// CSV
const CSV_FORMULA_CHARS = /^[=+\-@\t\r]/

// Build an RFC 4180-style CSV (CRLF, UTF-8 BOM). Strings starting with a formula
// character get a leading `'` (formula injection guard); numbers are left as is.
export function toCsv(rows: (string | number | null | undefined)[][]): string {
    const cell = (v: string | number | null | undefined): string => {
        if (v === null || v === undefined) return ""
        let s = String(v)
        if (typeof v === "string" && CSV_FORMULA_CHARS.test(s)) s = `'${s}`
        if (/[",\r\n]/.test(s) || s !== s.trim() || /^ | $/.test(s)) {
            s = `"${s.replace(/"/g, '""')}"`
        }
        return s
    }
    return "﻿" + rows.map(r => r.map(cell).join(",")).join("\r\n") + "\r\n"
}

// Content-Disposition helpers
// Replace anything outside [A-Za-z0-9._-] with `_`; "user" if nothing meaningful is left
export function safeFilenamePart(s: string): string {
    const safe = s.replace(/[^A-Za-z0-9._-]/g, "_")
    return /^[_.]*$/.test(safe) ? "user" : safe
}

// attachment header with ASCII fallback `filename` and RFC 5987 `filename*` (real name)
export function attachmentHeader(asciiName: string, realName: string): string {
    const encoded = encodeURIComponent(realName).replace(/['()*!]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
    return `attachment; filename="${asciiName}"; filename*=UTF-8''${encoded}`
}

// Lives in its own import-free module so test setup files can use it before dotenv has loaded
export { redactUrl } from "./redactUrl.js"


/**
 * Parses an import date: "YYYY/MM/DD" (Goodreads) or ISO "YYYY-MM-DD[THH:mm...]".
 * Returns null for anything missing, malformed or not a real calendar date.
 */
export function parseImportDate(value: unknown): Date | null {
    if (typeof value !== "string") return null
    const m = /^(\d{4})[/-](\d{2})[/-](\d{2})(?:[T ].*)?$/.exec(value.trim())
    if (!m) return null
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
    const date = new Date(Date.UTC(y, mo - 1, d, 12))
    if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null
    if (value.trim().length > 10) {
        const full = new Date(value.trim())
        return Number.isNaN(full.getTime()) ? null : full
    }
    return date
}

/**
 * Normalizes an ISO date or datetime string (or Date object) to day precision:
 * noon UTC (12:00:00.000Z) of the given calendar date, so time zones never flip the day.
 * Returns null if input is null, empty or not a valid date.
 */
export function toDayPrecision(val: unknown): Date | null {
    if (val === null || val === undefined) return null
    if (val instanceof Date) {
        if (Number.isNaN(val.getTime())) return null
        return new Date(Date.UTC(val.getUTCFullYear(), val.getUTCMonth(), val.getUTCDate(), 12))
    }
    if (typeof val !== "string") return null
    const trimmed = val.trim()
    if (!trimmed) return null
    const m = /^(\d{4})[/-](\d{2})[/-](\d{2})(?:[T ].*)?$/.exec(trimmed)
    if (!m) return null
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
    const date = new Date(Date.UTC(y, mo - 1, d, 12))
    if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null
    return date
}

// TAGS
export const MAX_TAG_LENGTH = LIMITS.tags.maxLength
export const MAX_TAGS_PER_LOG = LIMITS.tags.maxPerLog
export const MAX_TAGS_PER_USER = LIMITS.tags.maxPerUser

/**
 * Normalizes a tag name:
 * - strips leading '#'
 * - collapses inner whitespace
 * - trims
 * Valid names are 1–40 characters and contain no commas.
 * Returns null if invalid.
 */
export function normalizeTagName(raw: unknown): string | null {
    if (typeof raw !== "string") return null
    let s = raw.trim()
    while (s.startsWith("#")) {
        s = s.slice(1).trim()
    }
    s = s.replace(/\s+/g, " ")
    if (s.length < 1 || s.length > MAX_TAG_LENGTH) return null
    if (s.includes(",")) return null
    return s
}

export function tagKey(name: string): string {
    return name.toLowerCase()
}

// COLLECTIONS
export const MAX_COLLECTION_NAME_LENGTH = LIMITS.collections.nameMaxLength
export const MAX_COLLECTION_DESC_LENGTH = LIMITS.collections.descMaxLength
export const MAX_COLLECTIONS_PER_USER = LIMITS.collections.maxPerUser
export const MAX_ITEMS_PER_COLLECTION = LIMITS.collections.maxItemsPerCollection

export function normalizeCollectionName(raw: unknown): string | null {
    if (typeof raw !== "string") return null
    const s = raw.trim().replace(/\s+/g, " ")
    if (s.length < 1 || s.length > MAX_COLLECTION_NAME_LENGTH) return null
    return s
}

export function collectionKey(name: string): string {
    return name.toLowerCase()
}

export function sanitizeCollectionDescription(raw: unknown): string | null {
    if (raw === null || raw === undefined) return null
    if (typeof raw !== "string") return null
    const s = raw.trim()
    return s.length === 0 ? null : s
}


