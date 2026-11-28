import { prisma } from '@/tests/jest.setup.js'
import { mergeMediaInto } from '@/services/mediaMergeService.js'
import { AppError } from '@/api/domain/error.js'

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null)

describe('mergeMediaInto: editions merge into one item', () => {
    let bookTypeId: string
    let systemUserId: string
    let u1: string
    let u2: string
    let n = 0

    const media = (title: string, provider = 'goodreads') => prisma.media.create({
        data: { title, userId: systemUserId, mediaTypeId: bookTypeId, provider: provider as 'goodreads', providerId: `merge-${provider}-${++n}-${Date.now()}` },
    })
    const merge = (from: string, into: string) => prisma.$transaction((tx) => mergeMediaInto(from, into, tx))

    beforeAll(async () => {
        bookTypeId = (await prisma.mediaType.findFirstOrThrow({ where: { name: 'book' } })).id
        systemUserId = (await prisma.user.findFirstOrThrow({ where: { username: 'system' } })).id
        u1 = (await prisma.user.create({ data: { username: `merge_u1_${Date.now()}`, password: 'x' } })).id
        u2 = (await prisma.user.create({ data: { username: `merge_u2_${Date.now()}`, password: 'x' } })).id
    })

    it('two users on two editions end as one item with two logs', async () => {
        const from = await media('Kindle edition')
        const into = await media('Paperback edition', 'openlibrary')
        await prisma.mediaExternalId.create({ data: { mediaId: from.id, provider: 'goodreads', externalId: `ext-${from.providerId}` } })
        const child = await prisma.media.create({ data: { title: 'child', userId: systemUserId, mediaTypeId: bookTypeId, parentId: from.id } })
        await prisma.userLogs.create({ data: { userId: u1, mediaId: from.id, status: 'completed' } })
        await prisma.userLogs.create({ data: { userId: u2, mediaId: into.id, status: 'wishlist' } })

        await merge(from.id, into.id)

        expect(await prisma.media.findUnique({ where: { id: from.id } })).toBeNull()
        const logs = await prisma.userLogs.findMany({ where: { mediaId: into.id }, orderBy: { userId: 'asc' } })
        expect(logs.map(l => l.userId).sort()).toEqual([u1, u2].sort())
        const ext = await prisma.mediaExternalId.findMany({ where: { mediaId: into.id } })
        expect(ext.map(e => e.externalId)).toEqual(expect.arrayContaining([`ext-${from.providerId}`, from.providerId!]))
        expect((await prisma.media.findUniqueOrThrow({ where: { id: child.id } })).parentId).toBe(into.id)
    })

    it('one user on both: one log with both entries, tags unioned, collections kept, review text kept, edition titles kept', async () => {
        const user = (await prisma.user.create({ data: { username: `merge_both_${Date.now()}`, password: 'x' } })).id
        const from = await media("L'étranger")
        const into = await media('The Stranger', 'openlibrary')
        const tagShared = await prisma.tag.create({ data: { userId: user, name: 'shared', nameKey: `shared-${n}` } })
        const tagFrom = await prisma.tag.create({ data: { userId: user, name: 'only-from', nameKey: `only-from-${n}` } })
        const tagInto = await prisma.tag.create({ data: { userId: user, name: 'only-into', nameKey: `only-into-${n}` } })
        const colBoth = await prisma.collection.create({ data: { userId: user, name: 'both', nameKey: `both-${n}`, ranked: true } })
        const colFrom = await prisma.collection.create({ data: { userId: user, name: 'from only', nameKey: `fromonly-${n}`, ranked: true } })
        const other = await prisma.userLogs.create({ data: { userId: user, mediaId: (await media('Other')).id } })

        const fromLog = await prisma.userLogs.create({
            data: {
                userId: user, mediaId: from.id, status: 'completed', rating: 90, notes: 'From review',
                entries: { create: [{ finishedAt: new Date('2024-05-05'), note: 'second read', name: "L'étranger", edition: { format: 'Paperback' } }] },
                tags: { create: [{ tagId: tagShared.id }, { tagId: tagFrom.id }] },
            },
        })
        const intoLog = await prisma.userLogs.create({
            data: {
                userId: user, mediaId: into.id, status: 'in_progress', rating: null, notes: 'Into review',
                entries: { create: [{ finishedAt: new Date('2022-02-02'), name: 'The Stranger' }] },
                tags: { create: [{ tagId: tagShared.id }, { tagId: tagInto.id }] },
            },
        })
        // both logs sit in `colBoth`; only the from log is in `colFrom`
        await prisma.collectionItem.createMany({ data: [
            { collectionId: colBoth.id, logId: other.id, position: 0 },
            { collectionId: colBoth.id, logId: fromLog.id, position: 1 },
            { collectionId: colBoth.id, logId: intoLog.id, position: 2 },
            { collectionId: colFrom.id, logId: fromLog.id, position: 0 },
        ] })

        await merge(from.id, into.id)

        const logs = await prisma.userLogs.findMany({
            where: { userId: user, mediaId: into.id },
            include: { entries: { orderBy: { finishedAt: 'desc' } }, tags: true, collectionItems: { orderBy: { position: 'asc' } } },
        })
        expect(logs).toHaveLength(1)
        const log = logs[0]
        expect(log.id).toBe(intoLog.id)
        expect(await prisma.userLogs.count({ where: { id: fromLog.id } })).toBe(0)

        // both entries, each with its name
        expect(log.entries.map(e => [day(e.finishedAt), e.name])).toEqual([
            ['2024-05-05', "L'étranger"], ['2022-02-02', 'The Stranger'],
        ])
        // tags unioned
        expect(log.tags.map(t => t.tagId).sort()).toEqual([tagShared.id, tagFrom.id, tagInto.id].sort())
        // collections kept: the from item in `colFrom` moved, the duplicate in `colBoth` dropped and positions repacked
        expect(log.collectionItems.map(c => c.collectionId).sort()).toEqual([colBoth.id, colFrom.id].sort())
        const both = await prisma.collectionItem.findMany({ where: { collectionId: colBoth.id }, orderBy: { position: 'asc' } })
        expect(both.map(c => [c.logId, c.position])).toEqual([[other.id, 0], [intoLog.id, 1]])
        // rating falls back to from's; into's review stays, from's lands on the newest moved entry
        expect(log.rating).toBe(90)
        expect(log.notes).toBe('Into review')
        expect(log.entries[0].note).toBe('second read\n\nFrom review')
        // the log whose newest entry is newer (from, 2024) decides the status
        expect(log.status).toBe('completed')
    })

    it("keeps into's rating and status when into is the newer log, and an undated entry carries from's review when from had no entries", async () => {
        const user = (await prisma.user.create({ data: { username: `merge_keep_${Date.now()}`, password: 'x' } })).id
        const from = await media('Old edition')
        const into = await media('New edition', 'openlibrary')
        await prisma.userLogs.create({ data: { userId: user, mediaId: from.id, status: 'dropped', rating: 10, notes: 'Review kept somewhere' } })
        const intoLog = await prisma.userLogs.create({
            data: { userId: user, mediaId: into.id, status: 'completed', rating: 70, notes: 'Into review', entries: { create: [{ finishedAt: new Date('2025-01-01') }] } },
        })

        await merge(from.id, into.id)

        const log = await prisma.userLogs.findUniqueOrThrow({ where: { id: intoLog.id }, include: { entries: true } })
        expect(log).toMatchObject({ rating: 70, status: 'completed', notes: 'Into review' })
        // from had no entries: its review text goes on an undated entry
        const undated = log.entries.find(e => e.finishedAt === null && e.startedAt === null)
        expect(undated?.note).toBe('Review kept somewhere')
    })

    it("never merges a user's custom media", async () => {
        const custom = await prisma.media.create({ data: { title: 'Custom', userId: u1, mediaTypeId: bookTypeId } })
        const into = await media('Target', 'openlibrary')
        await expect(merge(custom.id, into.id)).rejects.toBeInstanceOf(AppError)
        await expect(merge(into.id, custom.id)).rejects.toBeInstanceOf(AppError)
        expect(await prisma.media.count({ where: { id: { in: [custom.id, into.id] } } })).toBe(2)
    })
})
