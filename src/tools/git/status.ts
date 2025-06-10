import { z } from 'zod';
import { NamespacedTool, ToolDefinition, ToolResult, QCodeError } from '../../types.js';
import { GitBase } from './base.js';

/**
 * Simple schema for git status
 */
const GitStatusSchema = z.object({
  includeUntracked: z.coerce.boolean().default(true).optional(),
  porcelain: z.coerce.boolean().default(false).optional(),
});

export type GitStatusParams = z.infer<typeof GitStatusSchema>;

/**
 * Git status result
 */
export interface GitStatusResult {
  isClean: boolean;
  modifiedFiles: string[];
  addedFiles: string[];
  deletedFiles: string[];
  untrackedFiles: string[];
  renamedFiles: Array<{ from: string; to: string }>;
  summary: string;
  rawOutput: string;
}

/**
 * GitStatusTool - Shows working directory status
 */
export class GitStatusTool extends GitBase implements NamespacedTool {
  public readonly namespace = 'internal';
  public readonly name = 'git.status';
  public readonly fullName = 'internal:git.status';

  /**
   * Tool definition for LLM
   */
  public get definition(): ToolDefinition {
    return {
      name: 'git.status',
      description: 'Show git working directory status - what files are modified, added, deleted, or untracked',
      parameters: {
        type: 'object',
        properties: {
          includeUntracked: {
            type: 'boolean',
            description: 'Include untracked files in the status (default: true)',
          },
          porcelain: {
            type: 'boolean', 
            description: 'Use porcelain format for machine-readable output (default: false)',
          },
        },
        additionalProperties: false,
      },
    };
  }

  /**
   * Execute git status
   */
  public async execute(args: Record<string, any>): Promise<ToolResult> {
    const startTime = Date.now();

    try {
      // Validate we're in a git repository
      if (!(await this.isGitRepository())) {
        throw new QCodeError(
          'Current directory is not a git repository',
          'NOT_GIT_REPOSITORY',
          { workingDirectory: this.workingDirectory }
        );
      }

      // Parse parameters
      const params = GitStatusSchema.parse(args);

      const result = await this.getStatus(params);
      const duration = Date.now() - startTime;

      return {
        success: true,
        data: result,
        duration,
        tool: this.name,
        namespace: this.namespace,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      if (error instanceof QCodeError) {
        return {
          success: false,
          error: error.message,
          duration,
          tool: this.name,
          namespace: this.namespace,
        };
      }

      return {
        success: false,
        error: `Git status failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        duration,
        tool: this.name,
        namespace: this.namespace,
      };
    }
  }

  /**
   * Get git status information
   */
  private async getStatus(params: GitStatusParams): Promise<GitStatusResult> {
    const args = ['status'];
    
    if (params.porcelain) {
      args.push('--porcelain');
    }

    const result = await this.executeGitCommand(args);

    if (result.exitCode !== 0) {
      throw new QCodeError('Failed to get git status', 'GIT_STATUS_FAILED', {
        stderr: result.stderr,
        args,
      });
    }

    return this.parseStatus(result.stdout, params.includeUntracked ?? true);
  }

  /**
   * Parse git status output
   */
  private parseStatus(output: string, includeUntracked: boolean): GitStatusResult {
    const lines = output.split('\n').filter(line => line.trim().length > 0);
    
    const modifiedFiles: string[] = [];
    const addedFiles: string[] = [];
    const deletedFiles: string[] = [];
    const untrackedFiles: string[] = [];
    const renamedFiles: Array<{ from: string; to: string }> = [];

    for (const line of lines) {
      // Skip status headers
      if (line.startsWith('On branch') || 
          line.startsWith('Your branch') || 
          line.startsWith('Changes to be committed') ||
          line.startsWith('Changes not staged') ||
          line.startsWith('Untracked files') ||
          line.includes('use "git') ||
          line.trim() === '' ||
          line.startsWith('\t(')) {
        continue;
      }

      // Parse file changes
      if (line.includes('modified:')) {
        const file = line.replace(/.*modified:\s+/, '').trim();
        modifiedFiles.push(file);
      } else if (line.includes('new file:')) {
        const file = line.replace(/.*new file:\s+/, '').trim();
        addedFiles.push(file);
      } else if (line.includes('deleted:')) {
        const file = line.replace(/.*deleted:\s+/, '').trim();
        deletedFiles.push(file);
      } else if (line.includes('renamed:')) {
        const match = line.match(/renamed:\s+(.+?)\s+->\s+(.+)/);
        if (match) {
          renamedFiles.push({ from: match[1]!.trim(), to: match[2]!.trim() });
        }
      } else if (line.startsWith('\t') && includeUntracked) {
        // Untracked files are indented
        const file = line.trim();
        if (file && !file.startsWith('(')) {
          untrackedFiles.push(file);
        }
      }
    }

    const totalChanges = modifiedFiles.length + addedFiles.length + deletedFiles.length + renamedFiles.length;
    const isClean = totalChanges === 0 && untrackedFiles.length === 0;

    let summary = '';
    if (isClean) {
      summary = 'Working directory is clean';
    } else {
      const parts: string[] = [];
      if (modifiedFiles.length > 0) parts.push(`${modifiedFiles.length} modified`);
      if (addedFiles.length > 0) parts.push(`${addedFiles.length} added`);
      if (deletedFiles.length > 0) parts.push(`${deletedFiles.length} deleted`);
      if (renamedFiles.length > 0) parts.push(`${renamedFiles.length} renamed`);
      if (untrackedFiles.length > 0) parts.push(`${untrackedFiles.length} untracked`);
      summary = `Working directory has changes: ${parts.join(', ')}`;
    }

    return {
      isClean,
      modifiedFiles,
      addedFiles,
      deletedFiles,
      untrackedFiles,
      renamedFiles,
      summary,
      rawOutput: output,
    };
  }
} 