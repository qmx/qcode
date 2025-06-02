import { z } from 'zod';
import { normalize, join } from 'pathe';
import { promises as fs } from 'fs';
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
  startLine: z.coerce.number().int().positive().optional(),
  endLine: z.coerce.number().int().positive().optional(),
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
            description: 'File or directory path (relative to workspace root)',
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
            description: 'Glob pattern to filter files (e.g., "**/*.ts")',
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
          data = await this.listFiles(params);
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
   * Write file operation - placeholder for step 1.7.3
   */
  private async writeFile(_params: WriteFileParams): Promise<WriteFileResult> {
    throw new QCodeError('Write file operation not yet implemented', 'NOT_IMPLEMENTED');
  }

  /**
   * List files operation - placeholder for step 1.7.4
   */
  private async listFiles(_params: ListFilesParams): Promise<ListFilesResult> {
    throw new QCodeError('List files operation not yet implemented', 'NOT_IMPLEMENTED');
  }

  /**
   * Search files operation - placeholder for step 1.7.5
   */
  private async searchFiles(_params: SearchFilesParams): Promise<SearchFilesResult> {
    throw new QCodeError('Search files operation not yet implemented', 'NOT_IMPLEMENTED');
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
