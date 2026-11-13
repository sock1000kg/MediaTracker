import bcrypt from "bcryptjs"
import prisma from "@/prismaClient.js"
import { Prisma } from "@prisma/client"
import { AppError } from "@/api/domain/error.js"
import { validateSchema, toCsv, safeFilenamePart, attachmentHeader } from "@/utilities.js"
import { demoService } from "@/services/demoService.js"
import { authService } from "@/services/authService.js"
import {
    changePasswordSchema, deleteAccountSchema, MAX_PREFS_BYTES, mergePreferences,
    preferencesPatchSchema, preferencesSchema, readPreferences, updateProfileSchema,
} from "@/schemas/userSchemas.js"
import * as repo from "@/repositories/userRepository.js"

type MediaLike = {
    title: string; creator: string | null; year: number | null; source: string | null; sourceId: string | null
    description: string | null; imageUrl: string | null; metadata: unknown; mediaType: { name: string } | null
}

const mediaJson = (m: MediaLike) => ({
    title: m.title, creator: m.creator, year: m.year, type: m.mediaType?.name ?? null,
    source: m.source, sourceId: m.sourceId, description: m.description, imageUrl: m.imageUrl, metadata: m.metadata,
})

export class UserService {
    async getMe(userId: number) {
        const user = await repo.getUserProfile(userId)
        if (!user) throw new AppError("User not found", 404)
        return { ...user, preferences: readPreferences(user.preferences) }
    }

    async updateProfile(userId: number, body: unknown) {
        await demoService.ensureNotDemo(userId)
        const { displayName } = validateSchema(updateProfileSchema, body)
        const user = await repo.updateDisplayName(userId, displayName)
        return { ...user, preferences: readPreferences(user.preferences) }
    }

    async changePassword(userId: number, body: unknown) {
        await demoService.ensureNotDemo(userId)
        const { currentPassword, newPassword } = validateSchema(changePasswordSchema, body)
        const user = await repo.getUserWithPassword(userId)
        if (!user) throw new AppError("User not found", 404)
        // 403, not 401: the client treats 401 as an expired session
        if (!bcrypt.compareSync(currentPassword, user.password)) {
            throw new AppError("Current password is incorrect", 403)
        }
        const hash = bcrypt.hashSync(newPassword, 12)
        return prisma.$transaction(async (tx) => {
            await repo.updatePassword(userId, hash, tx)
            await repo.deleteAllRefreshTokensForUser(userId, tx)
            return authService.issueSession(userId, tx)
        })
    }

    async getPreferences(userId: number) {
        return (await this.getMe(userId)).preferences
    }

    // Allowed on the demo account: harmless, and the demo reset wipes it anyway.
    async updatePreferences(userId: number, body: unknown) {
        if (Buffer.byteLength(JSON.stringify(body ?? null)) > MAX_PREFS_BYTES) {
            throw new AppError("Preferences payload too large (max 4 KB)", 413)
        }
        const patch = validateSchema(preferencesPatchSchema, body)
        const current = readPreferences(await repo.getPreferences(userId))
        const merged = validateSchema(preferencesSchema, mergePreferences(current, patch))
        if (Buffer.byteLength(JSON.stringify(merged)) > MAX_PREFS_BYTES) {
            throw new AppError("Preferences too large (max 4 KB)", 413)
        }
        await repo.setPreferences(userId, merged as Prisma.InputJsonValue)
        return merged
    }

    // Allowed on demo.
    async exportData(userId: number, format: "json" | "csv") {
        const user = await repo.getUserProfile(userId)
        if (!user) throw new AppError("User not found", 404)
        const data = await repo.getExportData(userId)
        const date = new Date().toISOString().slice(0, 10)
        const base = `media-tracker-${safeFilenamePart(user.username)}-${date}`
        const realBase = `media-tracker-${user.username}-${date}`
        const disposition = (ext: string) => attachmentHeader(`${base}.${ext}`, `${realBase}.${ext}`)

        if (format === "csv") {
            const header = ["title", "creator", "year", "type", "source", "source_id", "status", "rating", "notes", "logged_at", "categories", "url"]
            const rows = data.logs.map((l) => {
                const meta = (l.media.metadata && typeof l.media.metadata === "object" ? l.media.metadata : {}) as Record<string, unknown>
                const cats = Array.isArray(meta.categories) ? meta.categories.filter((c) => typeof c === "string").join("; ") : ""
                const url = typeof meta.url === "string" ? meta.url : ""
                return [
                    l.media.title, l.media.creator, l.media.year, l.media.mediaType?.name ?? null,
                    l.media.source, l.media.sourceId, l.status, l.rating, l.notes,
                    l.logged_at.toISOString(), cats, url,
                ]
            })
            return { body: toCsv([header, ...rows]), contentType: "text/csv; charset=utf-8", filename: `${base}.csv`, disposition: disposition("csv") }
        }

        const out = {
            exportedAt: new Date().toISOString(),
            version: 1,
            user: { username: user.username, displayName: user.displayName, created_at: user.created_at },
            preferences: readPreferences(user.preferences),
            mediaTypes: data.mediaTypes.map((t) => ({ name: t.name, created_at: t.created_at })),
            media: data.media.map((m) => ({ ...mediaJson(m), created_at: m.created_at })),
            logs: data.logs.map((l) => ({
                status: l.status, rating: l.rating, notes: l.notes, logged_at: l.logged_at, media: mediaJson(l.media),
            })),
        }
        return { body: JSON.stringify(out, null, 2), contentType: "application/json; charset=utf-8", filename: `${base}.json`, disposition: disposition("json") }
    }

    async deleteAccount(userId: number, body: unknown) {
        await demoService.ensureNotDemo(userId)
        const user = await repo.getUserWithPassword(userId)
        if (!user) throw new AppError("User not found", 404)
        if (user.username === "system") throw new AppError("The system account cannot be deleted", 400)
        const { password, confirmUsername } = validateSchema(deleteAccountSchema, body)
        if (confirmUsername !== user.username) throw new AppError("Username does not match", 400)
        if (!bcrypt.compareSync(password, user.password)) throw new AppError("Password is incorrect", 403)
        await prisma.$transaction(async (tx) => { await repo.deleteUserById(userId, tx) })
    }
}

export const userService = new UserService()
