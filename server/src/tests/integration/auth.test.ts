import crypto from 'crypto'
import request from 'supertest' 
import app from '@/app.js' 
import { prisma } from '@/tests/jest.setup.js' 

describe('Auth Routes', () => {
    test('Register with valid credentials succeeds', async () => {
        const res = await request(app)
            .post('/auth/register')
            .send({ 
                username: 'TestUser123', 
                password: 'StrongPass1!', 
                displayName: 'Tester', 
                registerKey: process.env.REGISTER_KEY
            })
            .set('Content-Type', 'application/json');
        expect(res.statusCode).toBe(201);
        expect(res.body).toHaveProperty('accessToken');
        expect(res.body.user.username).toBe('TestUser123');

        //Clean up
        await prisma.user.deleteMany({
            where: { username: 'TestUser123' }
        })
    }) 

    test('Register with missing username fails', async () => {
        const res = await request(app)
            .post('/auth/register')
            .send({ password: 'StrongPass1!', registerKey: process.env.REGISTER_KEY })
            .set('Content-Type', 'application/json') 
        expect(res.statusCode).toBe(400) 
        expect(res.body.message).toMatch(/Username must be/i) 
    }) 

    test('Register with missing registerKey fails', async () => {
        const res = await request(app)
            .post('/auth/register')
            .send({ 
                username: 'TestUser123', 
                password: 'StrongPass1!', 
                displayName: 'Tester', 
            })
            .set('Content-Type', 'application/json') 
        expect(res.statusCode).toBe(403) 
        expect(res.body.message).toMatch(/Invalid/i) 
    }) 

    test('Register with weak password fails', async () => {
        const res = await request(app)
            .post('/auth/register')
            .send({ username: 'WeakUser', password: '123', displayName: 'Tester', registerKey: process.env.REGISTER_KEY })
            .set('Content-Type', 'application/json') 
        expect(res.statusCode).toBe(400) 
        expect(res.body.message).toMatch(/password/i) 
    }) 

    test('Register with duplicate username fails', async () => {
        // Register once
        await request(app)
            .post('/auth/register')
            .send({ username: 'DupUser', password: 'StrongPass1!', displayName: 'Tester', registerKey: process.env.REGISTER_KEY })
            .set('Content-Type', 'application/json') 
        // Register again
        const res = await request(app)
            .post('/auth/register')
            .send({ username: 'DupUser', password: 'StrongPass1!', displayName: 'Tester', registerKey: process.env.REGISTER_KEY })
            .set('Content-Type', 'application/json') 
        expect(res.statusCode).toBe(400) 
        expect(res.body.message).toMatch(/Username already taken/i)
        
        //Clean up
        await prisma.user.deleteMany({
            where: { username: 'DupUser' }
        })
    }) 

    test('Login with correct credentials succeeds', async () => {
        // Register user first
        await request(app)
            .post('/auth/register')
            .send({ username: 'LoginUser', password: 'StrongPass1!', displayName: 'Tester', registerKey: process.env.REGISTER_KEY })
            .set('Content-Type', 'application/json') 
        // Login
        const res = await request(app)
            .post('/auth/login')
            .send({ username: 'LoginUser', password: 'StrongPass1!' })
            .set('Content-Type', 'application/json') 
        expect(res.statusCode).toBe(200) 
        expect(res.body).toHaveProperty('accessToken') 
        expect(res.body.user.username).toBe('LoginUser') 

        //Clean up
        await prisma.user.deleteMany({
            where: { username: 'LoginUser' }
        })
    }) 

    test('Login with wrong password fails', async () => {
        // Register user first
        await request(app)
            .post('/auth/register')
            .send({ username: 'LoginUser', password: 'StrongPass1!', displayName: 'Tester', registerKey: process.env.REGISTER_KEY })
            .set('Content-Type', 'application/json') 

        const res = await request(app)
            .post('/auth/login')
            .send({ username: 'LoginUser', password: 'WrongPass123!'})
            .set('Content-Type', 'application/json') 
        expect(res.statusCode).toBe(401) 
        expect(res.body.message).toMatch(/Invalid password/i) 

        //Clean up
        await prisma.user.deleteMany({
            where: { username: 'LoginUser' }
        })
    }) 

    test('Login with non-existent user fails', async () => {
        const res = await request(app)
            .post('/auth/login')
            .send({ username: 'NoSuchUser', password: 'SomePass1!' })
            .set('Content-Type', 'application/json') 
        expect(res.statusCode).toBe(404) 
        expect(res.body.message).toMatch(/Cannot find user/i) 
    }) 

    test('Login with missing fields fails', async () => {
        const res = await request(app)
            .post('/auth/login')
            .send({ username: 'LoginUser' })
            .set('Content-Type', 'application/json') 
        expect(res.statusCode).toBe(400) 
        expect(res.body.message).toMatch(/Invalid input/i) 
    }) 

    test('Concurrent refreshes with the same cookie: one wins, the loser neither 500s nor clears the cookie', async () => {
        const reg = await request(app)
            .post('/auth/register')
            .send({ username: 'RaceUser1', password: 'StrongPass1!', displayName: 'Racer', registerKey: process.env.REGISTER_KEY })
            .set('Content-Type', 'application/json')
        expect(reg.statusCode).toBe(201)
        const cookie = reg.headers['set-cookie'] as unknown as string[]

        const [a, b] = await Promise.all([
            request(app).post('/auth/refresh').set('Cookie', cookie),
            request(app).post('/auth/refresh').set('Cookie', cookie),
        ])
        const results = [a, b]
        expect(results.map(r => r.statusCode).sort()).toEqual([200, 401])
        const winner = results.find(r => r.statusCode === 200)!
        const loser = results.find(r => r.statusCode === 401)!
        expect(((winner.headers['set-cookie'] ?? []) as unknown as string[]).join(';')).toMatch(/refreshToken=[^;]+/)
        const loserCookies = ((loser.headers['set-cookie'] ?? []) as unknown as string[]).join(';')
        expect(loserCookies).not.toMatch(/refreshToken=;/)

        await prisma.user.deleteMany({ where: { username: 'RaceUser1' } })
    })

    test('Refresh without a cookie is a 401 with a message, not a 500, and sets no cookie', async () => {
        const res = await request(app).post('/auth/refresh')
        expect(res.statusCode).toBe(401)
        expect(res.body.message).toMatch(/No refresh token/i)
        expect(res.headers['set-cookie']).toBeUndefined()
    })

    test('Refresh with a garbage cookie keeps its status (401)', async () => {
        const res = await request(app).post('/auth/refresh').set('Cookie', ['refreshToken=not-a-real-token'])
        expect(res.statusCode).toBe(401)
        expect(typeof res.body.message).toBe('string')
    })

    test('Refresh tokens are stored hashed (sha256 hex), rotated on refresh, and deleted on logout', async () => {
        const username = 'HashedTokenUser'
        const reg = await request(app)
            .post('/auth/register')
            .send({ username, password: 'StrongPass1!', displayName: 'Hasher', registerKey: process.env.REGISTER_KEY })
            .set('Content-Type', 'application/json')
        expect(reg.statusCode).toBe(201)
        const userId = reg.body.user.id

        const cookie = reg.headers['set-cookie'] as unknown as string[]
        const cookieStr = cookie.join(';')
        const match = cookieStr.match(/refreshToken=([^;]+)/)
        expect(match).toBeTruthy()
        const rawToken = match![1]

        // 1. No raw token stored: table holds no row whose tokenHash equals rawToken
        const rawMatch = await prisma.refreshToken.findFirst({
            where: { tokenHash: rawToken }
        })
        expect(rawMatch).toBeNull()

        // 2. The stored value is its sha256 hex
        const expectedHash = crypto.createHash('sha256').update(rawToken).digest('hex')
        const hashedRow = await prisma.refreshToken.findUnique({
            where: { tokenHash: expectedHash }
        })
        expect(hashedRow).not.toBeNull()
        expect(hashedRow!.userId).toBe(userId)

        // 3. Refresh works with cookie token and rotates token (old one no longer works)
        const refreshRes = await request(app)
            .post('/auth/refresh')
            .set('Cookie', cookie)
        expect(refreshRes.statusCode).toBe(200)
        expect(refreshRes.body).toHaveProperty('accessToken')

        const newCookie = refreshRes.headers['set-cookie'] as unknown as string[]
        const newMatch = newCookie.join(';').match(/refreshToken=([^;]+)/)
        expect(newMatch).toBeTruthy()
        const newRawToken = newMatch![1]
        expect(newRawToken).not.toBe(rawToken)

        // Old token hash should now be deleted from DB
        const oldHashedRow = await prisma.refreshToken.findUnique({
            where: { tokenHash: expectedHash }
        })
        expect(oldHashedRow).toBeNull()

        // Old cookie token fails on subsequent refresh
        const oldRefreshRes = await request(app)
            .post('/auth/refresh')
            .set('Cookie', cookie)
        expect(oldRefreshRes.statusCode).toBe(401)

        // New token hash is present
        const expectedNewHash = crypto.createHash('sha256').update(newRawToken).digest('hex')
        const newHashedRow = await prisma.refreshToken.findUnique({
            where: { tokenHash: expectedNewHash }
        })
        expect(newHashedRow).not.toBeNull()

        // 4. Logout deletes the token found by its hash
        const logoutRes = await request(app)
            .post('/auth/logout')
            .set('Cookie', newCookie)
        expect(logoutRes.statusCode).toBe(204)

        const afterLogoutRow = await prisma.refreshToken.findUnique({
            where: { tokenHash: expectedNewHash }
        })
        expect(afterLogoutRow).toBeNull()

        // Clean up user
        await prisma.user.deleteMany({ where: { username } })
    })

    test('Old raw rows in tokenHash do not authenticate', async () => {
        const username = 'OldRawRowUser'
        const reg = await request(app)
            .post('/auth/register')
            .send({ username, password: 'StrongPass1!', displayName: 'OldRaw', registerKey: process.env.REGISTER_KEY })
            .set('Content-Type', 'application/json')
        expect(reg.statusCode).toBe(201)
        const userId = reg.body.user.id

        // Create a real signed JWT refresh token as the raw value
        const cookie = reg.headers['set-cookie'] as unknown as string[]
        const match = cookie.join(';').match(/refreshToken=([^;]+)/)
        const rawJwtToken = match![1]

        // Clear tokens
        await prisma.refreshToken.deleteMany({ where: { userId } })

        // Insert the raw token directly into tokenHash column (simulating an un-hashed old row)
        const expiresAt = new Date()
        expiresAt.setDate(expiresAt.getDate() + 7)
        await prisma.refreshToken.create({
            data: {
                userId,
                tokenHash: rawJwtToken, // RAW token inserted into tokenHash
                expiresAt,
            }
        })

        // Attempting to refresh with the raw cookie token fails because server looks up sha256(rawJwtToken)
        const res = await request(app)
            .post('/auth/refresh')
            .set('Cookie', [`refreshToken=${rawJwtToken}`])
        expect(res.statusCode).toBe(401)

        await prisma.user.deleteMany({ where: { username } })
    })
})
