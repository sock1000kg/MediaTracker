import { handlePrismaError } from "@/middleWare/errorHandlerMiddleware.js"
import prisma from "@/prismaClient.js"
import {
    getAllLogs,
    createLog,
    findLogById,
    updateLog,
    deleteLog,
} from "@/repositories/logsRepository.js"

import { findMediaForUserById } from "@/repositories/mediaRepository.js"
import { findMediaTypeForUserOrGlobal } from "@/repositories/mediaTypeRepository.js"
import { tagService } from "@/services/tagService.js"
import { createLogSchema, updateLogSchema, deleteLogSchema, rejectEntryKeys, rejectLogTitle, LogEntriesChange } from "@/schemas/logSchemas.js"
import { entryInputSchema, updateEntrySchema } from "@/schemas/entrySchemas.js"
import { LIMITS } from "@/config/limits.js"
import { createEntry, updateEntry, deleteEntry, findEntriesOfLog, findEntry, countEntriesOfLog } from "@/repositories/logEntryRepository.js"
import { newestEntry, isOpenEntry } from "@/services/logEntries.js"
import { AppError } from "@/api/domain/error.js"
import { validateSchema, toDayPrecision } from "@/utilities.js"
import { DbClient } from "@/db.js"

const MAX_ENTRIES = LIMITS.logs.maxEntriesPerLog

const dayKey = (d: Date) => d.toISOString().slice(0, 10)

/** Throws when adding `adding` more entries would pass the per-log cap. */
export async function assertRoomForEntries(logId: string, adding: number, client: DbClient) {
    const count = await countEntriesOfLog(logId, client)
    if (count + adding > MAX_ENTRIES) {
        throw new AppError(`A log can't have more than ${MAX_ENTRIES} entries`, 400)
    }
}

/**
 * The automatic status rules, run after a log's status was set to `status`:
 * - "in progress" with no open entry starts a new one today;
 * - "completed" while the newest entry is open finishes it today (unless it started later).
 * Wishlist and dropped never create or close entries.
 */
export async function applyStatusToEntries(logId: string, status: string | null | undefined, client: DbClient, now = new Date()) {
    if (status !== "in progress" && status !== "completed") return
    const today = toDayPrecision(now)!
    const entries = await findEntriesOfLog(logId, client)
    const newest = newestEntry(entries)

    if (status === "in progress") {
        if (newest && isOpenEntry(newest)) return
        if (entries.length >= MAX_ENTRIES) return
        await createEntry(logId, { startedAt: today }, client)
        return
    }

    if (newest && isOpenEntry(newest) && dayKey(today) >= dayKey(newest.startedAt!)) {
        await updateEntry(newest.id, { finishedAt: today }, client)
    }
}

export class LogService {
    async getAll(userId: string) {
        return getAllLogs(userId)
    }

    async create(userId: string, payload: unknown) {
        rejectEntryKeys(payload)
        rejectLogTitle(payload)
        // Use a transaction because we might create a MediaType AND a Log
        return await prisma.$transaction(async (tx: DbClient) => {
            const { mediaId, status, rating, notes, tags, entry } = validateSchema(createLogSchema, payload)

            // Ownership check
            const media = await findMediaForUserById(mediaId, userId, tx)
            if (!media) {
                throw new AppError("Media does not exist or you do not own it", 404)
            }

            if (!media.mediaType) {
                throw new AppError("Media Type is missing from the record", 404)
            }

            // MediaType Logic (shouldnt even happen if frontend sends correctly)
            const mediaType = await findMediaTypeForUserOrGlobal(media.mediaType.name, userId, tx)
            if (!mediaType) {
                throw new AppError("Media Type does not exist", 404)
            }

            try {
                //Final Log creation
                const log = await createLog(userId, mediaId, status, rating, notes, tx)
                if (entry) {
                    await createEntry(log.id, entry, tx)
                } else {
                    await applyStatusToEntries(log.id, status, tx)
                }
                if (tags !== undefined) {
                    await tagService.resolveAndSyncTags(userId, log.id, tags, tx)
                }
                return await findLogById(log.id, tx)
            } catch (error: unknown) {
                handlePrismaError(error, {
                    uniqueMessage: "Your log of this media already exists",
                    notFoundMessage: "Media not found"
                })
            }
        })
    }

    async update(userId: string, logId: string, payload: unknown) {
        rejectEntryKeys(payload)
        rejectLogTitle(payload)
        const { status, rating, notes, tags, entries } = validateSchema(updateLogSchema, payload)

        return await prisma.$transaction(async (tx: DbClient) => {
            // Ownership check
            const existingLog = await findLogById(logId, tx)
            if (!existingLog) {
                throw new AppError("Log does not exist", 404)
            }

            if (existingLog.userId !== userId) {
                throw new AppError("You can only edit logs that you created", 403)
            }

            const statusChanged = status !== undefined && status !== existingLog.status?.trim().toLowerCase()

            try {
                await updateLog(logId, status, rating, notes, tx)
                if (entries !== undefined) {
                    // The dialog already applied the status rules to what it sends, so none run here
                    await this.applyEntryChanges(logId, entries, tx)
                } else if (statusChanged) {
                    await applyStatusToEntries(logId, status, tx)
                }
                if (tags !== undefined) {
                    await tagService.resolveAndSyncTags(userId, logId, tags, tx)
                }
                return await findLogById(logId, tx)
            } catch (error: unknown) {
                handlePrismaError(error, {
                    notFoundMessage: "Log not found"
                })
            }
        })
    }

