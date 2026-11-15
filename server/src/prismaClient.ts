import '@/env.js'
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "@/db.js"

const connectionString = process.env.DATABASE_URL
const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter })

export default prisma
