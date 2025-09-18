// jest.config.ts
import type { Config } from '@jest/types'

const config: Config.InitialOptions = {
    preset: 'ts-jest/presets/default-esm', // ESM + TS support
    testEnvironment: 'node',
    moduleFileExtensions: ['ts', 'tsx', 'js', 'mjs'],
    extensionsToTreatAsEsm: ['.ts', '.tsx'],
    setupFilesAfterEnv: ['./src/tests/jest.setup.ts'],
    testMatch: ['**/tests/**/*.{test,spec}.{ts,js,mjs}'],
    transform: {
        '^.+\\.tsx?$': ['ts-jest', {
            useESM: true,
            tsconfig: 'tsconfig.json',
        }]
    },
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
        '^@controllers/(.*)$': '<rootDir>/src/controllers/$1',
        '^@routes/(.*)$': '<rootDir>/src/routes/$1',
        '^@utils/(.*)$': '<rootDir>/src/utilities/$1',
        '^@schemas/(.*)$': '<rootDir>/src/schemas/$1',
    },
}

export default config
