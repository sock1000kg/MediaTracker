import request from 'supertest'
import app from '../../app'
import { prisma } from '../jest.setup'

import { normalizeTypeName } from '../../utilities'

describe('Media Routes', () => {
    const username = 'MediaTestUser'
    const password = 'StrongPass1!'
    const mediaTypeName = normalizeTypeName('TestMediaType')
    const displayName = 'Tester'
    let token, user, mediaType

    beforeEach(async () => {
        // refresh the db and creates a new user
        await prisma.user.deleteMany({ where: { username } })

        const registerRes = await request(app)
            .post('/auth/register')
            .send({ username, password, displayName })
            .set('Content-Type', 'application/json')

        if (registerRes.statusCode !== 200 && registerRes.statusCode !== 201) {
            throw new Error(`Register failed: ${registerRes.statusCode} ${JSON.stringify(registerRes.body)}`)
        }

        const loginRes = await request(app)
            .post('/auth/login')
            .send({ username, password })
            .set('Content-Type', 'application/json')

        if (loginRes.statusCode !== 200) {
            throw new Error(`Login failed: ${loginRes.statusCode} ${JSON.stringify(loginRes.body)}`)
        }

        token = loginRes.body.token
        if (!token) throw new Error(`No token returned from login: ${JSON.stringify(loginRes.body)}`)

        user = await prisma.user.findUnique({ where: { username } })
        if (!user) {
            throw new Error(`User not found in DB after register. Register response: ${JSON.stringify(registerRes.body)}`)
        }

        // Create a media type for this user
        mediaType = await prisma.mediaType.create({
            data: { name: normalizeTypeName(mediaTypeName), userId: user.id }
        })
    })

    afterEach(async () => {
        await prisma.media.deleteMany({ where: { userId: user.id } })
    })

    afterAll(async () => {
        await prisma.mediaType.deleteMany({ where: { userId: user.id } })
        await prisma.user.deleteMany({ where: { username } })
    })

    //CREATE
    test('Create media with global type succeeds', async () => {
        const res = await request(app)
            .post('/media')
            .set('Authorization', `Bearer ${token}`)
            .send({
            title: 'GlobalTypeTest',
            mediaType: mediaType, 
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
                mediaType: mediaType,
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
            mediaType: mediaType,
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
                mediaType: mediaType,
                creator: 'Author',
                year: 2024,
                metadata: { foo: 'bar' }
            })
        expect(res.statusCode).toBe(400)
    })

    test('Create media with invalid year succeeds, year turns null', async () => {
    const res = await request(app)
        .post('/media')
        .set('Authorization', `Bearer ${token}`)
        .send({
            title: 'BadYear',
            mediaType: mediaType,
            creator: 'Bad',
            year: 'abcd', // invalid
            metadata: {}
        })
        expect(res.statusCode).toBe(201)
        expect(res.body.year).toBe(null)
    })

    test('Create duplicate media fails', async () => {
        await request(app)
            .post('/media')
            .set('Authorization', `Bearer ${token}`)
            .send({
                title: 'Test Media',
                mediaType: mediaType,
                creator: 'Author',
                year: 2024,
                metadata: { foo: 'bar' }
            })
        const res = await request(app)
            .post('/media')
            .set('Authorization', `Bearer ${token}`)
            .send({
                title: 'Test Media',
                mediaType: mediaType,
                creator: 'Author',
                year: 2024,
                metadata: { foo: 'bar' }
            })
        expect(res.statusCode).toBe(409)
        expect(res.body.message).toMatch(/already exists/i)
    })

    test('Create media without token fails', async () => {
        const res = await request(app)
            .post('/media')
            .send({
                title: 'NoAuthMedia',
                mediaType: mediaType,
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
                mediaType: mediaType,
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

    // FETCH
    test('Fetch all media returns array', async () => {
        await request(app)
            .post('/media')
            .set('Authorization', `Bearer ${token}`)
            .send({
                title: 'Test Media',
                mediaType: mediaType,
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

    //UPDATE
    test('Update media succeeds', async () => {
        const createRes = await request(app)
            .post('/media')
            .set('Authorization', `Bearer ${token}`)
            .send({
                title: 'Test Media',
                mediaType: mediaType,
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
                mediaType: mediaType,
                creator: 'New Author',
                year: 2025,
                metadata: { foo: 'baz' }
            })
        expect(res.statusCode).toBe(200)
        expect(res.body.title).toBe('Updated Media')
        expect(res.body.creator).toBe('New Author')
    })

    test('Update media missing fields fails', async () => {
        const createRes = await request(app)
            .post('/media')
            .set('Authorization', `Bearer ${token}`)
            .send({
                title: 'Test Media',
                mediaType: mediaType,
                creator: 'Author',
                year: 2024,
                metadata: { foo: 'bar' }
            })
        const mediaId = createRes.body.id
        const res = await request(app)
            .put(`/media/${mediaId}`)
            .set('Authorization', `Bearer ${token}`)
            .send({
                mediaType: mediaType,
                creator: 'New Author',
                year: 2025,
                metadata: { foo: 'baz' }
            })
        expect(res.statusCode).toBe(400)
        expect(res.body.message).toMatch(/required/i)
    })

    test('Update media to duplicate fails', async () => {
        // Create two medias
        await request(app)
            .post('/media')
            .set('Authorization', `Bearer ${token}`)
            .send({
                title: 'Media1',
                mediaType: mediaType,
                creator: 'A',
                year: 2024,
                metadata: {}
            })
        const createRes = await request(app)
            .post('/media')
            .set('Authorization', `Bearer ${token}`)
            .send({
                title: 'Media2',
                mediaType: mediaType,
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
                mediaType: mediaType,
                creator: 'A',
                year: 2024,
                metadata: {}
            })
        expect(res.statusCode).toBe(409)
        expect(res.body.message).toMatch(/already exists/i)
    })

    //DELETE
    test('Delete media succeeds', async () => {
        const createRes = await request(app)
            .post('/media')
            .set('Authorization', `Bearer ${token}`)
            .send({
                title: 'Delete Me',
                mediaType: mediaType,
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
        expect(res.body.message).toMatch(/not found/i)
    })

    test('Delete media with logs without confirmation fails with prompt', async () => {
        // Create media
        const createRes = await request(app)
            .post('/media')
            .set('Authorization', `Bearer ${token}`)
            .send({
                title: 'MediaWithLog',
                mediaType: mediaType,
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
            .send({ confirm: false })
        expect(res.statusCode).toBe(200)
        expect(res.body.message).toMatch(/confirm deletion/i)
        expect(res.body.logsCount).toBe(1)
    })

    test('Update media with missing fields fails', async () => {
        const createRes = await request(app)
            .post('/media')
            .set('Authorization', `Bearer ${token}`)
            .send({
                title: 'UpdateFail',
                mediaType: mediaType,
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
        expect(res.body.message).toMatch(/required/i)
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
        expect(res.body.message).toMatch(/that you created/i)
        // Cleanup
        await prisma.media.delete({ where: { id: otherMedia.id } })
        await prisma.mediaType.delete({ where: { id: otherType.id } })
        await prisma.user.delete({ where: { id: otherUser.id } })
    })
})