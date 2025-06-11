import { z } from 'zod';
import { NamespacedTool, ToolDefinition, ToolResult, QCodeError } from '../types.js';
import { WorkspaceSecurity } from '../security/workspace.js';
import { CommandResult } from '../security/commands.js';
import { spawn } from 'child_process';
import { getLogger } from '../utils/logger.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

const logger = getLogger();

/**
 * Zod schema for shell command execution parameters
 */
const ShellExecutionSchema = z.object({
  command: z.string().min(1, 'Command is required'),
  args: z.array(z.string()).default([]).optional(),
  cwd: z.string().optional(),
  timeout: z.coerce.number().int().positive().max(300000).default(30000).optional(), // Max 5 minutes
  captureOutput: z.coerce.boolean().default(true).optional(),
  allowStreaming: z.coerce.boolean().default(false).optional(),
});

/**
 * Type definitions
 */
export type ShellExecutionParams = z.infer<typeof ShellExecutionSchema>;

/**
 * Result interface for shell execution
 */
export interface ShellExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  command: string;
  args: string[];
  duration: number;
  workingDirectory: string;
}

/**
 * Command Execution Tool
 *
 * Provides safe command execution with strict security controls following Claude Code's permission model:
 * - Exact command matching and prefix patterns with wildcards
 * - Allow/deny rule precedence (deny rules take precedence)
 * - Shell operator injection prevention
 * - Workspace boundary enforcement
 * - No automatic command transformation - users explicitly configure what they allow
 */
export class CommandTool implements NamespacedTool {
  public readonly namespace = 'internal';
  public readonly name = 'command';
  public readonly fullName = 'internal:command';
  readonly description =
    'Execute commands safely within the workspace using strict allow/deny permission patterns (similar to Claude Code Bash permissions)';
  readonly schema = ShellExecutionSchema;

  private workspaceSecurity: WorkspaceSecurity;
  private allowPatterns: string[];
  private denyPatterns: string[];

  constructor(
    workspaceSecurity: WorkspaceSecurity,
    config?: { allowPatterns?: string[]; denyPatterns?: string[] }
  ) {
    this.workspaceSecurity = workspaceSecurity;
    // Default to common safe patterns, following Claude Code's approach
    this.allowPatterns = config?.allowPatterns || [
      'echo *',
      'ls *', 
      'node *',
      'npm run *',
      'yarn run *',
      'git status',
      'git diff*',
      'git log*'
    ];
    this.denyPatterns = config?.denyPatterns || [
      'rm *',
      'del *', 
      'sudo *',
      '* && *',
      '* || *',
      '* ; *',
      '* | *',
      '* > *',
      '* < *'
    ];
  }

  /**
   * Tool definition for registry registration
   */
  public get definition(): ToolDefinition {
    return {
      name: this.name,
      description: this.description,
      parameters: zodToJsonSchema(this.schema) as any,
    };
  }

