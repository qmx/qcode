import path from 'path';
import fs from 'fs/promises';
import isPathInside from 'is-path-inside';
import normalizePath from 'normalize-path';
import { SecurityConfig, QCodeError } from '../types.js';
import { validatePath, safePath, isForbiddenPath, isAbsolutePath } from './paths.js';

/**
 * WorkspaceSecurity class handles all workspace-related security validations
 */
export class WorkspaceSecurity {
  private config: SecurityConfig;
  private allowedPaths: Set<string>;

  constructor(config: SecurityConfig) {
    this.config = config;
    this.allowedPaths = new Set(
      config.workspace.allowedPaths.map(p => normalizePath(path.resolve(p)))
    );
  }

  /**
   * Validates that a path is within the allowed workspace boundaries
   */
  async validateWorkspacePath(filePath: string): Promise<string> {
    // First validate the path format
    const normalizedPath = validatePath(filePath);

    // Resolve to absolute path
    const absolutePath = isAbsolutePath(normalizedPath)
      ? normalizedPath
      : path.resolve(process.cwd(), normalizedPath);

    const resolvedPath = normalizePath(absolutePath);

    // Check if reading outside workspace is allowed
    if (!this.config.workspace.allowOutsideWorkspace) {
      const isInWorkspace = Array.from(this.allowedPaths).some(
        allowedPath => isPathInside(resolvedPath, allowedPath) || resolvedPath === allowedPath
      );

      if (!isInWorkspace) {
        throw new QCodeError(
          'Access denied: Path is outside allowed workspace boundaries',
          'PATH_OUTSIDE_WORKSPACE',
          {
            path: filePath,
            resolvedPath,
            allowedPaths: Array.from(this.allowedPaths),
          }
        );
      }
    }

    // Check against forbidden patterns
    if (isForbiddenPath(resolvedPath, this.config.workspace.forbiddenPatterns)) {
      throw new QCodeError(
        'Access denied: Path matches forbidden pattern',
        'FORBIDDEN_PATH_PATTERN',
        {
          path: filePath,
          resolvedPath,
          forbiddenPatterns: this.config.workspace.forbiddenPatterns,
        }
      );
    }

    return resolvedPath;
  }

  /**
   * Validates that a path is safe for reading operations
   */
  async validateReadPath(filePath: string): Promise<string> {
    const validatedPath = await this.validateWorkspacePath(filePath);

    try {
      // Check if the path exists and is accessible
      const stats = await fs.stat(validatedPath);

      // Ensure it's not a special file type (device, socket, etc.)
      if (!stats.isFile() && !stats.isDirectory() && !stats.isSymbolicLink()) {
        throw new QCodeError(
          'Access denied: Path is not a regular file or directory',
          'INVALID_FILE_TYPE',
          { path: filePath, resolvedPath: validatedPath }
        );
      }

      return validatedPath;
    } catch (error) {
      if (error instanceof QCodeError) {
        throw error;
      }

      // Handle filesystem errors
      throw new QCodeError(
        `Cannot access path: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'PATH_ACCESS_ERROR',
        { path: filePath, resolvedPath: validatedPath, originalError: error }
      );
    }
  }

  /**
   * Validates that a path is safe for writing operations
   */
  async validateWritePath(filePath: string): Promise<string> {
    const validatedPath = await this.validateWorkspacePath(filePath);

    // Additional checks for write operations
    const directory = path.dirname(validatedPath);

    try {
      // Ensure the directory exists or can be created
      await fs.access(directory);
    } catch (error) {
      // Try to create the directory if it doesn't exist
      try {
        await fs.mkdir(directory, { recursive: true });
      } catch (mkdirError) {
        throw new QCodeError(
          `Cannot create directory for write operation: ${mkdirError instanceof Error ? mkdirError.message : 'Unknown error'}`,
          'DIRECTORY_CREATE_ERROR',
          { path: filePath, resolvedPath: validatedPath, directory, originalError: mkdirError }
        );
      }
    }

    return validatedPath;
  }

  /**
   * Validates that a directory path is safe for operations
   */
  async validateDirectoryPath(dirPath: string): Promise<string> {
    const validatedPath = await this.validateWorkspacePath(dirPath);

    try {
      const stats = await fs.stat(validatedPath);

      if (!stats.isDirectory()) {
        throw new QCodeError('Path exists but is not a directory', 'NOT_A_DIRECTORY', {
          path: dirPath,
          resolvedPath: validatedPath,
        });
      }

      return validatedPath;
    } catch (error) {
      if (error instanceof QCodeError) {
        throw error;
      }

      throw new QCodeError(
        `Directory access error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'DIRECTORY_ACCESS_ERROR',
        { path: dirPath, resolvedPath: validatedPath, originalError: error }
      );
    }
  }

  /**
   * Safely resolves a path relative to a base workspace directory
   */
  async resolveSafePath(basePath: string, relativePath: string): Promise<string> {
    const validatedBase = await this.validateWorkspacePath(basePath);
    const resolvedPath = safePath(validatedBase, relativePath);

    // Validate the resolved path is still within workspace
    return await this.validateWorkspacePath(resolvedPath);
  }

  /**
   * Checks if a path is allowed for the given operation type
   */
  async isPathAllowed(filePath: string, operation: 'read' | 'write' | 'execute'): Promise<boolean> {
    try {
      switch (operation) {
        case 'read':
          await this.validateReadPath(filePath);
          return true;
        case 'write':
          await this.validateWritePath(filePath);
          return true;
        case 'execute':
          // For now, treat execute same as read, but can be extended
          await this.validateReadPath(filePath);
          return true;
        default:
          return false;
      }
    } catch (error) {
      return false;
    }
  }

  /**
   * Gets the list of allowed workspace paths
   */
  getAllowedPaths(): string[] {
    return Array.from(this.allowedPaths);
  }

  /**
   * Adds a new allowed workspace path
   */
  addAllowedPath(newPath: string): void {
    const normalizedPath = normalizePath(path.resolve(newPath));
    this.allowedPaths.add(normalizedPath);
  }

  /**
   * Removes an allowed workspace path
   */
  removeAllowedPath(pathToRemove: string): boolean {
    const normalizedPath = normalizePath(path.resolve(pathToRemove));
    return this.allowedPaths.delete(normalizedPath);
  }

  /**
   * Updates the security configuration
   */
  updateConfig(newConfig: SecurityConfig): void {
    this.config = newConfig;
    this.allowedPaths = new Set(
      newConfig.workspace.allowedPaths.map(p => normalizePath(path.resolve(p)))
    );
  }

  /**
   * Gets the current security configuration
   */
  getConfig(): SecurityConfig {
    return { ...this.config };
  }
}
