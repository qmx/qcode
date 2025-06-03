import { normalize, resolve, relative, isAbsolute, dirname } from 'pathe';
import fs from 'fs/promises';
import { SecurityConfig, QCodeError } from '../types.js';
import { validatePath, safePath, isForbiddenPath } from './paths.js';

/**
 * Check if a file path is inside a directory path
 * Using battle-tested TypeScript implementation
 */
function isPathInside(filePath: string, directoryPath: string): boolean {
  const rel = relative(directoryPath, filePath);
  return !!rel && !rel.startsWith('..') && !isAbsolute(rel);
}

/**
 * WorkspaceSecurity class handles all workspace-related security validations
 */
export class WorkspaceSecurity {
  private config: SecurityConfig;
  private allowedPaths: Set<string>;
  private readonly workingDirectory: string;

  constructor(config: SecurityConfig, workingDirectory: string) {
    this.config = config;
    this.workingDirectory = normalize(resolve(workingDirectory));
    this.allowedPaths = new Set(
      config.workspace.allowedPaths.map(p => normalize(resolve(this.workingDirectory, p)))
    );
  }

  /**
   * Validates that a path is within the allowed workspace boundaries
   */
  async validateWorkspacePath(filePath: string): Promise<string> {
    // First validate the path format
    const normalizedPath = validatePath(filePath);

    // Resolve to absolute path using the engine's working directory
    const absolutePath = isAbsolute(normalizedPath)
      ? normalizedPath
      : resolve(this.workingDirectory, normalizedPath);

    const resolvedPath = normalize(absolutePath);

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
            workingDirectory: this.workingDirectory,
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
          workingDirectory: this.workingDirectory,
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

      // Handle specific filesystem errors with better messages
      if (error && typeof error === 'object' && 'code' in error) {
        const errorCode = (error as any).code;
        const errorMessage = (error as any).message || 'Unknown error';

        switch (errorCode) {
          case 'ENOENT':
            throw new QCodeError(`Path does not exist: ${filePath}`, 'PATH_NOT_FOUND', {
              path: filePath,
              resolvedPath: validatedPath,
              originalError: error,
            });
          case 'EACCES':
            throw new QCodeError(`Permission denied: ${filePath}`, 'PERMISSION_DENIED', {
              path: filePath,
              resolvedPath: validatedPath,
              originalError: error,
            });
          case 'ENOTDIR':
            throw new QCodeError(`Not a directory: ${filePath}`, 'NOT_A_DIRECTORY', {
              path: filePath,
              resolvedPath: validatedPath,
              originalError: error,
            });
          default:
            throw new QCodeError(`Cannot access path: ${errorMessage}`, 'PATH_ACCESS_ERROR', {
              path: filePath,
              resolvedPath: validatedPath,
              originalError: error,
            });
        }
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
    const directory = dirname(validatedPath);

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
          // For execute operations, we currently treat them like read operations
          // This can be enhanced with additional execute-specific checks
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
   * Gets a list of all currently allowed workspace paths
   */
  getAllowedPaths(): string[] {
    return Array.from(this.allowedPaths);
  }

  /**
   * Gets the current working directory for this workspace security instance
   */
  getWorkingDirectory(): string {
    return this.workingDirectory;
  }

  /**
   * Adds an allowed path relative to the working directory
   */
  addAllowedPath(newPath: string): void {
    const normalizedPath = normalize(resolve(this.workingDirectory, newPath));
    this.allowedPaths.add(normalizedPath);
  }

  /**
   * Removes a path from the allowed workspace paths
   */
  removeAllowedPath(pathToRemove: string): boolean {
    const normalizedPath = normalize(resolve(this.workingDirectory, pathToRemove));
    return this.allowedPaths.delete(normalizedPath);
  }

  /**
   * Updates the security configuration
   */
  updateConfig(newConfig: SecurityConfig): void {
    this.config = newConfig;
    this.allowedPaths = new Set(
      newConfig.workspace.allowedPaths.map(p => normalize(resolve(this.workingDirectory, p)))
    );
  }

  /**
   * Gets the current security configuration
   */
  getConfig(): SecurityConfig {
    return { ...this.config };
  }
}