  /**
   * Execute a shell command with permission-based validation
   */
  async execute(args: Record<string, any>, _context?: any): Promise<ToolResult> {
    const startTime = Date.now();

    try {
      // Validate parameters
      const validatedParams = this.schema.parse(args);
      const {
        command,
        args: commandArgs = [],
        cwd,
        timeout = 30000,
        captureOutput = true,
      } = validatedParams;

      // Validate workspace boundaries for working directory
      let workingDirectory = cwd || process.cwd();
      if (cwd) {
        try {
          workingDirectory = await this.workspaceSecurity.validateWorkspacePath(cwd);
        } catch (error) {
          throw new QCodeError(
            `Working directory access denied: ${error instanceof Error ? error.message : 'Unknown error'}`,
            'WORKSPACE_VIOLATION',
            { path: cwd, originalError: error instanceof Error ? error.message : String(error) }
          );
        }
      }

      // Build full command string for pattern matching
      const fullCommand = [command, ...commandArgs].join(' ');

      // Check deny patterns first (they take precedence)
      if (this.matchesAnyPattern(fullCommand, this.denyPatterns)) {
        throw new QCodeError(
          `Command denied by security policy: ${fullCommand}`,
          'COMMAND_DENIED',
          { command: fullCommand, patterns: this.denyPatterns }
        );
      }

      // Check allow patterns
      if (!this.matchesAnyPattern(fullCommand, this.allowPatterns)) {
        throw new QCodeError(
          `Command not allowed by security policy: ${fullCommand}`,
          'COMMAND_NOT_ALLOWED',
          { command: fullCommand, patterns: this.allowPatterns }
        );
      }

      logger.debug('Executing command', {
        command,
        args: commandArgs,
        workingDirectory,
        timeout,
      });

      // Execute command with streaming support if enabled
      const result = validatedParams.allowStreaming
        ? await this.executeCommandWithStreaming(command, commandArgs, workingDirectory, timeout)
        : await this.executeCommandSecure(
            command,
            commandArgs,
            workingDirectory,
            timeout,
            captureOutput
          );

      // Format result
      const shellResult: ShellExecutionResult = {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        command: result.command,
        args: result.args,
        duration: result.duration,
        workingDirectory,
      };

      const duration = Date.now() - startTime;

      return {
        success: result.exitCode === 0,
        tool: this.name,
        namespace: this.namespace,
        data: shellResult,
        duration,
        ...(result.exitCode !== 0 && {
          error: `Command failed with exit code ${result.exitCode}: ${result.stderr || result.stdout}`,
        }),
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      if (error instanceof QCodeError) {
        return {
          success: false,
          tool: this.name,
          namespace: this.namespace,
          error: error.message,
          duration,
        };
      }

      logger.error('Shell execution failed', { error, args });

      return {
        success: false,
        tool: this.name,
        namespace: this.namespace,
        error: `Command execution failed: ${error instanceof Error ? error.message : String(error)}`,
        duration,
      };
    }
  }

  /**
   * Check if a command matches any of the given patterns
   * Supports simple wildcard matching similar to Claude Code's Bash permissions
   */
  private matchesAnyPattern(command: string, patterns: string[]): boolean {
    return patterns.some(pattern => {
      // Convert simple wildcard pattern to regex
      const regexPattern = pattern
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // Escape regex special chars
        .replace(/\\\*/g, '.*'); // Convert * to .*
      
      const regex = new RegExp(`^${regexPattern}$`, 'i');
      return regex.test(command);
    });
  }

  /**
   * Execute command securely with timeout and output capture
   */
  private async executeCommandSecure(
    command: string,
    args: string[],
    workingDirectory: string,
    timeout: number,
    captureOutput: boolean
  ): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      let stdout = '';
      let stderr = '';

      const child = spawn(command, args, {
        cwd: workingDirectory,
        stdio: captureOutput ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'inherit', 'inherit'],
        shell: false, // Never use shell to prevent injection
      });

      if (captureOutput) {
        child.stdout?.on('data', (data) => {
          stdout += data.toString();
        });

        child.stderr?.on('data', (data) => {
          stderr += data.toString();
        });
      }

      const timeoutHandle = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`Command timed out after ${timeout}ms`));
      }, timeout);

      child.on('close', (code) => {
        clearTimeout(timeoutHandle);
        const duration = Date.now() - startTime;

        resolve({
          stdout,
          stderr,
          exitCode: code || 0,
          command,
          args,
          duration,
        });
      });

      child.on('error', (error) => {
        clearTimeout(timeoutHandle);
        reject(error);
      });
    });
  }

  /**
   * Execute command with real-time streaming output
   */
  private async executeCommandWithStreaming(
    command: string,
    args: string[],
    workingDirectory: string,
    timeout: number
  ): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      let stdout = '';
      let stderr = '';

      const child = spawn(command, args, {
        cwd: workingDirectory,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
      });

      child.stdout?.on('data', (data) => {
        const chunk = data.toString();
        stdout += chunk;
        // Stream to console in real-time
        process.stdout.write(chunk);
      });

      child.stderr?.on('data', (data) => {
        const chunk = data.toString();
        stderr += chunk;
        // Stream to console in real-time
        process.stderr.write(chunk);
      });

      const timeoutHandle = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`Command timed out after ${timeout}ms`));
      }, timeout);

      child.on('close', (code) => {
        clearTimeout(timeoutHandle);
        const duration = Date.now() - startTime;

        resolve({
          stdout,
          stderr,
          exitCode: code || 0,
          command,
          args,
          duration,
        });
      });

      child.on('error', (error) => {
        clearTimeout(timeoutHandle);
        reject(error);
      });
    });
  }

  /**
   * Convert tool to Ollama format for LLM function calling
   */
  toOllamaFormat(): any {
    return {
      type: 'function',
      function: {
        name: this.fullName,
        description: this.description,
        parameters: zodToJsonSchema(this.schema),
      },
    };
  }
}
