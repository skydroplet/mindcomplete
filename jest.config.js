module.exports = {
    testEnvironment: 'node',
    testMatch: [
        "**/__tests__/**/*.[jt]s?(x)",
        "**/?(*.)+(spec|test).[jt]s?(x)"
    ],
    verbose: true,
    testTimeout: 10000, // 默认超时时间10秒
    setupFilesAfterEnv: [],
    moduleFileExtensions: ['js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'json', 'node'],
};
