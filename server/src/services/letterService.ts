import prisma from "@/prismaClient.js"
import { DbClient } from "@/db.js"
import { AppError } from "@/api/domain/error.js"
import { LIMITS } from "@/config/limits.js"
import { validateSchema } from "@/utilities.js"
import { createLetterSchema } from "@/schemas/letterSchemas.js"
import * as repo from "@/repositories/letterRepository.js"
import { letterState } from "@/services/letterState.js"

/** What the client sees. The text leaves the server only for a letter that has been opened. */
function toItem(letter: repo.LetterRow, now = new Date()) {
    const state = letterState(letter, letter.log.entries[0]?.created_at ?? null, now)
    const { media } = letter.log
    return {
        id: letter.id,
        logId: letter.logId,
        media: { id: media.id, title: media.title, mediaType: media.mediaType?.name ?? null },
        created_at: letter.created_at,
        opensAt: letter.opensAt,
        opensOnRelog: letter.opensOnRelog,
        openedAt: letter.openedAt,
        state,
        ...(state === "opened" ? { body: letter.body } : {}),
    }
}

export class LetterService {
    async getAll(userId: string) {
        const now = new Date()
        return (await repo.findLettersOfUser(userId)).map(letter => toItem(letter, now))
    }

    async summary(userId: string) {
        const letters = await this.getAll(userId)
        const sealed = letters.filter(l => l.state === "sealed")
        const dates = sealed.flatMap(l => (l.opensAt ? [l.opensAt.getTime()] : []))
        return {
            sealed: sealed.length,
            ready: letters.filter(l => l.state === "ready").length,
            nextOpensAt: dates.length > 0 ? new Date(Math.min(...dates)) : null,
        }
    }

    async create(userId: string, payload: unknown) {
        const { logId, body, opensAt, opensOnRelog } = validateSchema(createLetterSchema, payload)
        const { maxSealedPerLog, maxPerUser } = LIMITS.letters

        return prisma.$transaction(async (tx: DbClient) => {
            const log = await tx.userLogs.findFirst({ where: { id: logId, userId }, select: { id: true } })
            if (!log) throw new AppError("Log does not exist", 404)
            if (await repo.countLetters({ userId, logId, openedAt: null }, tx) >= maxSealedPerLog) {
                throw new AppError(`A log can't have more than ${maxSealedPerLog} sealed letters`, 400)
            }
            if (await repo.countLetters({ userId }, tx) >= maxPerUser) {
                throw new AppError(`You can't keep more than ${maxPerUser} letters`, 400)
            }
            const letter = await repo.createLetter(
                { userId, logId, body, opensAt: opensAt ?? null, opensOnRelog: opensOnRelog ?? false },
                tx
            )
            return toItem(letter)
        })
    }

    async open(userId: string, id: string) {
        return prisma.$transaction(async (tx: DbClient) => {
            const letter = await repo.findLetterOfUser(userId, id, tx)
            if (!letter) throw new AppError("Letter does not exist", 404)
            const now = new Date()
            if (toItem(letter, now).state === "sealed") throw new AppError("This letter is still sealed", 409)
            await repo.markLetterOpened(id, now, tx)
            return toItem((await repo.findLetterOfUser(userId, id, tx))!, now)
        })
    }

    async delete(userId: string, id: string) {
        if (await repo.deleteLetterOfUser(userId, id) === 0) {
            throw new AppError("Letter does not exist", 404)
        }
    }
}

export const letterService = new LetterService()
