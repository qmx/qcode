import { z } from 'zod';
import { NamespacedTool, ToolDefinition, ToolResult, QCodeError } from '../types.js';
import { WorkspaceSecurity } from '../security/workspace.js';
import {
  CommandResult,
  isCommandAllowed,
  isForbiddenCommand,
  DEFAULT_ALLOWED_COMMANDS,
  FORBIDDEN_COMMAND_PATTERNS,
} from '../security/commands.js';
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
 * Shell Execution Tool
 *
 * Provides safe shell command execution with strict security controls:
 * - Command allowlist enforcement
 * - Forbidden pattern detection
 * - Workspace boundary enforcement
 * - Argument sanitization
 * - Timeout protection
 * - Real-time output streaming (optional)
 */
export class ShellTool implements NamespacedTool {
  public readonly namespace = 'internal';
  public readonly name = 'shell';
  public readonly fullName = 'internal:shell';
  readonly description =
    'Execute shell commands safely within the workspace with strict security controls';
  readonly schema = ShellExecutionSchema;

  private workspaceSecurity: WorkspaceSecurity;
  private allowedCommands: string[];
  private forbiddenPatterns: string[];

  constructor(
    workspaceSecurity: WorkspaceSecurity,
    config?: { allowedCommands?: string[]; forbiddenPatterns?: string[] }
  ) {
    this.workspaceSecurity = workspaceSecurity;
    this.allowedCommands = config?.allowedCommands || DEFAULT_ALLOWED_COMMANDS;
    this.forbiddenPatterns = config?.forbiddenPatterns || FORBIDDEN_COMMAND_PATTERNS;
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
   * Execute a shell command with comprehensive validation
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

      // Pre-execution validation
      this.validateCommand(command, commandArgs);

      logger.debug('Executing shell command', {
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
        success: true,
        data: shellResult,
        duration,
        tool: this.name,
        namespace: 'internal',
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      if (error instanceof QCodeError) {
        logger.error('Shell command validation failed', {
          command: args.command,
          args: args.args,
          error: error.message,
          duration,
        });

        return {
          success: false,
          error: error.message,
          duration,
          tool: this.name,
          namespace: 'internal',
        };
      }

      logger.error('Unexpected shell execution error', {
        command: args.command,
        args: args.args,
        error: error instanceof Error ? error.message : String(error),
        duration,
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown shell execution error',
        duration,
        tool: this.name,
        namespace: 'internal',
      };
    }
  }

  /**
   * Validate command before execution
   */
  private validateCommand(command: string, args: string[] = []): void {
    // Check if command is allowed
    if (!isCommandAllowed(command, this.allowedCommands)) {
      throw new QCodeError(
        `Command '${command}' is not in the allowed commands list`,
        'COMMAND_NOT_ALLOWED',
        {
          command,
          allowedCommands: this.allowedCommands,
        }
      );
    }

    // Check for forbidden patterns
    const fullCommand = args.length > 0 ? `${command} ${args.join(' ')}` : command;
    if (isForbiddenCommand(fullCommand, this.forbiddenPatterns)) {
      throw new QCodeError(
        `Command matches forbidden pattern: '${fullCommand}'`,
        'FORBIDDEN_COMMAND',
        {
          command: fullCommand,
          forbiddenPatterns: this.forbiddenPatterns,
        }
      );
    }

    // Additional validation for potentially dangerous commands
    if (command === 'git' && args.length > 0) {
      // Allow only read-only git commands
      const gitCommand = args[0];
      const readOnlyGitCommands = ['status', 'diff', 'log', 'show', 'branch', 'remote', 'config'];
      if (gitCommand && !readOnlyGitCommands.includes(gitCommand)) {
        throw new QCodeError(
          `Git command '${gitCommand}' is not allowed. Only read-only git commands are permitted.`,
          'FORBIDDEN_GIT_COMMAND',
          { gitCommand, allowedGitCommands: readOnlyGitCommands }
        );
      }
    }
  }

  /**
   * Execute command using direct spawn (bypassing security module's validation since we already validated)
   */
  private async executeCommandSecure(
    command: string,
    args: string[],
    workingDirectory: string,
    timeout: number,
    captureOutput: boolean
  ): Promise<CommandResult> {
    const startTime = Date.now();

    // We already did our validation, so just sanitize args and execute
    const sanitizedArgs = args.map(arg => {
      // Basic validation - reject args with suspicious characters
      if (arg.includes(';') || arg.includes('|') || arg.includes('&')) {
        throw new QCodeError('Argument contains forbidden characters', 'INVALID_ARGUMENT', { arg });
      }
      return arg;
    });

    return new Promise((resolve, reject) => {
      const child = spawn(command, sanitizedArgs, {
        cwd: workingDirectory,
        env: { ...process.env, PATH: process.env.PATH || '' },
        stdio: captureOutput ? ['pipe', 'pipe', 'pipe'] : 'inherit',
      });

      let stdout = '';
      let stderr = '';
      let timeoutHandle: NodeJS.Timeout | null = null;

      // Set up timeout
      if (timeout > 0) {
        timeoutHandle = setTimeout(() => {
          child.kill('SIGTERM');
          reject(
            new QCodeError('Command timed out', 'COMMAND_TIMEOUT', {
              command,
              args: sanitizedArgs,
              timeout,
            })
          );
        }, timeout);
      }

      // Capture output if requested
      if (captureOutput) {
        child.stdout?.on('data', data => {
          stdout += data.toString();
        });

        child.stderr?.on('data', data => {
          stderr += data.toString();
        });
      }

      // Handle process completion
      child.on('close', exitCode => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }

        const duration = Date.now() - startTime;
        const result: CommandResult = {
          stdout,
          stderr,
          exitCode: exitCode || 0,
          command,
          args: sanitizedArgs,
          duration,
        };

        if (exitCode === 0) {
          resolve(result);
        } else {
          reject(new QCodeError('Command failed', 'COMMAND_FAILED', result));
        }
      });

      // Handle process errors
      child.on('error', error => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }

        reject(
          new QCodeError('Failed to execute command', 'COMMAND_EXECUTION_ERROR', {
            command,
            args: sanitizedArgs,
            originalError: error.message,
          })
        );
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
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: workingDirectory,
        env: { ...process.env, PATH: process.env.PATH || '' },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      let timeoutHandle: NodeJS.Timeout | null = null;

      // Set up timeout
      if (timeout > 0) {
        timeoutHandle = setTimeout(() => {
          child.kill('SIGTERM');
          reject(
            new QCodeError('Command timed out', 'COMMAND_TIMEOUT', {
              command,
              args,
              timeout,
            })
          );
        }, timeout);
      }

      // Real-time output streaming with logging
      child.stdout?.on('data', data => {
        const chunk = data.toString();
        stdout += chunk;

        // Stream output to logger for real-time feedback
        logger.info(`[${command}] ${chunk.trim()}`);
      });

      child.stderr?.on('data', data => {
        const chunk = data.toString();
        stderr += chunk;

        // Stream error output to logger
        logger.warn(`[${command}] ${chunk.trim()}`);
      });

      // Handle process completion
      child.on('close', exitCode => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }

        const duration = Date.now() - startTime;
        const result: CommandResult = {
          stdout,
          stderr,
          exitCode: exitCode || 0,
          command,
          args,
          duration,
        };

        if (exitCode === 0) {
          resolve(result);
        } else {
          reject(new QCodeError('Command failed', 'COMMAND_FAILED', result));
        }
      });

      // Handle process errors
      child.on('error', error => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }

        reject(
          new QCodeError('Failed to execute command', 'COMMAND_EXECUTION_ERROR', {
            command,
            args,
            originalError: error.message,
          })
        );
      });
    });
  }

  /**
   * Convert tool to Ollama function format
   */
  toOllamaFormat(): any {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: zodToJsonSchema(this.schema),
      },
    };
  }
}
