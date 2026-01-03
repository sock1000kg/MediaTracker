import { AppError } from "@/api/domain/error.js"
import prisma from "@/prismaClient.js"
import { findUserByUsername } from "@/repositories/authRepository.js"
import { deleteAllLogsForUser } from "@/repositories/logsRepository.js"
import { deleteAllMediasForUser } from "@/repositories/mediaRepository.js"
import { deleteAllMediaTypeForUser } from "@/repositories/mediaTypeRepository.js"
import { seedDatabase } from "@/tests/seed.js"

export class DemoService {
    async resetDemoUser() {
        console.log("\x1b[1m\x1b[32mStarting Demo Account Reset\x1b[0m")
            const demoUser = await findUserByUsername("demo", prisma)
            if (!demoUser) {
                console.log("\x1b[1m\x1b[31mDemo User does not exist\x1b[0m")
                return
            }

            prisma.$transaction(async (tx) => {
                await deleteAllMediaTypeForUser(demoUser.id, tx)
                await deleteAllMediasForUser(demoUser.id, tx)
                await deleteAllLogsForUser(demoUser.id, tx)
            })

            console.log("\x1b[1m\x1b[32mDemo Account Wiped\x1b[0m")
            await seedDatabase()
            console.log("\x1b[1m\x1b[32mDemo Account Successful Reset Yay\x1b[0m")
    }

    async ensureNotDemo(userId: number) {
        const demoUser = await findUserByUsername("demo", prisma)
        if (!demoUser) {
            throw new AppError("Demo user missing", 404)
        }
        if (userId === demoUser.id) {
            throw new AppError("This feature is not available on demo account", 400)
        }
    }
}

export const demoService = new DemoService()