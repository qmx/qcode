/**
 * Global test setup for QCode
 * This file runs before all tests to configure the test environment
 */

// Set up global test timeout
jest.setTimeout(10000);

// Set up environment variables for testing
process.env.NODE_ENV = 'test';
process.env.QCODE_CONFIG_PATH = '';
process.env.QCODE_WORKSPACE = '';

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