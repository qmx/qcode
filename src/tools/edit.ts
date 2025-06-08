import { z } from 'zod';
import { normalize, dirname } from 'pathe';
import { promises as fs } from 'fs';
import { NamespacedTool, ToolDefinition, ToolResult, QCodeError } from '../types.js';
import { WorkspaceSecurity } from '../security/workspace.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger();
import { zodToJsonSchema } from 'zod-to-json-schema';


/**
 * Zod schemas for edit operation parameters
 */

// Insert line operation schema
const InsertLineSchema = z.object({
  operation: z.literal('insert_line'),
  file: z.string().min(1, 'File path is required'),
  line_number: z.coerce.number().int().positive('Line number must be positive'),
  content: z.string(),
});

// Replace text operation schema
const ReplaceSchema = z.object({
  operation: z.literal('replace'),
  file: z.string().min(1, 'File path is required'),
  search: z.string().min(1, 'Search pattern is required'),
  replace: z.string(),
  regex: z.coerce.boolean().default(false).optional(),
  global: z.coerce.boolean().default(true).optional(),
});

// Replace lines operation schema
const ReplaceLinesSchema = z.object({
  operation: z.literal('replace_lines'),
  file: z.string().min(1, 'File path is required'),
  start_line: z.coerce.number().int().positive('Start line must be positive'),
  end_line: z.coerce.number().int().positive('End line must be positive'),
  content: z.string(),
});

// Delete lines operation schema
const DeleteLinesSchema = z.object({
  operation: z.literal('delete_lines'),
  file: z.string().min(1, 'File path is required'),
  start_line: z.coerce.number().int().positive('Start line must be positive'),
  end_line: z.coerce.number().int().positive('End line must be positive'),
});

// Create file operation schema
const CreateFileSchema = z.object({
  operation: z.literal('create_file'),
  file: z.string().min(1, 'File path is required'),
  content: z.string(),
  create_directories: z.coerce.boolean().default(true).optional(),
});

// Rollback operation schema


// Union schema for all edit operations
const EditOperationSchema = z.discriminatedUnion('operation', [
  InsertLineSchema,
  ReplaceSchema,
  ReplaceLinesSchema,
  DeleteLinesSchema,
  CreateFileSchema,
]);

// Remove unused type

/**
 * Internal tool for surgical file editing operations
 * Provides precise file modifications with automatic backup and atomic operations
 */
export class EditTool implements NamespacedTool {
  public readonly namespace = 'internal';
  public readonly name = 'edit';
  public readonly fullName = 'internal.edit';

  constructor(private security: WorkspaceSecurity) {}

  public get definition(): ToolDefinition {
    return {
      name: this.fullName,
      description: `SURGICAL FILE EDITING TOOL - Use for precise, line-level file modifications.

WHEN TO USE THIS TOOL (vs files tool):
- Insert lines at specific positions without rewriting entire file
- Replace specific text patterns or line ranges 
- Delete specific lines by number
- Create new files (alternative to files tool)
- Rollback to previous versions

AVAILABLE OPERATIONS:

1. insert_line: Insert content at specific line number
   Parameters: { operation: "insert_line", file: "path", line_number: 1, content: "new line" }
   Use when: Adding code/content at precise location

2. replace: Search and replace text (supports regex)  
   Parameters: { operation: "replace", file: "path", search: "old", replace: "new", regex: false, global: true }
   Use when: Changing function names, variables, or text patterns

3. replace_lines: Replace specific line ranges
   Parameters: { operation: "replace_lines", file: "path", start_line: 5, end_line: 10, content: "new content" }
   Use when: Replacing entire functions, blocks, or sections

4. delete_lines: Delete specific line ranges
   Parameters: { operation: "delete_lines", file: "path", start_line: 5, end_line: 10 }
   Use when: Removing specific code blocks or lines

5. create_file: Create new file with content
   Parameters: { operation: "create_file", file: "path", content: "file content", create_directories: true }
   Use when: Creating new files (alternative to files tool)

ADVANTAGES over files tool:
- Precise line-level operations without rewriting entire file  
- Atomic operations (fail-safe)
- No workspace pollution (users should rely on version control for safety)

IMPORTANT: Always use exact parameter names as shown above. Line numbers are 1-based (line 1 = first line).`,
      parameters: zodToJsonSchema(EditOperationSchema) as any,
    };
  }

