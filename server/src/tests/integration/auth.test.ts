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
})
