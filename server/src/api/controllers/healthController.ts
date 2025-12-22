
import prisma from "@/prismaClient.js"
import type { Request, Response } from "express"

export const healthCheck = async (req: Request, res: Response) => {
    try {
        await prisma.$queryRaw`SELECT 1`

        res.status(200).json({ status: "SERVER AND DB OK" })
    } catch (error) {
        console.error('Health check failed: ', error)

        res.status(500).json({ status: 'unhealthy', error: error instanceof Error ? error.message : error })
    }
}