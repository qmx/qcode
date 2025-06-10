import { spawn } from 'child_process';
import { WorkspaceSecurity } from '../../security/workspace.js';
import { QCodeError } from '../../types.js';
import { getLogger } from '../../utils/logger.js';

const logger = getLogger();

/**
 * Result of git command execution
 */
export interface GitCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  command: string;
  args: string[];
  duration: number;
}

/**
 * Base class for git tools providing common functionality
 */
export abstract class GitBase {
  protected readonly workspaceSecurity: WorkspaceSecurity;
  protected readonly workingDirectory: string;

  constructor(workspaceSecurity: WorkspaceSecurity, workingDirectory?: string) {
    this.workspaceSecurity = workspaceSecurity;
    this.workingDirectory = workingDirectory || process.cwd();
  }

  /**
   * Execute a git command safely
   */
  protected async executeGitCommand(args: string[], options?: {
    cwd?: string;
    timeout?: number;
  }): Promise<GitCommandResult> {
    const startTime = Date.now();
    const cwd = options?.cwd || this.workingDirectory;
    const timeout = options?.timeout || 30000; // 30 second default timeout

    logger.debug(`Executing git command: git ${args.join(' ')}`, { cwd, args });

    return new Promise((resolve, reject) => {
      const gitProcess = spawn('git', args, {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
      });

      let stdout = '';
      let stderr = '';
      let isTimedOut = false;

      // Set up timeout
      const timeoutHandle = setTimeout(() => {
        isTimedOut = true;
        gitProcess.kill('SIGTERM');
        reject(new QCodeError(
          `Git command timed out after ${timeout}ms`,
          'GIT_COMMAND_TIMEOUT',
          { args, timeout }
        ));
      }, timeout);

      // Collect output
      gitProcess.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      gitProcess.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      // Handle process completion
      gitProcess.on('close', (code) => {
        if (isTimedOut) return; // Already handled by timeout

        clearTimeout(timeoutHandle);
        const duration = Date.now() - startTime;

        const result: GitCommandResult = {
          exitCode: code || 0,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          command: 'git',
          args,
          duration,
        };

        logger.debug(`Git command completed`, { exitCode: code, duration, stdout: stdout.length, stderr: stderr.length });
        resolve(result);
      });

      // Handle process errors
      gitProcess.on('error', (error) => {
        if (isTimedOut) return; // Already handled by timeout

        clearTimeout(timeoutHandle);
        reject(new QCodeError(
          `Failed to execute git command: ${error.message}`,
          'GIT_COMMAND_ERROR',
          { args, error: error.message }
        ));
      });
    });
  }

  /**
   * Check if a directory is a git repository
   */
  async isGitRepository(path?: string): Promise<boolean> {
    const checkPath = path || this.workingDirectory;
    
    try {
      const result = await this.executeGitCommand(['rev-parse', '--git-dir'], { 
        cwd: checkPath,
        timeout: 5000 // Short timeout for this check
      });
      return result.exitCode === 0;
    } catch (error) {
      logger.debug(`Git repository check failed`, { path: checkPath, error });
      return false;
    }
  }

  /**
   * Sanitize and validate file paths for git operations
   */
  protected async sanitizeFilePaths(paths: string[]): Promise<string[]> {
    const sanitized: string[] = [];

    for (const path of paths) {
      try {
        // For git operations, we only need to validate the path is within workspace
        // but don't require the file to exist (git can handle non-existent files)
        await this.workspaceSecurity.validateWorkspacePath(path);
        
        // Normalize path separators and resolve relative paths
        const normalizedPath = path.replace(/\\/g, '/');
        
        // Add to sanitized list
        sanitized.push(normalizedPath);
      } catch (error) {
        logger.warn(`Skipping invalid path in git operation`, { path, error });
        // Skip invalid paths rather than failing the entire operation
      }
    }

    return sanitized;
  }

  /**
   * Get the root directory of the git repository
   */
  protected async getGitRoot(path?: string): Promise<string> {
    const checkPath = path || this.workingDirectory;
    
    const result = await this.executeGitCommand(['rev-parse', '--show-toplevel'], { 
      cwd: checkPath,
      timeout: 5000
    });
    
    if (result.exitCode !== 0) {
      throw new QCodeError(
        'Failed to determine git repository root',
        'GIT_ROOT_NOT_FOUND',
        { path: checkPath, stderr: result.stderr }
      );
    }

    return result.stdout.trim();
  }
} 