import request from 'supertest'
import app from '../../src/app.js'
import { prisma } from '../jest.setup.mjs'

describe('MediaType Routes', () => {
    const username = 'MediaTypeTestUser'
    const password = 'StrongPass1!'
    const mediaTypeName = 'TestType'
    let token

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
    })

    afterEach(async () => {
        const user = await prisma.user.findUnique({ where: { username } })
        if (user) {
            await prisma.mediaType.deleteMany({ where: { userId: user.id } })
        }
    })

    afterAll(async () => {
        await prisma.user.deleteMany({ where: { username } })
    })

    test('Create media type with valid name succeeds', async () => {
        const res = await request(app)
            .post('/media-type')
            .set('Authorization', `Bearer ${token}`)
            .send({ name: mediaTypeName })
        expect(res.statusCode).toBe(201)
        expect(res.body.name).toBe(mediaTypeName.toLowerCase())
    })

    test('Create media type with missing name fails', async () => {
        const res = await request(app)
            .post('/media-type')
            .set('Authorization', `Bearer ${token}`)
            .send({})
        expect(res.statusCode).toBe(400)
        expect(res.body.error).toMatch(/name is required/i)
    })

    test('Create duplicate media type fails', async () => {
        await request(app)
            .post('/media-type')
            .set('Authorization', `Bearer ${token}`)
            .send({ name: mediaTypeName })
        const res = await request(app)
            .post('/media-type')
            .set('Authorization', `Bearer ${token}`)
            .send({ name: mediaTypeName })
        expect(res.statusCode).toBe(409)
        expect(res.body.error).toMatch(/already exists/i)
    })

    test('Fetch all media types returns array', async () => {
        await request(app)
            .post('/media-type')
            .set('Authorization', `Bearer ${token}`)
            .send({ name: mediaTypeName })
        const res = await request(app)
            .get('/media-type')
            .set('Authorization', `Bearer ${token}`)
        expect(res.statusCode).toBe(200)
        expect(Array.isArray(res.body)).toBe(true)
        expect(res.body.some(mt => mt.name === mediaTypeName.toLowerCase())).toBe(true)
    })

    test('Delete media type succeeds', async () => {
        // Create a media type
        await request(app)
            .post('/media-type')
            .set('Authorization', `Bearer ${token}`)
            .send({ name: mediaTypeName })

        // Create a media associated with that type
        const user = await prisma.user.findUnique({ where: { username } })
        const mediaType = await prisma.mediaType.findFirst({ where: { name: mediaTypeName.toLowerCase(), userId: user.id } })
        await prisma.media.create({
            data: {
                title: 'Test Media',
                mediaTypeId: mediaType.id,
                userId: user.id
            }
        })

        // Delete the media type with confirmation
        const res = await request(app)
            .delete(`/media-type/${encodeURIComponent(mediaTypeName)}`)
            .set('Authorization', `Bearer ${token}`)
            .send({ confirm: true }) 
        expect(res.statusCode).toBe(200)
        expect(res.body.message).toMatch(/deleted successfully/i)
    })

    test('Delete non-existent media type fails', async () => {
        const res = await request(app)
            .delete('/media-type/HhahahahHA')
            .set('Authorization', `Bearer ${token}`)
            .send( { confirm: true })
        expect(res.statusCode).toBe(404)
        expect(res.body.error).toMatch(/does not exist/i)
    })

    test('Rename media type succeeds', async () => {
        await request(app)
            .post('/media-type')
            .set('Authorization', `Bearer ${token}`)
            .send({ name: mediaTypeName })
        const res = await request(app)
            .put(`/media-type/${encodeURIComponent(mediaTypeName)}`)
            .set('Authorization', `Bearer ${token}`)
            .send({ newName: 'RenamedType' })
        expect(res.statusCode).toBe(200)
        expect(res.body.name).toBe('renamedtype')
    })

    test('Rename media type to existing name fails', async () => {
        await request(app)
            .post('/media-type')
            .set('Authorization', `Bearer ${token}`)
            .send({ name: 'TypeA' })
        await request(app)
            .post('/media-type')
            .set('Authorization', `Bearer ${token}`)
            .send({ name: 'TypeB' })
        const res = await request(app)
            .put('/media-type/TypeA')
            .set('Authorization', `Bearer ${token}`)
            .send({ newName: 'TypeB' })
        expect(res.statusCode).toBe(409)
        expect(res.body.error).toMatch(/already exists/i)
    })

    test('Rename non-existent media type fails', async () => {
        const res = await request(app)
            .put('/media-type/NoSuchType')
            .set('Authorization', `Bearer ${token}`)
            .send({ newName: 'Anything' })
        expect(res.statusCode).toBe(404)
        expect(res.body.error).toMatch(/does not exist/i)
    })

    test('Rename media type with missing newName fails', async () => {
        await request(app)
            .post('/media-type')
            .set('Authorization', `Bearer ${token}`)
            .send({ name: mediaTypeName })
        const res = await request(app)
            .put(`/media-type/${encodeURIComponent(mediaTypeName)}`)
            .set('Authorization', `Bearer ${token}`)
            .send({})
        expect(res.statusCode).toBe(400)
        expect(res.body.error).toMatch(/name is required/i)
    })

    test('Delete media type with associated media without confirmation fails with prompt', async () => {
        // Create a media type
        await request(app)
            .post('/media-type')
            .set('Authorization', `Bearer ${token}`)
            .send({ name: mediaTypeName })

        // Create a media associated with that type
        const user = await prisma.user.findUnique({ where: { username } })
        const mediaType = await prisma.mediaType.findFirst({ where: { name: mediaTypeName.toLowerCase(), userId: user.id } })
        await prisma.media.create({
            data: {
                title: 'Test Media',
                mediaTypeId: mediaType.id,
                userId: user.id
            }
        })

        // Attempt to delete the media type without confirmation
        const res = await request(app)
            .delete(`/media-type/${encodeURIComponent(mediaTypeName)}`)
            .set('Authorization', `Bearer ${token}`)
            .send({}) // no confirm

        expect(res.statusCode).toBe(400)
        expect(res.body.message).toMatch(/confirm deletion/i)
        expect(res.body.mediaCount).toBe(1)
    })
})