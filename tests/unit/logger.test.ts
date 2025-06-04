/**
 * Unit tests for the logging system
 * Tests the logger initialization, usage, and fallback behavior
 */

import { initializeLogger, getLogger, safeLogger, logger } from '../../src/utils/logger.js';
import { LoggingConfig } from '../../src/types.js';

describe('Logging System', () => {
  describe('Logger Initialization', () => {
    it('should initialize logger with console transport', () => {
      const config: LoggingConfig = {
        level: 'debug',
        console: true,
        timestamp: true,
        colors: true,
      };

      const loggerInstance = initializeLogger(config);
      expect(loggerInstance).toBeDefined();
      expect(loggerInstance.level).toBe('debug');
    });

    it('should initialize logger with file transport', () => {
      const config: LoggingConfig = {
        level: 'info',
        console: false,
        file: '/tmp/test.log',
        timestamp: true,
        colors: false,
      };

      const loggerInstance = initializeLogger(config);
      expect(loggerInstance).toBeDefined();
      expect(loggerInstance.level).toBe('info');
    });

    it('should get initialized logger instance', () => {
      const config: LoggingConfig = {
        level: 'warn',
        console: true,
        timestamp: false,
        colors: false,
      };

      initializeLogger(config);
      const retrieved = getLogger();
      expect(retrieved).toBeDefined();
      expect(retrieved.level).toBe('warn');
    });
  });

  describe('Safe Logger', () => {
    it('should provide fallback logger when not initialized', () => {
      // Create a new logger instance for this test
      jest.resetModules();
      const { safeLogger: freshSafeLogger } = require('../../src/utils/logger.js');

      const fallbackLogger = freshSafeLogger();
      expect(fallbackLogger).toBeDefined();
      expect(fallbackLogger.error).toBeDefined();
      expect(fallbackLogger.warn).toBeDefined();
      expect(fallbackLogger.info).toBeDefined();
      expect(fallbackLogger.debug).toBeDefined();
    });

    it('should return winston logger when initialized', () => {
      const config: LoggingConfig = {
        level: 'error',
        console: true,
        timestamp: true,
        colors: false,
      };

      initializeLogger(config);
      const safeLoggerInstance = safeLogger();
      expect(safeLoggerInstance).toBeDefined();
      expect(safeLoggerInstance.level).toBe('error');
    });
  });

  describe('Convenience Logger Functions', () => {
    beforeAll(() => {
      const config: LoggingConfig = {
        level: 'debug',
        console: true,
        timestamp: false,
        colors: false,
      };
      initializeLogger(config);
    });

    it('should provide working convenience functions', () => {
      expect(logger.error).toBeDefined();
      expect(logger.warn).toBeDefined();
      expect(logger.info).toBeDefined();
      expect(logger.debug).toBeDefined();

      // These should not throw
      expect(() => logger.debug('Test debug message')).not.toThrow();
      expect(() => logger.info('Test info message')).not.toThrow();
      expect(() => logger.warn('Test warn message')).not.toThrow();
      expect(() => logger.error('Test error message')).not.toThrow();
    });

    it('should handle metadata correctly', () => {
      const metadata = { userId: '123', action: 'test' };

      expect(() => logger.debug('Test with metadata', metadata)).not.toThrow();
      expect(() => logger.info('Test with metadata', metadata)).not.toThrow();
      expect(() => logger.warn('Test with metadata', metadata)).not.toThrow();
      expect(() => logger.error('Test with metadata', metadata)).not.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should throw error when getting logger before initialization', () => {
      // Reset modules to get fresh state
      jest.resetModules();
      const { getLogger: freshGetLogger } = require('../../src/utils/logger.js');

      expect(() => freshGetLogger()).toThrow('Logger not initialized');
    });
  });
});
