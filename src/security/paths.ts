import path from 'path';
import { isAbsolute, normalize } from 'path';
import isPathInside from 'is-path-inside';
import normalizePath from 'normalize-path';
import { QCodeError } from '../types.js';

/**
 * Validates and normalizes a file path for safe operations
 */
export function validatePath(filePath: string): string {
  if (!filePath || typeof filePath !== 'string') {
    throw new QCodeError(
      'Path must be a non-empty string',
      'INVALID_PATH',
      { path: filePath }
    );
  }

  // Normalize the path to handle different OS formats
  const normalized = normalizePath(path.normalize(filePath));

  // Check for path traversal attempts
  if (normalized.includes('../') || normalized.includes('..\\')) {
    throw new QCodeError(
      'Path traversal detected',
      'PATH_TRAVERSAL',
      { path: filePath, normalized }
    );
  }

  // Check for null bytes
  if (normalized.includes('\0')) {
    throw new QCodeError(
      'Null byte detected in path',
      'INVALID_PATH',
      { path: filePath }
    );
  }

  return normalized;
}

/**
 * Safely resolves a path relative to a base directory
 */
export function safePath(basePath: string, relativePath: string): string {
  const validatedBase = validatePath(basePath);
  const validatedRelative = validatePath(relativePath);

  // Resolve the path
  const resolved = path.resolve(validatedBase, validatedRelative);
  const normalizedResolved = normalizePath(resolved);

  // Ensure the resolved path is within the base directory
  if (!isPathInside(normalizedResolved, normalizePath(path.resolve(validatedBase)))) {
    throw new QCodeError(
      'Resolved path is outside the allowed base directory',
      'PATH_OUTSIDE_BASE',
      {
        basePath: validatedBase,
        relativePath: validatedRelative,
        resolved: normalizedResolved,
      }
    );
  }

  return normalizedResolved;
}

/**
 * Checks if a path matches any of the forbidden patterns
 */
export function isForbiddenPath(filePath: string, forbiddenPatterns: string[]): boolean {
  const normalized = normalizePath(filePath);

  return forbiddenPatterns.some((pattern) => {
    // Convert glob-like patterns to regex
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');

    const regex = new RegExp(`^${regexPattern}$`, 'i');
    return regex.test(normalized);
  });
}

/**
 * Checks if a path is an absolute path
 */
export function isAbsolutePath(filePath: string): boolean {
  return isAbsolute(filePath);
}

/**
 * Gets the relative path from base to target, ensuring it's safe
 */
export function getRelativePath(basePath: string, targetPath: string): string {
  const validatedBase = validatePath(basePath);
  const validatedTarget = validatePath(targetPath);

  const relative = path.relative(validatedBase, validatedTarget);
  const normalized = normalizePath(relative);

  // Check if the relative path tries to go outside the base
  if (normalized.startsWith('../')) {
    throw new QCodeError(
      'Target path is outside the base directory',
      'PATH_OUTSIDE_BASE',
      {
        basePath: validatedBase,
        targetPath: validatedTarget,
        relative: normalized,
      }
    );
  }

  return normalized;
}

/**
 * Checks if a file extension is allowed
 */
export function isAllowedExtension(filePath: string, allowedExtensions: string[]): boolean {
  if (allowedExtensions.length === 0) {
    return true; // No restrictions if empty
  }

  const ext = path.extname(filePath).toLowerCase();
  return allowedExtensions.includes(ext);
}

/**
 * Sanitizes a filename by removing dangerous characters
 */
export function sanitizeFilename(filename: string): string {
  if (!filename || typeof filename !== 'string') {
    throw new QCodeError(
      'Filename must be a non-empty string',
      'INVALID_FILENAME',
      { filename }
    );
  }

  // Remove dangerous characters
  const sanitized = filename
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/^\.+/, '') // Remove leading dots
    .replace(/\.+$/, '') // Remove trailing dots
    .trim();

  if (!sanitized) {
    throw new QCodeError(
      'Filename becomes empty after sanitization',
      'INVALID_FILENAME',
      { original: filename, sanitized }
    );
  }

  // Check for reserved names on Windows
  const reservedNames = [
    'CON', 'PRN', 'AUX', 'NUL',
    'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
    'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'
  ];

  const nameWithoutExt = path.parse(sanitized).name.toUpperCase();
  if (reservedNames.includes(nameWithoutExt)) {
    throw new QCodeError(
      'Filename is a reserved system name',
      'RESERVED_FILENAME',
      { filename: sanitized }
    );
  }

  return sanitized;
} 