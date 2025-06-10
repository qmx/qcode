import { z } from 'zod';
import { NamespacedTool, ToolDefinition, ToolResult, QCodeError } from '../../types.js';
import { GitBase } from './base.js';

/**
 * Simple schema for git diff
 */
const GitDiffSchema = z.object({
  files: z.array(z.string()).default([]).optional(),
  contextLines: z.coerce.number().int().min(0).max(20).default(3).optional(),
  ignoreWhitespace: z.coerce.boolean().default(false).optional(),
  statsOnly: z.coerce.boolean().default(false).optional(),
});

export type GitDiffParams = z.infer<typeof GitDiffSchema>;

/**
 * Git diff result
 */
export interface GitDiffResult {
  hasChanges: boolean;
  filesChanged: number;
  insertions: number;
  deletions: number;
  changedFiles: string[];
  diff: string;
  summary: string;
}

/**
 * GitDiffTool - Shows working directory changes
 */
export class GitDiffTool extends GitBase implements NamespacedTool {
  public readonly namespace = 'internal';
  public readonly name = 'git.diff';
  public readonly fullName = 'internal:git.diff';

  /**
   * Tool definition for LLM
   */
  public get definition(): ToolDefinition {
    return {
      name: 'git.diff',
      description: 'Show changes in working directory - what has been modified but not yet committed. Use this to see what the user has changed since their last commit.',
      parameters: {
        type: 'object',
        properties: {
          files: {
            type: 'array',
            items: { type: 'string' },
            description: 'MUST be an array of file paths. For all files: [] or omit. For one file: ["src/app.js"]. For multiple files: ["src/app.js", "README.md"].',
          },
          contextLines: {
            type: 'number',
            description: 'Number of context lines around changes (default: 3). Higher numbers show more surrounding code.',
          },
          ignoreWhitespace: {
            type: 'boolean',
            description: 'Set to true to ignore whitespace-only changes in the diff output.',
          },
          statsOnly: {
            type: 'boolean',
            description: 'Set to true to show only file change statistics (files changed, insertions, deletions) without the actual diff content.',
          },
        },
        additionalProperties: false,
        required: [],
      },
    };
  }

  /**
   * Execute git diff
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
      const params = GitDiffSchema.parse(args);

      const result = await this.getDiff(params);
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
        error: `Git diff failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        duration,
        tool: this.name,
        namespace: this.namespace,
      };
    }
  }

  /**
   * Get git diff information
   */
  private async getDiff(params: GitDiffParams): Promise<GitDiffResult> {
    const args = ['diff'];
    
    // Add context lines
    args.push(`--unified=${params.contextLines ?? 3}`);

    // Add ignore whitespace
    if (params.ignoreWhitespace) {
      args.push('--ignore-all-space');
    }

    // Always include stats
    args.push('--stat');

    // Add specific files if provided
    if (params.files && params.files.length > 0) {
      const sanitizedFiles = await this.sanitizeFilePaths(params.files);
      if (sanitizedFiles.length > 0) {
        args.push('--', ...sanitizedFiles);
      }
    }

    const result = await this.executeGitCommand(args);

    if (result.exitCode !== 0) {
      throw new QCodeError('Failed to get git diff', 'GIT_DIFF_FAILED', {
        stderr: result.stderr,
        args,
      });
    }

    return this.parseDiff(result.stdout, params.statsOnly ?? false);
  }

  /**
   * Parse git diff output
   */
  private parseDiff(output: string, statsOnly: boolean): GitDiffResult {
    const hasChanges = output.trim().length > 0;

    if (!hasChanges) {
      return {
        hasChanges: false,
        filesChanged: 0,
        insertions: 0,
        deletions: 0,
        changedFiles: [],
        diff: '',
        summary: 'No changes in working directory',
      };
    }

    // Parse stats line (e.g., "2 files changed, 13 insertions(+), 4 deletions(-)")
    let filesChanged = 0;
    let insertions = 0;
    let deletions = 0;
    
    const statsMatch = output.match(/(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/);
    if (statsMatch) {
      filesChanged = parseInt(statsMatch[1]!, 10);
      insertions = parseInt(statsMatch[2] || '0', 10);
      deletions = parseInt(statsMatch[3] || '0', 10);
    }

    // Extract changed files from the stat section
    const changedFiles: string[] = [];
    const lines = output.split('\n');
    for (const line of lines) {
      // Look for lines like " src/cli.ts | 9 ++++++++++"
      const fileMatch = line.match(/^\s*(.+?)\s*\|\s*\d+/);
      if (fileMatch && !line.includes('files changed')) {
        changedFiles.push(fileMatch[1]!.trim());
      }
    }

    const summary = `${filesChanged} file${filesChanged !== 1 ? 's' : ''} changed` +
                   (insertions > 0 ? `, ${insertions} insertion${insertions !== 1 ? 's' : ''}` : '') +
                   (deletions > 0 ? `, ${deletions} deletion${deletions !== 1 ? 's' : ''}` : '');

    return {
      hasChanges: true,
      filesChanged,
      insertions,
      deletions,
      changedFiles,
      diff: statsOnly ? '' : output,
      summary,
    };
  }
} 