  public async execute(args: Record<string, any>): Promise<ToolResult> {
    try {
      const startTime = Date.now();
      const operation = EditOperationSchema.parse(args);

      logger.debug('Edit operation requested', {
        operation: operation.operation,
        file: operation.file,
      });

      // Validate file path security
      const filePath = normalize(operation.file);
      const resolvedPath = await this.validatePath(filePath, 'write');
      let result: ToolResult;

      switch (operation.operation) {
        case 'insert_line':
          result = await this.insertLine(resolvedPath, operation);
          break;
        case 'replace':
          result = await this.replaceText(resolvedPath, operation);
          break;
        case 'replace_lines':
          result = await this.replaceLines(resolvedPath, operation);
          break;
        case 'delete_lines':
          result = await this.deleteLines(resolvedPath, operation);
          break;
        case 'create_file':
          result = await this.createFile(resolvedPath, operation);
          break;

        default:
          throw new QCodeError(
            'invalid-operation',
            `Unknown edit operation: ${(operation as any).operation}`
          );
      }

      const duration = Date.now() - startTime;
      logger.debug('Edit operation completed', {
        operation: operation.operation,
        file: operation.file,
        duration,
      });

      return {
        ...result,
        duration,
        tool: this.fullName,
        namespace: this.namespace,
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new QCodeError('invalid-params', 'Invalid edit operation parameters', {
          zodError: error.errors,
        });
      }

      if (error instanceof QCodeError) {
        throw error;
      }

      throw new QCodeError(
        'edit-failed',
        `Edit operation failed: ${error instanceof Error ? error.message : String(error)}`,
        { originalError: error }
      );
    }
  }

