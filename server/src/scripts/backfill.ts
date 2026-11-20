// One-off data backfills, run directly (not through the queue): `npm run backfill -- [music|openlibrary|all]`
import "@/env.js"
import prisma from "@/prismaClient.js"
import { parseBackfillTarget, runBackfill } from "./backfillRunner.js"

try {
    const target = parseBackfillTarget(process.argv[2])
    console.log(`Backfill: ${target}`)
    await runBackfill(target)
    console.log("Backfill finished")
    await prisma.$disconnect()
    process.exit(0)
} catch (error) {
    console.error("Backfill failed:", error)
    await prisma.$disconnect().catch(() => undefined)
    process.exit(1)
}
