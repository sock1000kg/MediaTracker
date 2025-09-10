import { Prisma } from "@prisma/client"
import { ZodSchema, ZodError } from "zod"

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

// Sanitize notes: trim whitespace, limit length to 5000 chars
export function sanitizeNotes(notes: string | undefined | null): string | null{
    if (!notes) return null
    return String(notes).trim().slice(0, 5000)
}

// Sanitize title: trim, limit length to 100 chars
export function sanitizeTitle(title: string | undefined | null): string | null {
    if (!title) return null
    return String(title).trim().slice(0, 100)
}

// Sanitize creator: trim, limit length to 100 chars
export function sanitizeCreator(creator: string | undefined | null): string | null {
    if (!creator) return null
    return String(creator).trim().slice(0, 100)
}

// Sanitize status: only allow known statuses
const allowedStatuses = ["completed", "in progress", "wishlist", "dropped"] as const //declare as array to check if status belongs there
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

// Sanitize metadata: make sure it's valid JSON/object
export function sanitizeMetadata(input: unknown): Prisma.JsonValue | null {
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



// Sanitize description: trim whitespace, limit to 3000 chars
export function sanitizeDescription(desc: string | undefined | null): string | null {
    if (!desc) return null
    return String(desc).trim().slice(0, 3000)
}

// Sanitize source: only allow known sources (e.g., "google_books", "manual")
const allowedSources = ["google_books"] as const
export type AllowedSource = (typeof allowedSources)[number]
export function sanitizeSource(source: string | undefined | null): AllowedSource | null {
    if (!source) return null
    const clean = String(source).trim().toLowerCase()
    return allowedSources.includes(clean as AllowedSource) ? (clean as AllowedSource) : null
}

// Sanitize image URL: basic validation, trim, allow null
export function sanitizeImageUrl(url: string | undefined | null): string | null {
    if (!url) return null
    const clean = String(url).trim()
    // Very light URL check
    return /^https?:\/\//.test(clean) ? clean : null
}

// Sanitize sourceId: trim, max 200 chars
export function sanitizeSourceId(id: string | undefined | null): string | null {
    if (!id) return null
    return String(id).trim().slice(0, 200)
}

// Sanitize source rating: convert 0–100 scale
export function sanitizeSourceRating(
    rating: number | string | undefined | null,
    scale: number = 10 // fallback to 10
): number | null {
    if (rating === undefined || rating === null) return null

    const num = Number(rating)
    if (isNaN(num)) return null

    // Clamp to range
    if (num < 0 || num > scale) return null

    // Convert to 0–100 scale
    return Math.round((num / scale) * 100)
}

// Sanitize ratings count: must be non-negative integer
export function sanitizeRatingsCount(count: number | string | undefined | null): number | null {
    if (count === undefined || count === null) return null
    const num = Number(count)
    return Number.isInteger(num) && num >= 0 ? num : null
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