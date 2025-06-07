/**
 * Global test setup for QCode
 * This file runs before all tests to configure the test environment
 */

import path from 'path';

// Set up global test timeout (increased for e2e tests with Ollama client initialization)
jest.setTimeout(30000);

// Set up environment variables for testing
process.env.NODE_ENV = 'test';
process.env.QCODE_CONFIG_PATH = '';
process.env.QCODE_WORKSPACE = '';

// Determine if we should allow real API calls (only for E2E tests)
const isE2ETest = process.argv.some(arg => arg.includes('e2e/'));
const isIntegrationTest = process.argv.some(arg => arg.includes('integration/'));
process.env.QCODE_ALLOW_API_CALLS = isE2ETest || isIntegrationTest ? 'true' : 'false';

// Test workspace constants
export const TEST_WORKSPACE = path.resolve(__dirname, 'fixtures', 'projects', 'test-workspace');
export const TEST_PROJECT_ROOT = path.resolve(__dirname, '..');

// Mock logger globally for all tests - tests don't need real logging
jest.mock('../src/utils/logger.js', () => ({
  getLogger: jest.fn(() => ({
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  })),
  initializeLogger: jest.fn(),
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

// Global test utilities
beforeEach(() => {
  // Clear all mocks before each test
  jest.clearAllMocks();
});

afterEach(() => {
  // Clean up after each test
  jest.restoreAllMocks();
});

// Add any global test helpers here
declare global {
  namespace jest {
    interface Matchers<R> {
      // Add custom matchers here if needed
    }
  }
}

export {};
