import { normalize, resolve, relative, isAbsolute, extname } from 'pathe';
import micromatch from 'micromatch';
import sanitize from 'sanitize-filename';
import { QCodeError } from '../types.js';

/**
 * Check if a file path is inside a directory path
 * Using battle-tested TypeScript implementation
 */
function isPathInside(filePath: string, directoryPath: string): boolean {
  const rel = relative(directoryPath, filePath);
  return !!rel && !rel.startsWith('..') && !isAbsolute(rel);
}

/**
 * Validates and normalizes a file path for safe operations
 */
export function validatePath(filePath: string): string {
  if (!filePath || typeof filePath !== 'string') {
    throw new QCodeError('Path must be a non-empty string', 'INVALID_PATH', { path: filePath });
  }

  // Normalize the path to handle different OS formats
  const normalized = normalize(filePath);

  // Check for path traversal attempts
  if (normalized.includes('../') || normalized.includes('..\\')) {
    throw new QCodeError('Path traversal detected', 'PATH_TRAVERSAL', {
      path: filePath,
      normalized,
    });
  }

  // Check for null bytes
  if (normalized.includes('\0')) {
    throw new QCodeError('Null byte detected in path', 'INVALID_PATH', { path: filePath });
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
  const resolved = resolve(validatedBase, validatedRelative);
  const normalizedResolved = normalize(resolved);

  // Ensure the resolved path is within the base directory
  if (!isPathInside(normalizedResolved, normalize(resolve(validatedBase)))) {
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
 * Checks if a path matches any of the forbidden patterns using micromatch
 */
export function isForbiddenPath(filePath: string, forbiddenPatterns: string[]): boolean {
  const normalized = normalize(filePath);

  // Use micromatch for proper glob pattern matching
  return micromatch.isMatch(normalized, forbiddenPatterns, {
    dot: true, // Match dotfiles
    matchBase: true, // Match basename of path
    nocase: true, // Case insensitive on Windows
  });
}

/**
 * Gets the relative path from base to target, ensuring it's safe
 */
export function getRelativePath(basePath: string, targetPath: string): string {
  const validatedBase = validatePath(basePath);
  const validatedTarget = validatePath(targetPath);

  const rel = relative(validatedBase, validatedTarget);
  const normalized = normalize(rel);

  // Check if the relative path tries to go outside the base
  if (normalized.startsWith('../')) {
    throw new QCodeError('Target path is outside the base directory', 'PATH_OUTSIDE_BASE', {
      basePath: validatedBase,
      targetPath: validatedTarget,
      relative: normalized,
    });
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

  const ext = extname(filePath).toLowerCase();
  return allowedExtensions.includes(ext);
}

/**
 * Sanitizes a filename using the well-tested sanitize-filename library
 */
export function sanitizeFilename(filename: string): string {
  if (!filename || typeof filename !== 'string') {
    throw new QCodeError('Filename must be a non-empty string', 'INVALID_FILENAME', { filename });
  }

  // Use the sanitize-filename library for proper sanitization
  const sanitized = sanitize(filename, { replacement: '_' });

  if (!sanitized) {
    throw new QCodeError('Filename becomes empty after sanitization', 'INVALID_FILENAME', {
      original: filename,
      sanitized,
    });
  }

  return sanitized;
}
