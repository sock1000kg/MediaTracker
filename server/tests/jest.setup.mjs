// jest.setup.mjs
import dotenv from 'dotenv'
dotenv.config({ path: '.env.test' })

// Import Prisma dynamically after env is loaded cus apparently 'import' is hoisted before everything in ES Modules (fucking stupid)
const { PrismaClient } = await import('@prisma/client')
const prisma = new PrismaClient()

import resetTestDb from './reset-test-db.js' //reset+seed test db


beforeAll(async () => {
    if (process.env.NODE_ENV !== 'test') {
        throw new Error('Tests must be run with NODE_ENV=test')
    }

    console.log('Using database:', process.env.DATABASE_URL)
    if (!process.env.DATABASE_URL.includes('_test')) {
        throw new Error('DATABASE_URL must point to test database')
    }
    await prisma.$connect()
    await resetTestDb()
})

afterEach(async () => {
})

afterAll(async () => {
    await prisma.$disconnect()
})

export {prisma}