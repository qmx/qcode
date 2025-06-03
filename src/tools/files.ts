import { z } from 'zod';
import { normalize, join, relative, basename, dirname } from 'pathe';
import { promises as fs } from 'fs';
import { mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import glob, { Options as GlobOptions } from 'fast-glob';
import { NamespacedTool, ToolDefinition, ToolResult, QCodeError } from '../types.js';
import { WorkspaceSecurity } from '../security/workspace.js';
import { isAbsolute } from 'path';

/**
 * Zod schemas for file operation parameters
 */

// Read file operation schema
const ReadFileSchema = z.object({
  operation: z.literal('read'),
  path: z.string().min(1, 'File path is required'),
  startLine: z.coerce
    .number()
    .int()
    .positive()
    .nullable()
    .optional()
    .transform(val => val ?? undefined),
  endLine: z.coerce
    .number()
    .int()
    .positive()
    .nullable()
    .optional()
    .transform(val => val ?? undefined),
  encoding: z.enum(['utf8', 'utf-8', 'ascii', 'base64', 'hex']).default('utf8').optional(),
});

// Write file operation schema
const WriteFileSchema = z.object({
  operation: z.literal('write'),
  path: z.string().min(1, 'File path is required'),
  content: z.string(),
  encoding: z.enum(['utf8', 'utf-8', 'ascii', 'base64', 'hex']).default('utf8').optional(),
  backup: z.coerce.boolean().default(true).optional(),
  createDirs: z.coerce.boolean().default(true).optional(),
});

// List files operation schema
const ListFilesSchema = z.object({
  operation: z.literal('list'),
  path: z.string().default('.').optional(),
  pattern: z.string().optional(),
  recursive: z.coerce.boolean().default(false).optional(),
  includeHidden: z.coerce.boolean().default(false).optional(),
  includeMetadata: z.coerce.boolean().default(false).optional(),
});

// Search files operation schema
const SearchFilesSchema = z.object({
  operation: z.literal('search'),
  query: z.string().min(1, 'Search query is required'),
  path: z.string().default('.').optional(),
  pattern: z.string().optional(),
  useRegex: z.coerce.boolean().default(false).optional(),
  caseSensitive: z.coerce.boolean().default(false).optional(),
  maxResults: z.coerce.number().int().positive().default(100).optional(),
  includeContext: z.coerce.boolean().default(true).optional(),
});

// Union schema for all file operations
const FileOperationSchema = z.discriminatedUnion('operation', [
  ReadFileSchema,
  WriteFileSchema,
  ListFilesSchema,
  SearchFilesSchema,
]);

/**
 * Type definitions for file operations
 */
export type ReadFileParams = z.infer<typeof ReadFileSchema>;
export type WriteFileParams = z.infer<typeof WriteFileSchema>;
export type ListFilesParams = z.infer<typeof ListFilesSchema>;
export type SearchFilesParams = z.infer<typeof SearchFilesSchema>;
export type FileOperationParams = z.infer<typeof FileOperationSchema>;

/**
 * Result types for file operations
 */
export interface ReadFileResult {
  content: string;
  path: string;
  lines?: number;
  size: number;
  encoding: string;
  truncated?: boolean;
}

export interface WriteFileResult {
  path: string;
  size: number;
  backup?: string;
  created: boolean;
}

export interface FileMetadata {
  name: string;
  path: string;
  relativePath: string;
  size: number;
  isDirectory: boolean;
  isFile: boolean;
  modified: Date;
  created?: Date;
  permissions?: string;
}

export interface ListFilesResult {
  files: FileMetadata[];
  path: string;
  count: number;
  pattern?: string;
}

export interface SearchMatch {
  file: string;
  line: number;
  column: number;
  match: string;
  context?: {
    before: string[];
    after: string[];
  };
}

export interface SearchFilesResult {
  matches: SearchMatch[];
  filesSearched: number;
  totalMatches: number;
  query: string;
  truncated?: boolean;
}

/**
 * FilesTool class - Handles all file operations with security validation
 */
export class FilesTool implements NamespacedTool {
  public readonly namespace = 'internal';
  public readonly name = 'files';
  public readonly fullName = 'internal:files';

  private workspaceSecurity: WorkspaceSecurity;

  constructor(workspaceSecurity: WorkspaceSecurity) {
    this.workspaceSecurity = workspaceSecurity;
  }

  /**
   * Tool definition for Ollama function calling
   */
  public get definition(): ToolDefinition {
    return {
      name: 'files',
      description:
        'Perform file operations including read, write, list, and search files within the workspace',
      parameters: {
        type: 'object',
        properties: {
          operation: {
            type: 'string',
            enum: ['read', 'write', 'list', 'search'],
            description: 'The type of file operation to perform',
          },
          path: {
            type: 'string',
            description:
              'For read/write: file path. For list: directory path to search in (default: current directory)',
          },
          content: {
            type: 'string',
            description: 'Content to write (for write operation)',
          },
          query: {
            type: 'string',
            description: 'Search query text or pattern (for search operation)',
          },
          pattern: {
            type: 'string',
            description:
              'Glob pattern to filter files (e.g., "**/*.ts", "*.swift"). Use this to find files by extension or name pattern.',
          },
          startLine: {
            type: 'number',
            description: 'Starting line number for partial file read (1-indexed)',
          },
          endLine: {
            type: 'number',
            description: 'Ending line number for partial file read (1-indexed, inclusive)',
          },
          recursive: {
            type: 'boolean',
            description: 'Whether to search/list recursively in subdirectories',
            default: false,
          },
          includeHidden: {
            type: 'boolean',
            description: 'Whether to include hidden files (starting with .)',
            default: false,
          },
          includeMetadata: {
            type: 'boolean',
            description: 'Whether to include file metadata (size, dates, permissions)',
            default: false,
          },
          useRegex: {
            type: 'boolean',
            description: 'Whether to treat search query as a regular expression',
            default: false,
          },
          caseSensitive: {
            type: 'boolean',
            description: 'Whether search should be case sensitive',
            default: false,
          },
          backup: {
            type: 'boolean',
            description: 'Whether to create backup before overwriting files',
            default: true,
          },
          createDirs: {
            type: 'boolean',
            description: "Whether to create parent directories if they don't exist",
            default: true,
          },
          encoding: {
            type: 'string',
            enum: ['utf8', 'utf-8', 'ascii', 'base64', 'hex'],
            description: 'File encoding for read/write operations',
            default: 'utf8',
          },
          maxResults: {
            type: 'number',
            description: 'Maximum number of search results to return',
            default: 100,
          },
          includeContext: {
            type: 'boolean',
            description: 'Whether to include context lines around search matches',
            default: true,
          },
        },
        required: ['operation'],
        additionalProperties: false,
      },
    };
  }

  /**
   * Execute file operation with optional context
   */
  public async execute(args: Record<string, any>, context?: any): Promise<ToolResult> {
    const startTime = Date.now();

    try {
      // Validate and parse arguments
      const params = FileOperationSchema.parse(args);

      // Execute the appropriate operation
      let data: any;
      switch (params.operation) {
        case 'read':
          data = await this.readFile(params, context);
          break;
        case 'write':
          data = await this.writeFile(params);
          break;
        case 'list':
          data = await this.listFiles(params, context);
          break;
        case 'search':
          data = await this.searchFiles(params);
          break;
        default: {
          // TypeScript exhaustiveness check - this should never be reached
          const exhaustiveCheck: never = params;
          throw new QCodeError(
            `Unknown operation: ${(exhaustiveCheck as { operation: string }).operation}`,
            'INVALID_OPERATION'
          );
        }
      }

      return {
        success: true,
        data,
        duration: Date.now() - startTime,
        tool: this.name,
        namespace: this.namespace,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        duration: Date.now() - startTime,
        tool: this.name,
        namespace: this.namespace,
      };
    }
  }

  /**
   * Read file operation - Implementation for step 1.7.2
   */
  private async readFile(params: ReadFileParams, context?: any): Promise<ReadFileResult> {
    const { path: filePath, startLine, endLine, encoding = 'utf8' } = params;

    try {
      // Resolve path using context working directory if available and path is relative
      let resolvedPath = filePath;
      if (context?.workingDirectory && !isAbsolute(filePath)) {
        resolvedPath = join(context.workingDirectory, filePath);
      }

      // Validate file path with security checks
      const validatedPath = await this.validatePath(resolvedPath, 'read');

      // Check if file exists and get stats
      const stats = await fs.stat(validatedPath);

      if (!stats.isFile()) {
        throw new QCodeError(`Path is not a file: ${filePath}`, 'INVALID_PATH');
      }

      // Validate line range parameters
      if (startLine !== undefined && endLine !== undefined && startLine > endLine) {
        throw new QCodeError('startLine cannot be greater than endLine', 'INVALID_RANGE');
      }

      // Check for binary files (unless encoding is explicitly non-utf8)
      if (encoding === 'utf8' || encoding === 'utf-8') {
        const isBinary = await this.isBinaryFile(validatedPath);
        if (isBinary) {
          throw new QCodeError(
            'Binary file detected. Use a different encoding (e.g., base64) to read binary files.',
            'BINARY_FILE'
          );
        }
      }

      // Handle large files - set a reasonable limit (5MB for text files)
      const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
      let content: string;
      let truncated = false;

      if (stats.size > MAX_FILE_SIZE && (encoding === 'utf8' || encoding === 'utf-8')) {
        // For large files, read only the first part
        const buffer = Buffer.alloc(MAX_FILE_SIZE);
        const fileHandle = await fs.open(validatedPath, 'r');
        try {
          const { bytesRead } = await fileHandle.read(buffer, 0, MAX_FILE_SIZE, 0);
          content = buffer.subarray(0, bytesRead).toString(encoding as BufferEncoding);
          truncated = true;
        } finally {
          await fileHandle.close();
        }
      } else {
        // Read entire file
        content = await fs.readFile(validatedPath, { encoding: encoding as BufferEncoding });
      }

      // Handle line range reading
      if (startLine !== undefined || endLine !== undefined) {
        const lines = content.split('\n');
        const totalLines = lines.length;

        // Validate line numbers
        if (startLine !== undefined && startLine > totalLines) {
          throw new QCodeError(
            `Invalid line range: Start line ${startLine} exceeds file length (${totalLines} lines)`,
            'INVALID_LINE_RANGE'
          );
        }

        if (endLine !== undefined && endLine > totalLines) {
          throw new QCodeError(
            `Invalid line range: End line ${endLine} exceeds file length (${totalLines} lines)`,
            'INVALID_LINE_RANGE'
          );
        }

        // Extract line range (convert to 0-based indexing)
        const start = startLine ? startLine - 1 : 0;
        const end = endLine ? endLine : totalLines;

        const selectedLines = lines.slice(start, end);
        content = selectedLines.join('\n');

        // If we're reading a line range, update the line count
        const lineCount = selectedLines.length;

        return {
          content,
          path: validatedPath,
          lines: lineCount,
          size: Buffer.byteLength(content, encoding as BufferEncoding),
          encoding,
          ...(truncated && { truncated }),
        };
      }

      // Count lines for full file read
      const lineCount = content.split('\n').length;

      return {
        content,
        path: validatedPath,
        lines: lineCount,
        size: stats.size,
        encoding,
        ...(truncated && { truncated }),
      };
    } catch (error) {
      if (error instanceof QCodeError) {
        throw error;
      }

      // Handle common Node.js file system errors
      if (error instanceof Error) {
        if ('code' in error) {
          switch (error.code) {
            case 'ENOENT':
              throw new QCodeError(`File not found: ${filePath}`, 'FILE_NOT_FOUND');
            case 'EACCES':
              throw new QCodeError(`Permission denied: ${filePath}`, 'PERMISSION_DENIED');
            case 'EISDIR':
              throw new QCodeError(`Path is a directory: ${filePath}`, 'INVALID_PATH');
            case 'EMFILE':
            case 'ENFILE':
              throw new QCodeError('Too many open files', 'RESOURCE_LIMIT');
            default:
              throw new QCodeError(`File system error: ${error.message}`, 'FS_ERROR');
          }
        }
        throw new QCodeError(`Unexpected error: ${error.message}`, 'UNKNOWN_ERROR');
      }

      throw new QCodeError('Unknown error occurred while reading file', 'UNKNOWN_ERROR');
    }
  }

  /**
   * Check if a file is binary by examining its content
   */
  private async isBinaryFile(filePath: string): Promise<boolean> {
    try {
      // Read first 8KB to check for null bytes and other binary indicators
      const SAMPLE_SIZE = 8192;
      const buffer = Buffer.alloc(SAMPLE_SIZE);
      const fileHandle = await fs.open(filePath, 'r');

      try {
        const { bytesRead } = await fileHandle.read(buffer, 0, SAMPLE_SIZE, 0);
        const sample = buffer.subarray(0, bytesRead);

        // Check for null bytes (common in binary files)
        if (sample.includes(0)) {
          return true;
        }

        // Check for control characters and high-bit bytes that suggest binary content
        let suspiciousCount = 0;
        for (let i = 0; i < sample.length; i++) {
          const byte = sample[i]!;

          // Check for control characters (except common whitespace)
          if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) {
            suspiciousCount++;
          }

          // Check for bytes that are likely part of binary sequences
          // Look for sequences of high-bit bytes that aren't valid UTF-8
          if (byte >= 128) {
            // Simple heuristic: if we see isolated high bytes or invalid UTF-8 sequences
            if (i === sample.length - 1 || (sample[i + 1]! < 128 && byte >= 192)) {
              suspiciousCount++;
            }
          }
        }

        // If more than 5% suspicious characters, consider it binary
        const suspiciousRatio = suspiciousCount / sample.length;
        return suspiciousRatio > 0.05;
      } finally {
        await fileHandle.close();
      }
    } catch (error) {
      // If we can't read the file to check, assume it's text
      return false;
    }
  }

  /**
   * Write file operation - Implementation for step 1.7.3
   */
  private async writeFile(params: WriteFileParams): Promise<WriteFileResult> {
    const { path: filePath, content, encoding = 'utf8', backup = true, createDirs = true } = params;

    try {
      // Validate the file path with security checks
      const validatedPath = await this.validatePath(filePath, 'write');

      // Check if file already exists
      let fileExists = false;
      let backupPath: string | undefined;

      try {
        await fs.access(validatedPath);
        fileExists = true;
      } catch {
        // File doesn't exist - this is fine for write operations
      }

      // Create backup if file exists and backup is requested
      if (fileExists && backup) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        backupPath = `${validatedPath}.backup-${timestamp}`;
        await fs.copyFile(validatedPath, backupPath);
      }

      // Create parent directories if they don't exist and createDirs is true
      if (createDirs) {
        const parentDir = dirname(validatedPath);
        try {
          await fs.mkdir(parentDir, { recursive: true });
        } catch (error) {
          if (error instanceof Error && 'code' in error && error.code !== 'EEXIST') {
            throw new QCodeError(
              `Failed to create parent directory ${parentDir}: ${error.message}`,
              'DIRECTORY_CREATE_ERROR'
            );
          }
        }
      }

      // Perform atomic write using temporary file
      const tempDir = await mkdtemp(join(tmpdir(), 'qcode-write-'));
      const tempFile = join(tempDir, 'temp-file');

      try {
        // Write content to temporary file first
        await fs.writeFile(tempFile, content, { encoding: encoding as BufferEncoding });

        // Atomic move from temp file to target location
        await fs.rename(tempFile, validatedPath);

        // Clean up temp directory
        await fs.rmdir(tempDir);
      } catch (error) {
        // Clean up on error
        try {
          await fs.unlink(tempFile);
          await fs.rmdir(tempDir);
        } catch {
          // Ignore cleanup errors
        }

        // If backup was created and write failed, restore the original file
        if (backupPath && fileExists) {
          try {
            await fs.copyFile(backupPath, validatedPath);
            await fs.unlink(backupPath);
          } catch {
            // If restore fails, keep the backup
          }
        }

        throw new QCodeError(
          `Failed to write file ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'FILE_WRITE_ERROR'
        );
      }

      // Get file size after successful write
      const stats = await fs.stat(validatedPath);

      const result: WriteFileResult = {
        path: validatedPath,
        size: stats.size,
        created: !fileExists,
      };

      if (backupPath) {
        result.backup = backupPath;
      }

      return result;
    } catch (error) {
      if (error instanceof QCodeError) {
        throw error;
      }

      // Handle common Node.js file system errors
      if (error instanceof Error && 'code' in error) {
        switch (error.code) {
          case 'ENOENT':
            throw new QCodeError(
              `Parent directory does not exist: ${dirname(filePath)}`,
              'DIRECTORY_NOT_FOUND'
            );
          case 'EACCES':
          case 'EPERM':
            throw new QCodeError(
              `Permission denied writing to file: ${filePath}`,
              'PERMISSION_DENIED'
            );
          case 'ENOSPC':
            throw new QCodeError('No space left on device', 'DISK_FULL');
          case 'EROFS':
            throw new QCodeError('File system is read-only', 'READ_ONLY_FILESYSTEM');
          default:
            throw new QCodeError(
              `Failed to write file ${filePath}: ${error.message}`,
              'FILE_WRITE_ERROR'
            );
        }
      }

      throw new QCodeError(
        `Failed to write file ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'FILE_WRITE_ERROR'
      );
    }
  }

  /**
   * List files operation - implementation for step 1.7.4
   */
  private async listFiles(params: ListFilesParams, context?: any): Promise<ListFilesResult> {
    const {
      path = '.',
      pattern,
      recursive = false,
      includeHidden = false,
      includeMetadata = false,
    } = params;

    try {
      let basePath = path;
      let searchPattern = pattern;

      // Resolve base path using context working directory if available and path is relative
      if (context?.workingDirectory && !isAbsolute(basePath)) {
        basePath = join(context.workingDirectory, basePath);
      }

      // Smart glob pattern detection: if path contains glob characters and no separate pattern is provided
      const globChars = ['*', '?', '[', ']', '{', '}'];
      const hasGlobChars = globChars.some(char => path.includes(char));

      if (hasGlobChars && !pattern) {
        // The path itself is a glob pattern - use it as the pattern and extract base directory
        searchPattern = path;

        // Find the last directory separator before any glob characters
        let lastDirIndex = -1;
        for (let i = 0; i < path.length; i++) {
          if (path[i] === '/') {
            // Check if there are any glob characters after this slash
            const afterSlash = path.substring(i + 1);
            if (!globChars.some(char => afterSlash.includes(char))) {
              lastDirIndex = i;
            }
          }
        }

        if (lastDirIndex >= 0) {
          basePath = path.substring(0, lastDirIndex);
          searchPattern = path.substring(lastDirIndex + 1);
        } else {
          basePath = '.';
          searchPattern = path;
        }

        // Resolve the base path with context
        if (context?.workingDirectory && !isAbsolute(basePath)) {
          basePath = join(context.workingDirectory, basePath);
        }
      }

      // Validate the base directory path
      let validatedPath: string;
      try {
        validatedPath = await this.validatePath(basePath, 'read');
      } catch (error) {
        if (error instanceof QCodeError) {
          if (error.code === 'PATH_NOT_FOUND') {
            throw new QCodeError(`Directory not found: ${basePath}`, 'DIRECTORY_NOT_FOUND');
          } else if (error.code === 'PATH_ACCESS_ERROR') {
            // Check if this is due to a non-existent path (fallback)
            try {
              await fs.access(basePath);
            } catch (fsError) {
              if (fsError instanceof Error && 'code' in fsError && fsError.code === 'ENOENT') {
                throw new QCodeError(`Directory not found: ${basePath}`, 'DIRECTORY_NOT_FOUND');
              }
            }
          }
        }
        throw error;
      }

      // Check if the path exists and is a directory
      const stats = await fs.stat(validatedPath);
      if (!stats.isDirectory()) {
        throw new QCodeError(`Path is not a directory: ${basePath}`, 'NOT_A_DIRECTORY', {
          path: basePath,
          validatedPath,
        });
      }

      let allFiles: string[] = [];

      if (searchPattern) {
        // Use fast-glob for pattern matching
        const globOptions: GlobOptions = {
          cwd: validatedPath,
          absolute: true,
          dot: includeHidden,
        };

        // Add depth control for recursion using 'deep' option
        if (!recursive) {
          globOptions.deep = 1;
        }

        try {
          allFiles = await glob(searchPattern, globOptions);
        } catch (globError) {
          throw new QCodeError(
            `Error processing glob pattern "${searchPattern}": ${globError instanceof Error ? globError.message : 'Unknown error'}`,
            'GLOB_ERROR'
          );
        }
      } else {
        // No pattern - list directory contents directly
        if (recursive) {
          allFiles = await this.getAllFilesRecursive(validatedPath, includeHidden);
        } else {
          allFiles = await this.getDirectoryContents(validatedPath, includeHidden);
        }
      }

      // Convert file paths to FileMetadata objects
      const fileMetadataPromises = allFiles.map(async filePath => {
        try {
          const fileStats = await fs.stat(filePath);
          const fileName = basename(filePath);
          const relativePath = relative(validatedPath, filePath);

          const metadata: FileMetadata = {
            name: fileName,
            path: filePath,
            relativePath: relativePath || fileName,
            size: fileStats.size,
            isDirectory: fileStats.isDirectory(),
            isFile: fileStats.isFile(),
            modified: fileStats.mtime,
          };

          // Add extended metadata if requested
          if (includeMetadata) {
            metadata.created = fileStats.birthtime;
            // Convert file mode to readable permissions string
            const mode = fileStats.mode;
            const permissions = [
              mode & parseInt('400', 8) ? 'r' : '-',
              mode & parseInt('200', 8) ? 'w' : '-',
              mode & parseInt('100', 8) ? 'x' : '-',
              mode & parseInt('040', 8) ? 'r' : '-',
              mode & parseInt('020', 8) ? 'w' : '-',
              mode & parseInt('010', 8) ? 'x' : '-',
              mode & parseInt('004', 8) ? 'r' : '-',
              mode & parseInt('002', 8) ? 'w' : '-',
              mode & parseInt('001', 8) ? 'x' : '-',
            ].join('');
            metadata.permissions = permissions;
          }

          return metadata;
        } catch (error) {
          // Skip files that can't be accessed
          return null;
        }
      });

      // Wait for all metadata to be collected and filter out null results
      const fileMetadataResults = await Promise.all(fileMetadataPromises);
      const files = fileMetadataResults.filter(
        (metadata): metadata is FileMetadata => metadata !== null
      );

      // Sort files: directories first, then files, both alphabetically
      files.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });

      const result: ListFilesResult = {
        files,
        path: validatedPath,
        count: files.length,
      };

      if (searchPattern) {
        result.pattern = searchPattern;
      }

      return result;
    } catch (error) {
      if (error instanceof QCodeError) {
        throw error;
      }

      // Handle common Node.js file system errors
      if (error instanceof Error) {
        if ('code' in error) {
          switch (error.code) {
            case 'ENOENT':
              throw new QCodeError(`Directory not found: ${path}`, 'DIRECTORY_NOT_FOUND');
            case 'EACCES':
              throw new QCodeError(`Permission denied: ${path}`, 'PERMISSION_DENIED');
            case 'ENOTDIR':
              throw new QCodeError(`Path is not a directory: ${path}`, 'NOT_A_DIRECTORY');
            default:
              throw new QCodeError(`File system error: ${error.message}`, 'FS_ERROR');
          }
        }
        throw new QCodeError(`Unexpected error: ${error.message}`, 'UNKNOWN_ERROR');
      }

      throw new QCodeError('Unknown error occurred while listing files', 'UNKNOWN_ERROR');
    }
  }

  /**
   * Helper method to get all files recursively from a directory
   */
  private async getAllFilesRecursive(dirPath: string, includeHidden: boolean): Promise<string[]> {
    const allFiles: string[] = [];

    const processDirectory = async (currentPath: string): Promise<void> => {
      try {
        const entries = await fs.readdir(currentPath, { withFileTypes: true });

        for (const entry of entries) {
          // Skip hidden files/directories if not requested
          if (!includeHidden && entry.name.startsWith('.')) {
            continue;
          }

          const fullPath = join(currentPath, entry.name);
          allFiles.push(fullPath);

          // Recursively process subdirectories
          if (entry.isDirectory()) {
            await processDirectory(fullPath);
          }
        }
      } catch (error) {
        // Skip directories we can't access
      }
    };

    await processDirectory(dirPath);
    return allFiles;
  }

  /**
   * Helper method to get direct contents of a directory (non-recursive)
   */
  private async getDirectoryContents(dirPath: string, includeHidden: boolean): Promise<string[]> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const files: string[] = [];

      for (const entry of entries) {
        // Skip hidden files/directories if not requested
        if (!includeHidden && entry.name.startsWith('.')) {
          continue;
        }

        files.push(join(dirPath, entry.name));
      }

      return files;
    } catch (error) {
      throw new QCodeError(
        `Cannot read directory contents: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'DIRECTORY_READ_ERROR'
      );
    }
  }

  /**
   * Search files operation - full implementation for step 1.7.5
   */
  private async searchFiles(params: SearchFilesParams): Promise<SearchFilesResult> {
    const {
      query,
      path = '.',
      pattern,
      useRegex = false,
      caseSensitive = false,
      maxResults = 100,
      includeContext = true,
    } = params;

    try {
      // Validate and resolve the search path
      const searchPath = await this.validatePath(path, 'read');

      // Get list of files to search
      let filesToSearch: string[] = [];

      if (pattern) {
        // Use glob pattern to find files
        const globPattern = pattern.includes('/') ? pattern : `**/${pattern}`;
        const globOptions = {
          cwd: searchPath,
          absolute: true,
          dot: false, // Don't include hidden files by default
          onlyFiles: true, // Only return files, not directories
        };

        try {
          filesToSearch = await glob(globPattern, globOptions);
        } catch (globError) {
          throw new QCodeError(
            `Error processing search pattern "${pattern}": ${globError instanceof Error ? globError.message : 'Unknown error'}`,
            'PATTERN_ERROR'
          );
        }
      } else {
        // Get all files recursively
        const getAllFiles = async (dirPath: string): Promise<string[]> => {
          const files: string[] = [];

          try {
            const entries = await fs.readdir(dirPath, { withFileTypes: true });

            for (const entry of entries) {
              // Skip hidden files/directories
              if (entry.name.startsWith('.')) {
                continue;
              }

              const fullPath = join(dirPath, entry.name);

              if (entry.isDirectory()) {
                const subFiles = await getAllFiles(fullPath);
                files.push(...subFiles);
              } else if (entry.isFile()) {
                files.push(fullPath);
              }
            }
          } catch (error) {
            // Skip directories we can't access
          }

          return files;
        };

        filesToSearch = await getAllFiles(searchPath);
      }

      // Filter out binary files and prepare search regex
      let searchRegex: RegExp;
      try {
        if (useRegex) {
          const flags = caseSensitive ? 'g' : 'gi';
          searchRegex = new RegExp(query, flags);
        } else {
          // Escape special regex characters for literal search
          const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const flags = caseSensitive ? 'g' : 'gi';
          searchRegex = new RegExp(escapedQuery, flags);
        }
      } catch (regexError) {
        throw new QCodeError(
          `Invalid regex pattern: ${regexError instanceof Error ? regexError.message : 'Unknown error'}`,
          'REGEX_ERROR'
        );
      }

      // Search through files
      const matches: SearchMatch[] = [];
      let filesSearched = 0;
      let totalMatches = 0;

      for (const filePath of filesToSearch) {
        try {
          // Check if file is binary
          if (await this.isBinaryFile(filePath)) {
            continue;
          }

          filesSearched++;

          // Read file content
          const content = await fs.readFile(filePath, 'utf8');
          const lines = content.split('\n');

          // Search each line
          for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            const line = lines[lineIndex]!;
            let match: RegExpExecArray | null;

            // Reset regex lastIndex for global search
            searchRegex.lastIndex = 0;

            while ((match = searchRegex.exec(line)) !== null) {
              totalMatches++;

              // Check if we've hit the max results limit
              if (matches.length >= maxResults) {
                break;
              }

              const searchMatch: SearchMatch = {
                file: filePath,
                line: lineIndex + 1, // 1-indexed line numbers
                column: match.index,
                match: match[0],
              };

              // Add context if requested
              if (includeContext) {
                const contextLines = 2; // Number of lines before/after
                const beforeLines: string[] = [];
                const afterLines: string[] = [];

                // Get lines before
                for (let i = Math.max(0, lineIndex - contextLines); i < lineIndex; i++) {
                  beforeLines.push(lines[i]!);
                }

                // Get lines after
                for (
                  let i = lineIndex + 1;
                  i <= Math.min(lines.length - 1, lineIndex + contextLines);
                  i++
                ) {
                  afterLines.push(lines[i]!);
                }

                searchMatch.context = {
                  before: beforeLines,
                  after: afterLines,
                };
              }

              matches.push(searchMatch);

              // For non-global regex (no 'g' flag), break to avoid infinite loop
              if (!searchRegex.global) {
                break;
              }
            }

            // Break outer loop if we've hit max results
            if (matches.length >= maxResults) {
              break;
            }
          }

          // Break if we've hit max results
          if (matches.length >= maxResults) {
            break;
          }
        } catch (fileError) {
          // Skip files we can't read (permissions, etc.)
          continue;
        }
      }

      const result: SearchFilesResult = {
        matches,
        filesSearched,
        totalMatches,
        query,
      };

      // Mark as truncated if we hit the limit
      if (totalMatches > matches.length) {
        result.truncated = true;
      }

      return result;
    } catch (error) {
      if (error instanceof QCodeError) {
        throw error;
      }

      // Handle common Node.js file system errors
      if (error instanceof Error) {
        if ('code' in error) {
          switch (error.code) {
            case 'ENOENT':
              throw new QCodeError(`Directory not found: ${path}`, 'DIRECTORY_NOT_FOUND');
            case 'EACCES':
              throw new QCodeError(`Permission denied: ${path}`, 'PERMISSION_DENIED');
            case 'ENOTDIR':
              throw new QCodeError(`Path is not a directory: ${path}`, 'NOT_A_DIRECTORY');
            default:
              throw new QCodeError(`File system error: ${error.message}`, 'FS_ERROR');
          }
        }
        throw new QCodeError(`Search error: ${error.message}`, 'SEARCH_ERROR');
      }

      throw new QCodeError('Unknown error occurred while searching files', 'UNKNOWN_ERROR');
    }
  }

  /**
   * Utility method to validate file paths using workspace security
   */
  protected async validatePath(filePath: string, operation: 'read' | 'write'): Promise<string> {
    const normalizedPath = normalize(filePath);

    if (operation === 'read') {
      return await this.workspaceSecurity.validateReadPath(normalizedPath);
    } else {
      return await this.workspaceSecurity.validateWritePath(normalizedPath);
    }
  }
}
