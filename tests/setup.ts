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

// Test workspace constants
export const TEST_WORKSPACE = path.resolve(__dirname, 'fixtures', 'projects', 'test-workspace');
export const TEST_PROJECT_ROOT = path.resolve(__dirname, '..');

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
