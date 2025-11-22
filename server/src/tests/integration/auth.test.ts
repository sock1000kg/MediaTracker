import request from 'supertest' 
import { createApp } from '@/app.js' 
import { prisma } from '@/tests/jest.setup.js' 

const app = createApp({ disableRateLimit: true});

describe('Auth Routes', () => {
    test('Register with valid credentials succeeds', async () => {
        const res = await request(app)
            .post('/auth/register')
            .send({ username: 'TestUser123', password: 'StrongPass1!', displayName: 'Tester' })
            .set('Content-Type', 'application/json');
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty('token');
        expect(res.body.user.username).toBe('TestUser123');

        //Clean up
        await prisma.user.deleteMany({
            where: { username: 'TestUser123' }
        })
    }) 

    test('Register with missing username fails', async () => {
        const res = await request(app)
            .post('/auth/register')
            .send({ password: 'StrongPass1!' })
            .set('Content-Type', 'application/json') 
        expect(res.statusCode).toBe(400) 
        expect(res.body.message).toMatch(/Username must be/i) 
    }) 

    test('Register with weak password fails', async () => {
        const res = await request(app)
            .post('/auth/register')
            .send({ username: 'WeakUser', password: '123', displayName: 'Tester' })
            .set('Content-Type', 'application/json') 
        expect(res.statusCode).toBe(400) 
        expect(res.body.message).toMatch(/password/i) 
    }) 

    test('Register with duplicate username fails', async () => {
        // Register once
        await request(app)
            .post('/auth/register')
            .send({ username: 'DupUser', password: 'StrongPass1!', displayName: 'Tester' })
            .set('Content-Type', 'application/json') 
        // Register again
        const res = await request(app)
            .post('/auth/register')
            .send({ username: 'DupUser', password: 'StrongPass1!', displayName: 'Tester' })
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
            .send({ username: 'LoginUser', password: 'StrongPass1!', displayName: 'Tester' })
            .set('Content-Type', 'application/json') 
        // Login
        const res = await request(app)
            .post('/auth/login')
            .send({ username: 'LoginUser', password: 'StrongPass1!' })
            .set('Content-Type', 'application/json') 
        expect(res.statusCode).toBe(200) 
        expect(res.body).toHaveProperty('token') 
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
            .send({ username: 'LoginUser', password: 'StrongPass1!', displayName: 'Tester' })
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
}) 