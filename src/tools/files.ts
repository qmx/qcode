import { z } from 'zod';
import { normalize } from 'pathe';
import { NamespacedTool, ToolDefinition, ToolResult, QCodeError } from '../types.js';
import { WorkspaceSecurity } from '../security/workspace.js';

/**
 * Zod schemas for file operation parameters
 */

// Read file operation schema
const ReadFileSchema = z.object({
  operation: z.literal('read'),
  path: z.string().min(1, 'File path is required'),
  startLine: z.number().int().positive().optional(),
  endLine: z.number().int().positive().optional(),
  encoding: z.enum(['utf8', 'utf-8', 'ascii', 'base64', 'hex']).default('utf8').optional(),
});

// Write file operation schema
const WriteFileSchema = z.object({
  operation: z.literal('write'),
  path: z.string().min(1, 'File path is required'),
  content: z.string(),
  encoding: z.enum(['utf8', 'utf-8', 'ascii', 'base64', 'hex']).default('utf8').optional(),
  backup: z.boolean().default(true).optional(),
  createDirs: z.boolean().default(true).optional(),
});

// List files operation schema
const ListFilesSchema = z.object({
  operation: z.literal('list'),
  path: z.string().default('.').optional(),
  pattern: z.string().optional(),
  recursive: z.boolean().default(false).optional(),
  includeHidden: z.boolean().default(false).optional(),
  includeMetadata: z.boolean().default(false).optional(),
});

// Search files operation schema
const SearchFilesSchema = z.object({
  operation: z.literal('search'),
  query: z.string().min(1, 'Search query is required'),
  path: z.string().default('.').optional(),
  pattern: z.string().optional(),
  useRegex: z.boolean().default(false).optional(),
  caseSensitive: z.boolean().default(false).optional(),
  maxResults: z.number().int().positive().default(100).optional(),
  includeContext: z.boolean().default(true).optional(),
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
   * Execute file operation with security validation
   */
  public async execute(args: Record<string, any>): Promise<ToolResult> {
    const startTime = Date.now();

    try {
      // Validate and parse arguments
      const params = FileOperationSchema.parse(args);

      // Execute the appropriate operation
      let data: any;
      switch (params.operation) {
        case 'read':
          data = await this.readFile(params);
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
        default:
          throw new QCodeError(
            `Unknown operation: ${(params as any).operation}`,
            'INVALID_OPERATION'
          );
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
   * Read file operation - placeholder for step 1.7.2
   */
  private async readFile(_params: ReadFileParams): Promise<ReadFileResult> {
    throw new QCodeError('Read file operation not yet implemented', 'NOT_IMPLEMENTED');
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
