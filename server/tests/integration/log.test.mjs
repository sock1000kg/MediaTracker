import request from 'supertest' 
import app from '../../src/app.js' 
import { prisma } from '../jest.setup.mjs' 

import { normalizeTypeName } from '../../src/utilities.js'

describe('Log routes', () => {
    const username = 'LogTestUser'
    const password = 'StrongPass1!'
    const mediaTypeName = 'TestType'
    const mediaName = 'TestMedia'
    const displayName = 'Tester'
    let token, user, mediaType, media, log

    beforeAll(async () => {
        //refresh the db and creates a new user
        await prisma.user.deleteMany({ where: { username } })
        await request(app)
            .post('/auth/register')
            .send({ username, password, displayName })
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
            where: { userId: user.id, mediaId: media.id } 
        })
    })

    afterAll(async () => {
        await prisma.media.deleteMany({ where: { userId: user.id } })
        await prisma.mediaType.deleteMany({ where: { userId: user.id } })
        await prisma.user.delete({ where: { username } })
    })

    describe('Create and fetch logs', () => {
    //FETCH
    test('Fetch all logs returns array', async () => {
            await prisma.userLogs.create({
                data: {
                    userId: user.id,
                    mediaId: media.id,
                    status: 'completed',
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

    //CREATE
    test('Create log succeeds', async () => {
        const res = await request(app)
            .post('/logs')
            .set('Authorization', `Bearer ${token}`)
            .send({
                mediaId: media.id,
                status: 'completed',
                rating: 95,
                notes: 'Great media!'
            })
        expect(res.statusCode).toBe(201)
        expect(res.body.userId).toBe(user.id)
        expect(res.body.mediaId).toBe(media.id)
        expect(res.body.status).toBe('completed')
    })

    test('Create log without mediaId fails', async () => {
        const res = await request(app)
            .post('/logs')
            .set('Authorization', `Bearer ${token}`)
            .send({
                status: 'completed',
                rating: 80,
                notes: 'Missing mediaId'
            })
        expect(res.statusCode).toBe(400)
        expect(res.body.error).toMatch(/media/i)
    })

    test('Create duplicate log fails', async () => {
            await prisma.userLogs.create({
                data: {
                    userId: user.id,
                    mediaId: media.id,
                    status: 'completed',
                    rating: 100,
                    notes: 'Existing log'
                }
            })
    
        const res = await request(app)
            .post('/logs')
            .set('Authorization', `Bearer ${token}`)
            .send({
                mediaId: media.id,
                status: 'in progress',
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
                status: 'completed',
                rating: 80
            })
        expect(res.statusCode).toBe(404)
        expect(res.body.error).toMatch(/does not exist/i)
    })

    test('Create log without token fails', async () => {
        const res = await request(app)
            .post('/logs')
            .send({
                mediaId: media.id,
                status: 'completed',
                rating: 50
            })
        expect(res.statusCode).toBe(401)
    })

    test('Response for creating log includes expected fields', async () => {
        const res = await request(app)
            .post('/logs')
            .set('Authorization', `Bearer ${token}`)
            .send({
                mediaId: media.id,
                status: 'completed',
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

    //UPDATE
    describe('Update logs', () => {
        beforeEach(async () => {
            // Create a fresh log before each test
            log = await prisma.userLogs.create({
                data: {
                    userId: user.id,
                    mediaId: media.id,
                    status: 'in progress',
                    rating: 70,
                    notes: 'Initial notes'
                }
            })
        })
    
    test('Successfully updates all fields', async () => {
        const res = await request(app)
            .put(`/logs/${log.id}`)
            .set('Authorization', `Bearer ${token}`)
            .send({
                status: 'completed',
                rating: 95,
                notes: 'Updated notes'
            })

        expect(res.statusCode).toBe(200)
        expect(res.body.id).toBe(log.id)
        expect(res.body.status).toBe('completed')
        expect(res.body.rating).toBe(95)
        expect(res.body.notes).toBe('Updated notes')
    })

    test('Partial update only changes provided fields', async () => {
        const res = await request(app)
            .put(`/logs/${log.id}`)
            .set('Authorization', `Bearer ${token}`)
            .send({ rating: 85 }) // only rating

        expect(res.statusCode).toBe(200)
        expect(res.body.rating).toBe(85)
            expect(res.body.status).toBe('in progress') // unchanged
            expect(res.body.notes).toBe('Initial notes') // unchanged
    })

    test('Fails to update non-existent log', async () => {
        const res = await request(app)
            .put('/logs/999999')
            .set('Authorization', `Bearer ${token}`)
            .send({ status: 'completed' })

        expect(res.statusCode).toBe(404)
        expect(res.body.error).toMatch(/does not exist/i)
    })

    test('Fails to update log belonging to another user', async () => {
        const otherUser = await prisma.user.create({ data: { username: 'OtherUser', password: 'Pass123!' } })
        const otherLog = await prisma.userLogs.create({
            data: {
                userId: otherUser.id,
                mediaId: media.id,
                status: 'in progress',
                rating: 50
            }
        })

        const res = await request(app)
            .put(`/logs/${otherLog.id}`)
            .set('Authorization', `Bearer ${token}`)
            .send({ status: 'completed' })

        expect(res.statusCode).toBe(401)
        expect(res.body.error).toMatch(/do not own/i)

        await prisma.userLogs.delete({ where: { id: otherLog.id } })
        await prisma.user.delete({ where: { id: otherUser.id } })
    })

    test('Fails without token', async () => {
        const res = await request(app)
            .put(`/logs/${log.id}`)
            .send({ status: 'completed' })

        expect(res.statusCode).toBe(401)
    })

    test('Sanitization nullifies invalid rating', async () => {
        const res = await request(app)
            .put(`/logs/${log.id}`)
            .set('Authorization', `Bearer ${token}`)
            .send({ rating: 9999 })

        // sanitizeRating clamps/returns null
        expect(res.statusCode).toBe(200)
        expect(res.body.rating).toBe(70) // unchanged because invalid was ignored
    })

    test('Sanitization nullifies invalid status', async () => {
        const res = await request(app)
            .put(`/logs/${log.id}`)
            .set('Authorization', `Bearer ${token}`)
            .send({ status: 'NotAStatus' })

        expect(res.statusCode).toBe(200)
        expect(res.body.status).toBe('in progress') // unchanged
    })

    test('Sanitization trims notes and limits length', async () => {
        const longNotes = 'a'.repeat(6000) // >5000 chars
        const res = await request(app)
            .put(`/logs/${log.id}`)
            .set('Authorization', `Bearer ${token}`)
            .send({ notes: longNotes })

        expect(res.statusCode).toBe(200)
        expect(res.body.notes.length).toBe(5000)
    })
})

    describe('Delete logs', () => {
        beforeEach(async () => {
            // Create a fresh log before each test
            log = await prisma.userLogs.create({
                data: {
                    userId: user.id,
                    mediaId: media.id,
                    status: 'in progress',
                    rating: 70,
                    notes: 'Initial notes'
                }
            })
        })

        test('Successfully deletes a log', async () => {
            const res = await request(app)
                .delete(`/logs/${log.id}`)
                .set('Authorization', `Bearer ${token}`)

            expect(res.statusCode).toBe(200)
            expect(res.body).toEqual({ message: 'Log deleted' })

            // Ensure log is actually deleted
            const deleted = await prisma.userLogs.findUnique({ where: { id: log.id } })
            expect(deleted).toBeNull()
        })

        test('Fails to delete non-existent log', async () => {
            const res = await request(app)
                .delete('/logs/999999')
                .set('Authorization', `Bearer ${token}`)

            expect(res.statusCode).toBe(404)
            expect(res.body.error).toMatch(/does not exist/i)
        })

        test('Fails to delete log belonging to another user', async () => {
            const otherUser = await prisma.user.create({ data: { username: 'OtherUser', password: 'Pass123!' } })
            const otherLog = await prisma.userLogs.create({
                data: {
                    userId: otherUser.id,
                    mediaId: media.id,
                    status: 'in progress',
                    rating: 50
                }
            })

            const res = await request(app)
                .delete(`/logs/${otherLog.id}`)
                .set('Authorization', `Bearer ${token}`)

            expect(res.statusCode).toBe(401)
            expect(res.body.error).toMatch(/do not own/i)

            await prisma.userLogs.delete({ where: { id: otherLog.id } })
            await prisma.user.delete({ where: { id: otherUser.id } })
        })

        test('Fails without token', async () => {
            const res = await request(app)
                .delete(`/logs/${log.id}`)

            expect(res.statusCode).toBe(401)
        })
    })
})