  /**
   * Insert a line at the specified position
   */
  private async insertLine(
    filePath: string,
    operation: z.infer<typeof InsertLineSchema>
  ): Promise<ToolResult> {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.split('\n');

      // Validate line number (1-based indexing, can insert at end + 1)
      if (operation.line_number < 1 || operation.line_number > lines.length + 1) {
        throw new QCodeError(
          'invalid-line-number',
          `Line number ${operation.line_number} is out of range (1-${lines.length + 1})`
        );
      }

      // Insert line (convert to 0-based indexing)
      const insertIndex = operation.line_number - 1;
      lines.splice(insertIndex, 0, operation.content);

      // Write atomically
      await this.writeAtomic(filePath, lines.join('\n'));

      return this.createToolResult(true, {
        operation: 'insert_line',
        file: operation.file,
        line_number: operation.line_number,
        content: operation.content,
        lines_after: lines.length,
      });
    } catch (error) {
      throw error;
    }
  }

  /**
   * Replace text using search and replace
   */
  private async replaceText(
    filePath: string,
    operation: z.infer<typeof ReplaceSchema>
  ): Promise<ToolResult> {
    try {
      const content = await fs.readFile(filePath, 'utf8');

      let newContent: string;
      let matchCount = 0;

      if (operation.regex) {
        const flags = operation.global ? 'g' : '';
        const regex = new RegExp(operation.search, flags);
        newContent = content.replace(regex, () => {
          matchCount++;
          return operation.replace;
        });
      } else {
        // Simple string replacement
        if (operation.global) {
          const parts = content.split(operation.search);
          matchCount = parts.length - 1;
          newContent = parts.join(operation.replace);
        } else {
          if (content.includes(operation.search)) {
            matchCount = 1;
            newContent = content.replace(operation.search, operation.replace);
          } else {
            newContent = content;
          }
        }
      }

      // Write atomically
      await this.writeAtomic(filePath, newContent);

      return this.createToolResult(true, {
        operation: 'replace',
        file: operation.file,
        search: operation.search,
        replace: operation.replace,
        matches_found: matchCount,
      });
    } catch (error) {
      throw error;
    }
  }

  /**
   * Replace a range of lines
   */
  private async replaceLines(
    filePath: string,
    operation: z.infer<typeof ReplaceLinesSchema>
  ): Promise<ToolResult> {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.split('\n');

      // Validate line numbers
      if (operation.start_line < 1 || operation.start_line > lines.length) {
        throw new QCodeError(
          'invalid-line-number',
          `Start line ${operation.start_line} is out of range (1-${lines.length})`
        );
      }

      if (operation.end_line < operation.start_line || operation.end_line > lines.length) {
        throw new QCodeError(
          'invalid-line-number',
          `End line ${operation.end_line} is invalid (must be ${operation.start_line}-${lines.length})`
        );
      }

      // Replace lines (convert to 0-based indexing)
      const startIndex = operation.start_line - 1;
      const endIndex = operation.end_line - 1;
      const linesReplaced = endIndex - startIndex + 1;

      // Split new content into lines and replace
      const newLines = operation.content.split('\n');
      lines.splice(startIndex, linesReplaced, ...newLines);

      // Write atomically
      await this.writeAtomic(filePath, lines.join('\n'));

      return this.createToolResult(true, {
        operation: 'replace_lines',
        file: operation.file,
        start_line: operation.start_line,
        end_line: operation.end_line,
        lines_replaced: linesReplaced,
        new_lines_count: newLines.length,
      });
    } catch (error) {
      throw error;
    }
  }

  /**
   * Delete a range of lines
   */
  private async deleteLines(
    filePath: string,
    operation: z.infer<typeof DeleteLinesSchema>
  ): Promise<ToolResult> {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.split('\n');

      // Validate line numbers
      if (operation.start_line < 1 || operation.start_line > lines.length) {
        throw new QCodeError(
          'invalid-line-number',
          `Start line ${operation.start_line} is out of range (1-${lines.length})`
        );
      }

      if (operation.end_line < operation.start_line || operation.end_line > lines.length) {
        throw new QCodeError(
          'invalid-line-number',
          `End line ${operation.end_line} is invalid (must be ${operation.start_line}-${lines.length})`
        );
      }

      // Delete lines (convert to 0-based indexing)
      const startIndex = operation.start_line - 1;
      const endIndex = operation.end_line - 1;
      const linesDeleted = endIndex - startIndex + 1;

      lines.splice(startIndex, linesDeleted);

      // Write atomically
      await this.writeAtomic(filePath, lines.join('\n'));

      return this.createToolResult(true, {
        operation: 'delete_lines',
        file: operation.file,
        start_line: operation.start_line,
        end_line: operation.end_line,
        lines_deleted: linesDeleted,
        lines_remaining: lines.length,
      });
    } catch (error) {
      throw error;
    }
  }

  /**
   * Create a new file with optional directory creation
   */
  private async createFile(
    filePath: string,
    operation: z.infer<typeof CreateFileSchema>
  ): Promise<ToolResult> {
    // Check if file already exists
    if (await this.fileExists(filePath)) {
      throw new QCodeError('file-exists', `File already exists: ${operation.file}`, {
        path: filePath,
      });
    }

    try {
      // Create directories if needed
      if (operation.create_directories) {
        const dir = dirname(filePath);
        await fs.mkdir(dir, { recursive: true });
      }

      // Write file atomically
      await this.writeAtomic(filePath, operation.content);

      return this.createToolResult(true, {
        operation: 'create_file',
        file: operation.file,
        size: Buffer.byteLength(operation.content, 'utf8'),
        directories_created: operation.create_directories,
      });
    } catch (error) {
      throw new QCodeError(
        'file-creation-failed',
        `Failed to create file: ${error instanceof Error ? error.message : String(error)}`,
        { path: filePath, originalError: error }
      );
    }
  }

  /**
   * Write file content atomically (write to temp file, then rename)
   */
  private async writeAtomic(filePath: string, content: string): Promise<void> {
    const tempPath = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).substr(2, 9)}`;

    try {
      await fs.writeFile(tempPath, content, 'utf8');
      await fs.rename(tempPath, filePath);
    } catch (error) {
      // Clean up temp file on failure
      try {
        await fs.unlink(tempPath);
      } catch {
        // Ignore cleanup errors
      }
      throw error;
    }
  }

  /**
   * Check if file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Validate file path using workspace security
   */
  private async validatePath(filePath: string, operation: 'read' | 'write'): Promise<string> {
    const normalizedPath = normalize(filePath);
    if (operation === 'read') {
      return await this.security.validateReadPath(normalizedPath);
    } else {
      return await this.security.validateWritePath(normalizedPath);
    }
  }

  /**
   * Create a properly formatted ToolResult
   */
  private createToolResult(success: boolean, data?: any, error?: string): ToolResult {
    const result: ToolResult = {
      success,
      duration: 0, // Will be set by the main execute method
      tool: this.fullName,
      namespace: this.namespace,
    };

    if (data !== undefined) {
      result.data = data;
    }

    if (error !== undefined) {
      result.error = error;
    }

    return result;
  }
}
