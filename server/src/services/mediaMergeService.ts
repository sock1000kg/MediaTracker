import { DbClient, PrismaClient } from "@/db.js"
import { AppError } from "@/api/domain/error.js"
import { LIMITS } from "@/config/limits.js"
import { entryDate, newestEntry } from "@/services/logEntries.js"

/**
 * Runs `fn` in a transaction: the client's own when it is the root client, else the one it already is.
 */
export async function inTransaction<T>(db: DbClient, fn: (tx: DbClient) => Promise<T>): Promise<T> {
    if ("$transaction" in db) {
        return (db as PrismaClient).$transaction(async (tx) => fn(tx))
    }
    return fn(db)
}

async function repackCollection(collectionId: string, tx: DbClient) {
    const remaining = await tx.collectionItem.findMany({
        where: { collectionId },
        orderBy: [{ position: "asc" }, { logId: "asc" }],
    })
    for (let i = 0; i < remaining.length; i++) {
        if (remaining[i].position !== i) {
            await tx.collectionItem.update({
                where: { collectionId_logId: { collectionId, logId: remaining[i].logId } },
                data: { position: i },
            })
        }
    }
    await tx.collection.update({ where: { id: collectionId }, data: { updated_at: new Date() } })
}

/**
 * Makes two rows of one item into a single item: `from` disappears and everything it held moves to `into`.
 * Both rows must be system-owned (a user's custom media is never merged). Run it inside a transaction.
 *
 * For a user with a log on both rows the logs combine into the one on `into`: entries move over, tags are
 * unioned, collections keep one item, rating and name fall back to `from`'s when `into` has none, the review
 * text is never lost, and the status is the one of the log with the newer entry.
 */
export async function mergeMediaInto(fromId: string, intoId: string, tx: DbClient): Promise<void> {
    if (fromId === intoId) throw new AppError("Can't merge a media into itself", 400)

    const system = await tx.user.findUnique({ where: { username: "system" }, select: { id: true } })
    const rows = await tx.media.findMany({
        where: { id: { in: [fromId, intoId] } },
        select: { id: true, userId: true, provider: true, providerId: true },
    })
    const from = rows.find(r => r.id === fromId)
    const into = rows.find(r => r.id === intoId)
    if (!from || !into) throw new AppError("Media not found", 404)
    if (!system || from.userId !== system.id || into.userId !== system.id) {
        throw new AppError("Only system-owned media can be merged", 400)
    }

    const fromLogs = await tx.userLogs.findMany({
        where: { mediaId: fromId },
        include: { entries: true, tags: true, collectionItems: true },
    })

    for (const fromLog of fromLogs) {
        const intoLog = await tx.userLogs.findUnique({
            where: { userId_mediaId: { userId: fromLog.userId, mediaId: intoId } },
            include: { entries: true, tags: true, collectionItems: true },
        })

        if (!intoLog) {
            await tx.userLogs.update({ where: { id: fromLog.id }, data: { mediaId: intoId } })
            continue
        }

        // Entries
        await tx.logEntry.updateMany({ where: { logId: fromLog.id }, data: { logId: intoLog.id } })

        // Tags: union
        const have = new Set(intoLog.tags.map(t => t.tagId))
        const missing = fromLog.tags.filter(t => !have.has(t.tagId))
        if (missing.length > 0) {
            await tx.logTag.createMany({
                data: missing.map(t => ({ logId: intoLog.id, tagId: t.tagId })),
                skipDuplicates: true,
            })
        }

        // Collections: move the item, unless the into log is already in that collection
        const inCollections = new Set(intoLog.collectionItems.map(c => c.collectionId))
        for (const item of fromLog.collectionItems) {
            if (inCollections.has(item.collectionId)) {
                await tx.collectionItem.delete({
                    where: { collectionId_logId: { collectionId: item.collectionId, logId: fromLog.id } },
                })
                await repackCollection(item.collectionId, tx)
            } else {
                await tx.collectionItem.update({
                    where: { collectionId_logId: { collectionId: item.collectionId, logId: fromLog.id } },
                    data: { logId: intoLog.id },
                })
            }
        }

        // Review text: keep into's; from's goes onto the newest moved entry so none of it is lost
        const fromNotes = fromLog.notes?.trim() ?? ""
        const intoNotes = intoLog.notes?.trim() ?? ""
        let notes = intoLog.notes
        if (fromNotes !== "" && fromNotes !== intoNotes) {
            if (intoNotes === "") {
                notes = fromLog.notes
            } else {
                const target = newestEntry(fromLog.entries)
                const clip = (text: string) => text.slice(0, LIMITS.logs.entryNoteMaxLength)
                if (target) {
                    const joined = target.note && target.note.trim() !== "" ? `${target.note}\n\n${fromNotes}` : fromNotes
                    await tx.logEntry.update({ where: { id: target.id }, data: { note: clip(joined) } })
                } else {
                    await tx.logEntry.create({ data: { logId: intoLog.id, note: clip(fromNotes) } })
                }
            }
        }

        // Status: the log whose newest entry is newer wins
        const fromNewest = newestEntry(fromLog.entries)
        const intoNewest = newestEntry(intoLog.entries)
        const fromTime = fromNewest ? entryDate(fromNewest)?.getTime() ?? null : null
        const intoTime = intoNewest ? entryDate(intoNewest)?.getTime() ?? null : null
        const fromIsNewer = fromTime !== null && (intoTime === null || fromTime > intoTime)
        const status = fromIsNewer ? (fromLog.status ?? intoLog.status) : (intoLog.status ?? fromLog.status)

        await tx.userLogs.update({
            where: { id: intoLog.id },
            data: {
                rating: intoLog.rating ?? fromLog.rating,
                title: intoLog.title ?? fromLog.title,
                notes,
                status,
            },
        })

        await tx.userLogs.delete({ where: { id: fromLog.id } })
    }

    // External ids and children move to the survivor; the row's own id stays findable as an external id
    await tx.mediaExternalId.updateMany({ where: { mediaId: fromId }, data: { mediaId: intoId } })
    if (from.provider && from.providerId) {
        await tx.mediaExternalId.createMany({
            data: [{ mediaId: intoId, provider: from.provider, externalId: from.providerId }],
            skipDuplicates: true,
        })
    }
    await tx.media.updateMany({ where: { parentId: fromId }, data: { parentId: intoId } })

    await tx.media.delete({ where: { id: fromId } })
}