    /** Deletes, updates, then creates the entries of a log. Throws (rolling the transaction back) on any bad entry. */
    private async applyEntryChanges(logId: string, change: LogEntriesChange, tx: DbClient) {
        const toDelete = [...new Set(change.delete ?? [])]
        const toUpdate = change.update ?? []
        const toCreate = change.create ?? []

        const existing = await findEntriesOfLog(logId, tx)
        const byId = new Map(existing.map(e => [e.id, e]))
        for (const id of [...toDelete, ...toUpdate.map(u => u.id)]) {
            if (!byId.has(id)) throw new AppError("Entry does not exist", 404)
        }
        const deleting = new Set(toDelete)
        if (toUpdate.some(u => deleting.has(u.id))) {
            throw new AppError("An entry can't be both changed and deleted", 400)
        }
        if (new Set(toUpdate.map(u => u.id)).size !== toUpdate.length) {
            throw new AppError("An entry can only be changed once per save", 400)
        }
        if (existing.length - toDelete.length + toCreate.length > MAX_ENTRIES) {
            throw new AppError(`A log can't have more than ${MAX_ENTRIES} entries`, 400)
        }

        for (const id of toDelete) await deleteEntry(id, tx)
        for (const { id, ...data } of toUpdate) {
            const current = byId.get(id)!
            const startedAt = data.startedAt !== undefined ? data.startedAt : current.startedAt
            const finishedAt = data.finishedAt !== undefined ? data.finishedAt : current.finishedAt
            if (startedAt && finishedAt && dayKey(finishedAt) < dayKey(startedAt)) {
                throw new AppError("Finished date can't be before the start date", 400)
            }
            await updateEntry(id, data, tx)
        }
        for (const data of toCreate) await createEntry(logId, data, tx)
    }

    /** The log only when it belongs to the user; someone else's log looks like it doesn't exist. */
    private async ownLogOrThrow(userId: string, logId: string, client: DbClient) {
        const log = await client.userLogs.findFirst({ where: { id: logId, userId }, select: { id: true } })
        if (!log) throw new AppError("Log does not exist", 404)
        return log
    }

    async addEntry(userId: string, logId: string, payload: unknown) {
        const input = validateSchema(entryInputSchema, payload ?? {})
        return await prisma.$transaction(async (tx: DbClient) => {
            await this.ownLogOrThrow(userId, logId, tx)
            await assertRoomForEntries(logId, 1, tx)

            // "Add entry" with nothing said starts one today
            const data = input.startedAt === undefined && input.finishedAt === undefined
                ? { ...input, startedAt: toDayPrecision(new Date()) }
                : input
            await createEntry(logId, data, tx)

            // A new open entry means you're in it; a finished one (re-read last month) is completed
            await updateLog(logId, data.finishedAt ? "completed" : "in progress", undefined, undefined, tx)
            return await findLogById(logId, tx)
        })
    }

    async updateEntry(userId: string, logId: string, entryId: string, payload: unknown) {
        const input = validateSchema(updateEntrySchema, payload ?? {})
        return await prisma.$transaction(async (tx: DbClient) => {
            await this.ownLogOrThrow(userId, logId, tx)
            const existing = await findEntry(logId, entryId, tx)
            if (!existing) throw new AppError("Entry does not exist", 404)

            const startedAt = input.startedAt !== undefined ? input.startedAt : existing.startedAt
            const finishedAt = input.finishedAt !== undefined ? input.finishedAt : existing.finishedAt
            if (startedAt && finishedAt && dayKey(finishedAt) < dayKey(startedAt)) {
                throw new AppError("Finished date can't be before the start date", 400)
            }

            await updateEntry(entryId, input, tx)
            return await findLogById(logId, tx)
        })
    }

    async deleteEntry(userId: string, logId: string, entryId: string) {
        return await prisma.$transaction(async (tx: DbClient) => {
            await this.ownLogOrThrow(userId, logId, tx)
            const existing = await findEntry(logId, entryId, tx)
            if (!existing) throw new AppError("Entry does not exist", 404)
            await deleteEntry(entryId, tx)
            return await findLogById(logId, tx)
        })
    }

    async delete(userId: string, logId: string, payload: unknown) {
        const { confirm } = validateSchema(deleteLogSchema, payload)

        const existingLog = await findLogById(logId)
        if (!existingLog) {
            throw new AppError("Log does not exist", 404)
        }

        if (existingLog.userId !== userId) {
            throw new AppError("You can only delete logs that you created", 403) // Changed to 403
        }

        if (!confirm) {
            return {
                message: `Confirm deletion of ${existingLog.media.title} Log?`
            }
        }

        try {
            return await prisma.$transaction(async (tx: DbClient) => {
                const items = await tx.collectionItem.findMany({
                    where: { logId },
                    select: { collectionId: true },
                })
                const affectedCollectionIds = items.map((i) => i.collectionId)

                await deleteLog(logId, tx)

                for (const colId of affectedCollectionIds) {
                    const remaining = await tx.collectionItem.findMany({
                        where: { collectionId: colId },
                        orderBy: { position: "asc" },
                    })
                    for (let i = 0; i < remaining.length; i++) {
                        if (remaining[i].position !== i) {
                            await tx.collectionItem.update({
                                where: { collectionId_logId: { collectionId: colId, logId: remaining[i].logId } },
                                data: { position: i },
                            })
                        }
                    }
                    await tx.collection.update({
                        where: { id: colId },
                        data: { updated_at: new Date() },
                    })
                }

                return { message: "Log deleted" }
            })
        } catch (error: unknown) {
            handlePrismaError(error, {
                notFoundMessage: "Log not found"
            })
        }
    }
}

export const logService = new LogService()
