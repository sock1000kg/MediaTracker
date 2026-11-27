import prisma from "@/prismaClient.js"
import { DbClient } from "@/db.js"
import { letterState } from "@/services/letterState.js"

// The newest entry of the letter's log is all the relog rule needs
const LATEST_ENTRY = { orderBy: { created_at: "desc" }, take: 1, select: { created_at: true } } as const

const LETTER_INCLUDE = {
    log: {
        select: {
            entries: LATEST_ENTRY,
            media: { select: { id: true, title: true, mediaType: { select: { name: true } } } },
        },
    },
} as const

export async function findLettersOfUser(userId: string, client: DbClient = prisma) {
    return client.sealedLetter.findMany({
        where: { userId },
        include: LETTER_INCLUDE,
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
    })
}

export async function findLetterOfUser(userId: string, id: string, client: DbClient = prisma) {
    return client.sealedLetter.findFirst({ where: { id, userId }, include: LETTER_INCLUDE })
}

export type LetterRow = Awaited<ReturnType<typeof findLettersOfUser>>[number]

export async function createLetter(
    data: { userId: string; logId: string; body: string; opensAt: Date | null; opensOnRelog: boolean },
    client: DbClient
) {
    return client.sealedLetter.create({ data, include: LETTER_INCLUDE })
}

export async function countLetters(where: { userId: string; logId?: string; openedAt?: null }, client: DbClient) {
    return client.sealedLetter.count({ where })
}

/** Sets openedAt only the first time. */
export async function markLetterOpened(id: string, now: Date, client: DbClient) {
    await client.sealedLetter.updateMany({ where: { id, openedAt: null }, data: { openedAt: now } })
}

export async function deleteLetterOfUser(userId: string, id: string, client: DbClient = prisma) {
    const { count } = await client.sealedLetter.deleteMany({ where: { id, userId } })
    return count
}

export type LetterCounts = { sealed: number; ready: number }

/** Adds `letters: { sealed, ready }` to each log, with one lookup for all of them. Never reads a letter's text. */
export async function attachLetterCounts<T extends { id: string }>(
    logs: T[],
    userId: string,
    client: DbClient = prisma
): Promise<(T & { letters: LetterCounts })[]> {
    const letters = logs.length === 0 ? [] : await client.sealedLetter.findMany({
        where: { userId, openedAt: null, ...(logs.length === 1 ? { logId: logs[0].id } : {}) },
        select: {
            logId: true, created_at: true, opensAt: true, opensOnRelog: true, openedAt: true,
            log: { select: { entries: LATEST_ENTRY } },
        },
    })

    const now = new Date()
    const counts = new Map<string, LetterCounts>()
    for (const letter of letters) {
        const count = counts.get(letter.logId) ?? { sealed: 0, ready: 0 }
        const state = letterState(letter, letter.log.entries[0]?.created_at ?? null, now)
        if (state !== "opened") count[state] += 1
        counts.set(letter.logId, count)
    }

    return logs.map(log => ({ ...log, letters: counts.get(log.id) ?? { sealed: 0, ready: 0 } }))
}
