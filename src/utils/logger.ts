/**
 * Centralized logging utility using Winston
 * Integrates with QCode's configuration system for consistent logging behavior
 */

import winston from 'winston';
import { LoggingConfig } from '../types.js';

/**
 * Logger instance - singleton pattern for consistent configuration
 */
let loggerInstance: winston.Logger | null = null;

/**
 * Initialize the logger with configuration
 * Must be called before using the logger
 */
export function initializeLogger(config: LoggingConfig): winston.Logger {
  const transports: winston.transport[] = [];

  // Console transport (if enabled)
  if (config.console) {
    transports.push(
      new winston.transports.Console({
        level: config.level,
        format: winston.format.combine(
          ...(config.colors ? [winston.format.colorize()] : []),
          ...(config.timestamp ? [winston.format.timestamp()] : []),
          winston.format.printf(({ timestamp, level, message, ...meta }) => {
            const timestampStr = config.timestamp && timestamp ? `[${timestamp}] ` : '';
            const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
            return `${timestampStr}${level}: ${message}${metaStr}`;
          })
        ),
      })
    );
  }

  // File transport (if configured)
  if (config.file) {
    transports.push(
      new winston.transports.File({
        filename: config.file,
        level: config.level,
        format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
      })
    );
  }

  // Create logger instance
  loggerInstance = winston.createLogger({
    level: config.level,
    transports,
    // Prevent winston from exiting on errors
    exitOnError: false,
  });

  return loggerInstance;
}

/**
 * Get the current logger instance
 * Throws error if logger hasn't been initialized
 */
export function getLogger(): winston.Logger {
  if (!loggerInstance) {
    throw new Error('Logger not initialized. Call initializeLogger() first.');
  }
  return loggerInstance;
}

/**
 * Convenience functions for different log levels
 */
export const logger = {
  error: (message: string, meta?: object) => getLogger().error(message, meta),
  warn: (message: string, meta?: object) => getLogger().warn(message, meta),
  info: (message: string, meta?: object) => getLogger().info(message, meta),
  debug: (message: string, meta?: object) => getLogger().debug(message, meta),
};
