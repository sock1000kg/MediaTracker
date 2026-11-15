import '../env.js'
import prisma from '../prismaClient.js'
import { seedDatabase } from './seed.js'

export async function resetTestData(client = prisma): Promise<void> {
    const rows = await client.$queryRaw<{ tablename: string }[]>`SELECT table_name AS tablename FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations'`
    if (rows.length > 0) {
        const tableList = rows.map(r => '"' + r.tablename.replace(/"/g, '""') + '"').join(', ')
        await client.$executeRawUnsafe(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`)
    }
    await seedDatabase()
}
