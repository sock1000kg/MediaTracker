import request from 'supertest' 
import app from '../../src/app.js' 
import { prisma } from '../jest.setup.mjs' 

import { normalizeTypeName } from '../../src/utilities.js'

describe('Log routes', () => {
    const username = 'LogTestUser'
    const password = 'StrongPass1!'
    const mediaTypeName = 'TestType'
    const mediaName = 'TestMedia'
    let token, user, mediaType, media

    beforeAll(async () => {
        //refresh the db and creates a new user
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
            data: { name: normalizeTypeName(mediaTypeName), userId: user.id }
        })

        //Create a media for this user
        media = await prisma.media.create({
            data: { 
                title: mediaName,
                mediaTypeId: mediaType.id, 
                userId: user.id 
            }
        })
    })

    afterEach(async () => {
        await prisma.userLogs.deleteMany({
            where: { userId: user.id }
        })
    })

    afterAll(async () => {
        await prisma.media.deleteMany({ where: { userId: user.id } })
        await prisma.mediaType.deleteMany({ where: { userId: user.id } })
        await prisma.user.delete({ where: { username } })
    })

    test('Create log succeeds', async () => {
        const res = await request(app)
            .post('/logs')
            .set('Authorization', `Bearer ${token}`)
            .send({
                mediaId: media.id,
                status: 'Completed',
                rating: 95,
                notes: 'Great media!'
            })
        expect(res.statusCode).toBe(201)
        expect(res.body.userId).toBe(user.id)
        expect(res.body.mediaId).toBe(media.id)
        expect(res.body.status).toBe('Completed')
    })

    test('Create log without mediaId fails', async () => {
        const res = await request(app)
            .post('/logs')
            .set('Authorization', `Bearer ${token}`)
            .send({
                status: 'Completed',
                rating: 80,
                notes: 'Missing mediaId'
            })
        expect(res.statusCode).toBe(400)
        expect(res.body.error).toMatch(/media/i)
    })

    test('Create duplicate log fails', async () => {
        await request(app)
            .post('/logs')
            .set('Authorization', `Bearer ${token}`)
            .send({
                mediaId: media.id,
                status: 'Completed',
                rating: 90,
                notes: 'First log'
            })
        const res = await request(app)
            .post('/logs')
            .set('Authorization', `Bearer ${token}`)
            .send({
                mediaId: media.id,
                status: 'In Progress',
                rating: 85,
                notes: 'Duplicate log'
            })
        expect(res.statusCode).toBe(409)
        expect(res.body.error).toMatch(/already exists/i)
    })

    test('Create log for non-existent media fails', async () => {
        const res = await request(app)
            .post('/logs')
            .set('Authorization', `Bearer ${token}`)
            .send({
                mediaId: 999999,
                status: 'Completed',
                rating: 80
            })
        expect(res.statusCode).toBe(404)
        expect(res.body.error).toMatch(/does not exist/i)
    })

    test('Fetch all logs returns array', async () => {
        await prisma.userLogs.create({
            data: {
                userId: user.id,
                mediaId: media.id,
                status: 'Completed',
                rating: 100,
                notes: 'Existing log'
            }
        })

        const res = await request(app)
            .get('/logs')
            .set('Authorization', `Bearer ${token}`)
        expect(res.statusCode).toBe(200)
        expect(Array.isArray(res.body)).toBe(true)
        expect(res.body.some(log => log.mediaId === media.id)).toBe(true)
    })

    test('Create log without token fails', async () => {
        const res = await request(app)
            .post('/logs')
            .send({
                mediaId: media.id,
                status: 'Completed',
                rating: 50
            })
        expect(res.statusCode).toBe(401)
    })

    test('Response includes expected fields', async () => {
        const res = await request(app)
            .post('/logs')
            .set('Authorization', `Bearer ${token}`)
            .send({
                mediaId: media.id,
                status: 'Completed',
                rating: 88,
                notes: 'Check schema'
            })
        expect(res.body).toEqual(
            expect.objectContaining({
                id: expect.any(Number),
                userId: user.id,
                mediaId: media.id,
                status: expect.any(String),
                rating: expect.any(Number),
                notes: expect.any(String)
            })
        )
    })
})