module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testMatch: ['**/tests/ui/**/*.test.ts'],
    testTimeout: 30000,
    verbose: true,
    collectCoverage: false,
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
    transform: {
        '^.+\\.tsx?$': ['ts-jest', {
            tsconfig: {
                esModuleInterop: true,
                allowSyntheticDefaultImports: true,
            }
        }]
    },
    globals: {
        HEADLESS: process.env.HEADLESS !== 'false'
    }
};
