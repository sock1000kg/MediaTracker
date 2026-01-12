import prisma from "@/prismaClient.js";
import { demoService } from "@/services/demoService.js";

demoService.resetDemoUser()
    .then(async () => {
        await prisma.$disconnect()
        process.exit(1)
    })
    .catch(async (error) => {
        console.error(error)
        await prisma.$disconnect()
        process.exit(0)
    })