module.exports = {
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'controllers/**/*.js',
    'routes/**/*.js',
    'middleware/**/*.js',
    'services/**/*.js',
    '!node_modules/**'
  ],
  testMatch: ['**/__tests__/**/*.test.js'],
  verbose: true,
  forceExit: true,
  detectOpenHandles: true,
  testTimeout: 30000,
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.js']
};
