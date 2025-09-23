// jest.config.ts
import type { Config } from '@jest/types'

const config: Config.InitialOptions = {
    testEnvironment: 'node',
    moduleFileExtensions: ['js', 'mjs'],
    // Run only compiled integration tests; keep setup file out of testMatch
    setupFilesAfterEnv: ['./dist/tests/jest.setup.js'],
    testMatch: [
        '<rootDir>/dist/tests/**/*.test.js'
    ],
    transform: {},
    moduleNameMapper: {
        // Map compiled aliases to compiled output under dist
        '^@/(.*)\\.js$': '<rootDir>/dist/$1.js',
    },
}

export default config
