import request from 'supertest'
import app from '../../src/app.js'
import { prisma } from '../jest.setup.mjs'

describe('Media Routes', () => {
    const username = 'MediaTestUser'
    const password = 'StrongPass1!'
    const mediaTypeName = 'TestMediaType'
    let token, user, mediaType

    beforeAll(async () => {
        await prisma.user.deleteMany({ where: { username } })
        await request(app)
            .post('/auth/register')
            .send({ username, password })
            .set('Content-Type', 'application/json')
        const res = await request(app)
            .post('/auth/login')
            .send({ username, password })
            .set('Content-Type', 'application/json')
        token = res.body.token
        user = await prisma.user.findUnique({ where: { username } })
        // Create a media type for this user
        mediaType = await prisma.mediaType.create({
            data: { name: mediaTypeName.toLowerCase(), userId: user.id }
        })
    })

    afterEach(async () => {
        await prisma.media.deleteMany({ where: { userId: user.id } })
    })

    afterAll(async () => {
        await prisma.mediaType.deleteMany({ where: { userId: user.id } })
        await prisma.user.deleteMany({ where: { username } })
    })

    test('Create media with global type succeeds', async () => {
        const res = await request(app)
            .post('/media')
            .set('Authorization', `Bearer ${token}`)
            .send({
            title: 'GlobalTypeTest',
            mediaType: { name: 'book' }, 
            creator: 'Someone',
            year: 2024,
            metadata: {}
            })
        expect(res.statusCode).toBe(201)
        expect(res.body.title).toBe('GlobalTypeTest')
    })

    test('Create media with valid data succeeds', async () => {
        const res = await request(app)
            .post('/media')
            .set('Authorization', `Bearer ${token}`)
            .send({
                title: 'Test Media',
                mediaType: { name: mediaTypeName },
                creator: 'Author',
                year: 2024,
                metadata: { foo: 'bar' }
            })
        expect(res.statusCode).toBe(201)
        expect(res.body.title).toBe('Test Media')
        expect(res.body.creator).toBe('Author')
    })

    test('Create media with null metadata succeeds', async () => {
    const res = await request(app)
        .post('/media')
        .set('Authorization', `Bearer ${token}`)
        .send({
            title: 'MetaNull',
            mediaType: { name: mediaTypeName },
            creator: 'X',
            year: 2024,
            metadata: null
        })
        expect(res.statusCode).toBe(201)
        expect(res.body.title).toBe('MetaNull')
        expect(res.body.creator).toBe('X')
    })


    test('Create media with missing title fails', async () => {
        const res = await request(app)
            .post('/media')
            .set('Authorization', `Bearer ${token}`)
            .send({
                mediaType: { name: mediaTypeName },
                creator: 'Author',
                year: 2024,
                metadata: { foo: 'bar' }
            })
        expect(res.statusCode).toBe(400)
    })

    test('Create duplicate media fails', async () => {
        await request(app)
            .post('/media')
            .set('Authorization', `Bearer ${token}`)
            .send({
                title: 'Test Media',
                mediaType: { name: mediaTypeName },
                creator: 'Author',
                year: 2024,
                metadata: { foo: 'bar' }
            })
        const res = await request(app)
            .post('/media')
            .set('Authorization', `Bearer ${token}`)
            .send({
                title: 'Test Media',
                mediaType: { name: mediaTypeName },
                creator: 'Author',
                year: 2024,
                metadata: { foo: 'bar' }
            })
        expect(res.statusCode).toBe(409)
        expect(res.body.error).toMatch(/already exists/i)
    })

    test('Create media without token fails', async () => {
        const res = await request(app)
            .post('/media')
            .send({
                title: 'NoAuthMedia',
                mediaType: { name: mediaTypeName },
                creator: 'Anon',
                year: 2024
            })
        expect(res.statusCode).toBe(401)
    })

    test('Response includes expected fields', async () => {
        const res = await request(app)
            .post('/media')
            .set('Authorization', `Bearer ${token}`)
            .send({
                title: 'SchemaTest',
                mediaType: { name: mediaTypeName },
                creator: 'Tester',
                year: 2024,
                metadata: { test: true }
            })

        expect(res.body).toEqual(
            expect.objectContaining({
                id: expect.any(Number),
                title: 'SchemaTest',
                creator: 'Tester',
                year: 2024,
                metadata: expect.any(Object),
                mediaTypeId: expect.any(Number)
            })
        )
    })

    test('Fetch all media returns array', async () => {
        await request(app)
            .post('/media')
            .set('Authorization', `Bearer ${token}`)
            .send({
                title: 'Test Media',
                mediaType: { name: mediaTypeName },
                creator: 'Author',
                year: 2024,
                metadata: { foo: 'bar' }
            })
        const res = await request(app)
            .get('/media')
            .set('Authorization', `Bearer ${token}`)
        expect(res.statusCode).toBe(200)
        expect(Array.isArray(res.body)).toBe(true)
        expect(res.body.some(m => m.title === 'Test Media')).toBe(true)
    })

    test('Update media succeeds', async () => {
        const createRes = await request(app)
            .post('/media')
            .set('Authorization', `Bearer ${token}`)
            .send({
                title: 'Test Media',
                mediaType: { name: mediaTypeName },
                creator: 'Author',
                year: 2024,
                metadata: { foo: 'bar' }
            })
        const mediaId = createRes.body.id
        const res = await request(app)
            .put(`/media/${mediaId}`)
            .set('Authorization', `Bearer ${token}`)
            .send({
                title: 'Updated Media',
                mediaType: { name: mediaTypeName },
                creator: 'New Author',
                year: 2025,
                metadata: { foo: 'baz' }
            })
        expect(res.statusCode).toBe(200)
        expect(res.body.title).toBe('Updated Media')
        expect(res.body.creator).toBe('New Author')
    })

    test('Update media to duplicate fails', async () => {
        // Create two medias
        await request(app)
            .post('/media')
            .set('Authorization', `Bearer ${token}`)
            .send({
                title: 'Media1',
                mediaType: { name: mediaTypeName },
                creator: 'A',
                year: 2024,
                metadata: {}
            })
        const createRes = await request(app)
            .post('/media')
            .set('Authorization', `Bearer ${token}`)
            .send({
                title: 'Media2',
                mediaType: { name: mediaTypeName },
                creator: 'B',
                year: 2024,
                metadata: {}
            })
        const media2Id = createRes.body.id
        // Try to update Media2 to have same info as Media1
        const res = await request(app)
            .put(`/media/${media2Id}`)
            .set('Authorization', `Bearer ${token}`)
            .send({
                title: 'Media1',
                mediaType: { name: mediaTypeName },
                creator: 'A',
                year: 2024,
                metadata: {}
            })
        expect(res.statusCode).toBe(409)
        expect(res.body.error).toMatch(/already exists/i)
    })

    test('Delete media succeeds', async () => {
        const createRes = await request(app)
            .post('/media')
            .set('Authorization', `Bearer ${token}`)
            .send({
                title: 'Delete Me',
                mediaType: { name: mediaTypeName },
                creator: 'Author',
                year: 2024,
                metadata: {}
            })
        const mediaId = createRes.body.id
        const res = await request(app)
            .delete(`/media/${mediaId}`)
            .set('Authorization', `Bearer ${token}`)
            .send({ confirm: true })
        expect(res.statusCode).toBe(200)
        expect(res.body.message).toMatch(/deleted/i)
    })

    test('Delete non-existent media fails', async () => {
        const res = await request(app)
            .delete('/media/999999')
            .set('Authorization', `Bearer ${token}`)
            .send({ confirm: true })
        expect(res.statusCode).toBe(404)
        expect(res.body.error).toMatch(/not found/i)
    })

    test('Delete media with logs without confirmation fails with prompt', async () => {
        // Create media
        const createRes = await request(app)
            .post('/media')
            .set('Authorization', `Bearer ${token}`)
            .send({
                title: 'MediaWithLog',
                mediaType: { name: mediaTypeName },
                creator: 'Author',
                year: 2024,
                metadata: {}
            })
        const mediaId = createRes.body.id
        // Create a log for this media
        await prisma.userLogs.create({
            data: {
                userId: user.id,
                mediaId,
                status: 'Completed',
                rating: 100,
                notes: 'Test log'
            }
        })
        // Try to delete without confirmation
        const res = await request(app)
            .delete(`/media/${mediaId}`)
            .set('Authorization', `Bearer ${token}`)
            .send({})
        expect(res.statusCode).toBe(400)
        expect(res.body.message).toMatch(/confirm deletion/i)
        expect(res.body.logsCount).toBe(1)
    })

    test('Update media with missing fields fails', async () => {
        const createRes = await request(app)
            .post('/media')
            .set('Authorization', `Bearer ${token}`)
            .send({
                title: 'UpdateFail',
                mediaType: { name: mediaTypeName },
                creator: 'Author',
                year: 2024,
                metadata: {}
            })
        const mediaId = createRes.body.id
        const res = await request(app)
            .put(`/media/${mediaId}`)
            .set('Authorization', `Bearer ${token}`)
            .send({
                title: '',
                mediaType: null
            })
        expect(res.statusCode).toBe(400)
        expect(res.body.error).toMatch(/required/i)
    })

    test('User cannot delete media they do not own', async () => {
        // Create a second user and media
        const otherUser = await prisma.user.create({
            data: { username: 'OtherMediaUser', password: 'StrongPass1!' }
        })
        const otherType = await prisma.mediaType.create({
            data: { name: 'othertype', userId: otherUser.id }
        })
        const otherMedia = await prisma.media.create({
            data: {
                title: 'OtherUserMedia',
                mediaTypeId: otherType.id,
                userId: otherUser.id
            }
        })
        // Try to delete as main user
        const res = await request(app)
            .delete(`/media/${otherMedia.id}`)
            .set('Authorization', `Bearer ${token}`)
            .send({ confirm: true })
        expect(res.statusCode).toBe(403)
        expect(res.body.error).toMatch(/do not own/i)
        // Cleanup
        await prisma.media.delete({ where: { id: otherMedia.id } })
        await prisma.mediaType.delete({ where: { id: otherType.id } })
        await prisma.user.delete({ where: { id: otherUser.id } })
    })
})