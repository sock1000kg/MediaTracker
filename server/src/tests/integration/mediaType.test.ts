import request from 'supertest'
import app from '@/app.js'
import { prisma } from '@/tests/jest.setup.js'

import { normalizeTypeName } from '@/utilities.js'

describe('MediaType Routes', () => {
    const username = 'MediaTypeTestUser'
    const password = 'StrongPass1!'
    const displayName = 'Tester'
    const registerKey = process.env.REGISTER_KEY
    let token, user

    beforeAll(async () => {
        // Delete old user
        await prisma.user.deleteMany({ where: { username } })

        //Register user
        await request(app)
            .post('/api/auth/register')
            .send({ username, password, displayName, registerKey })
            .set('Content-Type', 'application/json')

        //Login to get token
        const res = await request(app)
            .post('/api/auth/login')
            .send({ username, password })
            .set('Content-Type', 'application/json')
        token = res.body.accessToken
        user = await prisma.user.findUnique({ where: { username } })
    })

    afterEach(async () => {
        const user = await prisma.user.findUnique({ where: { username } })
        if (user) {
            await prisma.media.deleteMany({ where: { userId: user.id } })
            await prisma.mediaType.deleteMany({ where: { userId: user.id } })
        }

        
    })

    afterAll(async () => {
        await prisma.user.deleteMany({ where: { username } })
    })

    test('Create media type with valid name succeeds', async () => {
        const mediaTypeName = 'TestType'
        const res = await request(app)
            .post('/api/media-type')
            .set('Authorization', `Bearer ${token}`)
            .send({ name: mediaTypeName })
        expect(res.statusCode).toBe(201)
        expect(res.body.name).toBe(normalizeTypeName(mediaTypeName))
    })

    test('Create media type with missing name fails', async () => {
        const res = await request(app)
            .post('/api/media-type')
            .set('Authorization', `Bearer ${token}`)
            .send("")
        expect(res.statusCode).toBe(400)
        expect(res.body.message).toMatch(/invalid/i)
    })

    test('Create duplicate media type fails', async () => {
        const mediaTypeName = 'DuplicateType'

        await request(app)
            .post('/api/media-type')
            .set('Authorization', `Bearer ${token}`)
            .send({ name: mediaTypeName })
        const res = await request(app)
            .post('/api/media-type')
            .set('Authorization', `Bearer ${token}`)
            .send({ name: mediaTypeName })
        expect(res.statusCode).toBe(409)
        expect(res.body.message).toMatch(/already exists/i)
    })

    test('Fetch all media types returns array', async () => {
        const mediaTypeName = 'FetchTestType'
        await request(app)
            .post('/api/media-type')
            .set('Authorization', `Bearer ${token}`)
            .send({ name: mediaTypeName })
        const res = await request(app)
            .get('/api/media-type')
            .set('Authorization', `Bearer ${token}`)
        expect(res.statusCode).toBe(200)
        expect(Array.isArray(res.body)).toBe(true)
        expect(res.body.some(mt => mt.name === normalizeTypeName(mediaTypeName))).toBe(true)
    })

    test('Delete media type succeeds', async () => {
        const mediaTypeName = 'DeleteTest'
 
        const mediaType = await prisma.mediaType.create({ 
            data: { 
                name: normalizeTypeName(mediaTypeName), 
                userId: user.id 
            } 
        })
        
        const res = await request(app)
            .delete(`/api/media-type/${encodeURIComponent(mediaType.name)}`)
            .set('Authorization', `Bearer ${token}`)
            .send({ confirm: true }) 
        expect(res.statusCode).toBe(200)
        expect(res.body.message).toMatch(/deleted successfully/i)
    })

    test('Delete non-existent media type fails', async () => {
        const res = await request(app)
            .delete('/api/media-type/HhahahahHA')
            .set('Authorization', `Bearer ${token}`)
            .send( { confirm: true })
        expect(res.statusCode).toBe(404)
        expect(res.body.message).toMatch(/that you created/i)
    })

    test('Rename media type succeeds', async () => {
        const mediaTypeName = 'RenameTest'

        await request(app)
            .post('/api/media-type')
            .set('Authorization', `Bearer ${token}`)
            .send({ name: mediaTypeName })
        const res = await request(app)
            .put(`/api/media-type/${encodeURIComponent(mediaTypeName)}`)
            .set('Authorization', `Bearer ${token}`)
            .send({ newName: 'RenamedType' })
        expect(res.statusCode).toBe(200)
        expect(res.body.name).toBe('renamedtype')
    })

    test('Rename media type that user doesnt own fails', async () => {
        const res = await request(app)
            .put(`/api/media-type/book)}`)
            .set('Authorization', `Bearer ${token}`)
            .send({ newName: 'RenamedType' })
        expect(res.statusCode).toBe(404)
        expect(res.body.message).toMatch(/that you created/i)
    })

    test('Rename media type to existing name fails', async () => {
        await request(app)
            .post('/api/media-type')
            .set('Authorization', `Bearer ${token}`)
            .send({ name: 'TypeA' })
        await request(app)
            .post('/api/media-type')
            .set('Authorization', `Bearer ${token}`)
            .send({ name: 'TypeB' })
            
        const res = await request(app)
            .put('/api/media-type/TypeA')
            .set('Authorization', `Bearer ${token}`)
            .send({ newName: 'TypeB' })
        expect(res.statusCode).toBe(409)
        expect(res.body.message).toMatch(/already exists/i)
    })

    test('Rename non-existent media type fails', async () => {
        const res = await request(app)
            .put('/api/media-type/NoSuchType')
            .set('Authorization', `Bearer ${token}`)
            .send({ newName: 'Anything' })
        expect(res.statusCode).toBe(404)
        expect(res.body.message).toMatch(/that you created/i)
    })

    test('Rename media type with missing newName fails', async () => {
        const mediaTypeName = 'MissingNewNameTest'

        await request(app)
            .post('/api/media-type')
            .set('Authorization', `Bearer ${token}`)
            .send({ name: mediaTypeName })
        const res = await request(app)
            .put(`/api/media-type/${encodeURIComponent(mediaTypeName)}`)
            .set('Authorization', `Bearer ${token}`)
            .send("  ")
        expect(res.statusCode).toBe(400)
        expect(res.body.message).toMatch(/invalid/i)
    })

    test('Delete media type with associated media without confirmation fails with prompt', async () => {
        const mediaTypeName = 'ConfirmDeleteTest'
        const mediaType = await prisma.mediaType.create({ 
            data: { 
                name: normalizeTypeName(mediaTypeName), 
                userId: user.id 
            } 
        })

        await prisma.media.create({
            data: {
                title: 'Test Media',
                mediaTypeId: mediaType.id,
                userId: user.id
            }
        })

        // Attempt to delete the media type without confirmation
        const res = await request(app)
            .delete(`/api/media-type/${encodeURIComponent(mediaTypeName)}`)
            .set('Authorization', `Bearer ${token}`)
            .send({ confirm: false }) // no confirm

        expect(res.statusCode).toBe(200)
        expect(res.body.message).toMatch(/confirm deletion/i)
        expect(res.body.mediaCount).toBe(1)
    })

    test('Creation fails with empty string after trimming', async () => {
        const res = await request(app)
            .post('/api/media-type')
            .set('Authorization', `Bearer ${token}`)
            .send({ name: '    ' })
        expect(res.statusCode).toBe(400)
    })

    test('Unauthorized request fails', async () => {
        const res = await request(app).post('/api/media-type').send({ name: 'Test' })
        expect(res.statusCode).toBe(401) 
    })
})