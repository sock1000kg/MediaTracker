import { jest } from "@jest/globals"
import { seedDatabase } from "@/tests/seed.js"
import { demoMediaSeeder, seedDemoMedia, DemoFixture } from "@/tests/fixtures/demo/seedDemoMedia.js"
import { demoService } from "@/services/demoService.js"
import prisma from "@/prismaClient.js"
import { findUserByUsername } from "@/repositories/authRepository.js"

describe("seedDatabase strict vs non-strict and error propagation (Fix 4)", () => {
    let demoUserId: number

    beforeAll(async () => {
        const demo = await findUserByUsername("demo", prisma)
        if (!demo) throw new Error("Demo user not found")
        demoUserId = demo.id
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    test("1. seedDemoMedia wraps item failures naming title and source:sourceId", async () => {
        const brokenFixture: DemoFixture = {
            collections: [],
            items: [
                {
                    mediaTypeName: "non_existent_media_type_that_fails",
                    media: {
                        title: "Broken Title",
                        source: "rawg",
                        sourceId: "999999",
                        creator: null,
                        year: null,
                        description: null,
                        imageUrl: null,
                    },
                    log: {
                        status: "completed",
                        loggedAt: "2025-01-01T00:00:00Z",
                    },
                    collections: [],
                },
            ],
        }

        await expect(seedDemoMedia(demoUserId, prisma, brokenFixture)).rejects.toThrow(
            /Demo fixture item "Broken Title" \(rawg:999999\) failed:/
        )
    })

    test("2. strict seedDatabase rejects when seedDemoMedia throws", async () => {
        const failure = new Error('Demo fixture item "Broken Title" (rawg:999999) failed: db error')
        jest.spyOn(demoMediaSeeder, "seedDemoMedia").mockRejectedValue(failure)

        await expect(seedDatabase({ seedDemoFixture: true, strict: true })).rejects.toThrow(
            'Demo fixture item "Broken Title" (rawg:999999) failed: db error'
        )
    })

    test("3. non-strict seedDatabase resolves and logs console.error without crashing", async () => {
        const failure = new Error('Demo fixture item "Broken Title" (rawg:999999) failed: network timeout')
        jest.spyOn(demoMediaSeeder, "seedDemoMedia").mockRejectedValue(failure)
        const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {})

        await expect(seedDatabase({ seedDemoFixture: true, strict: false })).resolves.toBeUndefined()

        expect(consoleErrorSpy).toHaveBeenCalledWith(
            "Demo fixture seeding failed (continuing startup):",
            expect.stringContaining('Demo fixture item "Broken Title" (rawg:999999) failed: network timeout')
        )
    })

    test("4. resetDemoUser propagates error under strict mode", async () => {
        const failure = new Error('Demo fixture item "Broken Title" (rawg:999999) failed: transaction aborted')
        jest.spyOn(demoMediaSeeder, "seedDemoMedia").mockRejectedValue(failure)

        await expect(demoService.resetDemoUser()).rejects.toThrow(
            'Demo fixture item "Broken Title" (rawg:999999) failed: transaction aborted'
        )
    })

    test("5. seedDatabase accepts test-only dependency injection deps.seedDemo", async () => {
        const injectedFailure = new Error("injected boom")
        await expect(
            seedDatabase(
                { seedDemoFixture: true, strict: true },
                { seedDemo: async () => { throw injectedFailure } }
            )
        ).rejects.toThrow("injected boom")
    })
})
