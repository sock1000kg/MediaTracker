import { Prisma } from "@prisma/client"
import { ZodSchema, ZodError } from "zod"

// password strength check
export function checkPasswordStrength(password: string | undefined | null): boolean {
    if (!password) return false
    // At least 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special char
    return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>]).{8,}$/.test(password)
}

//Used in Media Type and Media to normalize names of media types
export function normalizeTypeName(name: string): string {
    // Sanitize name: no extra spaces, lowercase
    const trimmed = name.trim().toLowerCase()
    return trimmed
}

//INPUT SANITIZATION
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

// Validate Zod schema
export function validateSchema<T>(schema: ZodSchema<T>, data: unknown): T {
    const result = schema.safeParse(data)
    if (!result.success) {
        const firstError = result.error.issues[0]?.message || "Validation failed"
        throw new ZodError([{ ...result.error.issues[0], message: firstError }])
    }
    return result.data
}