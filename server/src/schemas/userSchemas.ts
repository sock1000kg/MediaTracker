import { z } from "zod"
import { displayNameSchema, passwordSchema } from "@/schemas/authSchemas.js"

// Mirrors SortField in client/src/types/sort.ts
export const SORT_FIELDS = ["title", "creator", "rating", "status", "date", "pageCount", "categories"] as const
const TABS = ["logs", "medias", "mediaTypes", "settings", "bookSearch", "musicSearch", "animeSearch", "movieSearch", "gameSearch"] as const
const THEMES = ["light", "dark", "system"] as const
export const MAX_PREFS_BYTES = 4096

export const updateProfileSchema = z.object({ displayName: displayNameSchema }).strict()

export const changePasswordSchema = z.object({
    currentPassword: z.string().min(1),
    newPassword: passwordSchema,
}).strict().refine((v) => v.currentPassword !== v.newPassword, {
    message: "New password must be different",
})

export const deleteAccountSchema = z.object({
    password: z.string().min(1),
    confirmUsername: z.string().min(1),
}).strict()

const sortPref = z.object({ field: z.enum(SORT_FIELDS), direction: z.enum(["asc", "desc"]) }).strict()

export const preferencesSchema = z.object({
    theme: z.enum(THEMES),
    defaultTab: z.enum(TABS),
    hideLogged: z.object({ books: z.boolean(), music: z.boolean(), anime: z.boolean(), movies: z.boolean(), games: z.boolean() }).partial().strict(),
    defaultSort: z.object({ logs: z.array(sortPref).max(3), medias: z.array(sortPref).max(3) }).partial().strict(),
}).partial().strict()

// Patch: each top-level key may be null = remove it
export const preferencesPatchSchema = z.object({
    theme: z.enum(THEMES).nullable(),
    defaultTab: z.enum(TABS).nullable(),
    hideLogged: z.object({ books: z.boolean(), music: z.boolean(), anime: z.boolean(), movies: z.boolean(), games: z.boolean() }).partial().strict().nullable(),
    defaultSort: z.object({ logs: z.array(sortPref).max(3), medias: z.array(sortPref).max(3) }).partial().strict().nullable(),
}).partial().strict()

// Lenient read: bad fields dropped, unknown keys stripped
const lenientSort = z.array(sortPref).max(3).optional().catch(undefined)
export const preferencesReadSchema = z.object({
    theme: z.enum(THEMES).optional().catch(undefined),
    defaultTab: z.enum(TABS).optional().catch(undefined),
    hideLogged: z.object({
        books: z.boolean().optional().catch(undefined),
        music: z.boolean().optional().catch(undefined),
        anime: z.boolean().optional().catch(undefined),
        movies: z.boolean().optional().catch(undefined),
        games: z.boolean().optional().catch(undefined),
    }).optional().catch(undefined),
    defaultSort: z.object({
        logs: lenientSort,
        medias: lenientSort,
    }).optional().catch(undefined),
})

export type Preferences = z.infer<typeof preferencesSchema>

function stripUndefined<T>(v: T): T {
    if (Array.isArray(v)) return v as T
    if (v && typeof v === "object") {
        const out: Record<string, unknown> = {}
        for (const [k, val] of Object.entries(v)) {
            if (val === undefined) continue
            const c = stripUndefined(val)
            out[k] = c
        }
        return out as T
    }
    return v
}

export function readPreferences(raw: unknown): Preferences {
    const parsed = preferencesReadSchema.safeParse(raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {})
    return parsed.success ? stripUndefined(parsed.data) as Preferences : {}
}

export function mergePreferences(current: Preferences, patch: z.infer<typeof preferencesPatchSchema>): Preferences {
    const merged: Record<string, unknown> = { ...current }
    for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) continue
        if (value === null) { delete merged[key]; continue }
        if (key === "hideLogged" || key === "defaultSort") {
            merged[key] = { ...(merged[key] as object | undefined), ...(value as object) }
        } else {
            merged[key] = value
        }
    }
    return merged as Preferences
}
