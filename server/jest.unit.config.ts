import type { Config } from '@jest/types'

const config: Config.InitialOptions = {
    testEnvironment: 'node',
    moduleFileExtensions: ['js', 'mjs'],
    testMatch: [
        '<rootDir>/dist/tests/unit/**/*.test.js',
    ],
    transform: {},
    moduleNameMapper: {
        '^@/(.*)\\.js$': '<rootDir>/dist/$1.js',
    },
}

export default config
