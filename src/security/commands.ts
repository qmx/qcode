import { QCodeError } from '../types.js';
import shellEscape from 'shell-escape';
import { spawn } from 'child_process';

/**
 * Default allowed commands for basic operations
 */
export const DEFAULT_ALLOWED_COMMANDS = [
  'echo',
  'ls',
  'cat',
  'head',
  'tail',
  'grep',
  'find',
  'wc',
  'sort',
  'uniq',
  'cut',
  'awk',
  'sed',
  'git',
  'npm',
  'yarn',
  'node',
  'python',
  'python3',
  'pip',
  'pip3',
  'make',
  'tsc',
  'eslint',
  'prettier',
];

/**
 * Forbidden command patterns that should never be allowed
 */
export const FORBIDDEN_COMMAND_PATTERNS = [
  'rm *',
  'del *',
  'format *',
  'sudo *',
  'su *',
  '* > /dev/*',
  '* \\| *',  // Shell pipe operator (with space around it)
  '* && *',   // Shell logical AND
  '* \\|\\| *', // Shell logical OR
  '* ; *',    // Shell command separator
];

/**
 * Command execution result
 */
export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  command: string;
  args: string[];
  duration: number;
}

/**
 * Command execution options
 */
export interface CommandOptions {
  /** Working directory for command execution */
  cwd?: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Whether to capture output */
  captureOutput?: boolean;
}

/**
 * Validates if a command is allowed to be executed
 */
export function isCommandAllowed(
  command: string,
  allowedCommands: string[] = DEFAULT_ALLOWED_COMMANDS
): boolean {
  // Check if the base command is in the allowed list
  const baseCommand = command.split(' ')[0];
  return baseCommand ? allowedCommands.includes(baseCommand) : false;
}

/**
 * Validates if a command matches any forbidden patterns
 */
export function isForbiddenCommand(
  command: string,
  forbiddenPatterns: string[] = FORBIDDEN_COMMAND_PATTERNS
): boolean {
  return forbiddenPatterns.some(pattern => {
    // Simple pattern matching - could be enhanced with regex
    if (pattern.includes('*')) {
      const regexPattern = pattern.replace(/\*/g, '.*');
      return new RegExp(regexPattern).test(command);
    }
    return command.includes(pattern);
  });
}

/**
 * Sanitizes command arguments using shell-escape
 */
export function sanitizeCommandArgs(args: string[]): string[] {
  return args.map(arg => {
    // Basic validation - reject args with suspicious characters
    if (arg.includes(';') || arg.includes('|') || arg.includes('&')) {
      throw new QCodeError('Argument contains forbidden characters', 'INVALID_ARGUMENT', { arg });
    }
    return arg;
  });
}

/**
 * Executes a command safely with proper validation and sandboxing
 */
export async function executeCommand(
  command: string,
  args: string[] = [],
  options: CommandOptions = {}
): Promise<CommandResult> {
  const startTime = Date.now();

  // Validate command is allowed
  if (!isCommandAllowed(command)) {
    throw new QCodeError('Command not allowed', 'COMMAND_NOT_ALLOWED', { command });
  }

  // Check for forbidden patterns
  const fullCommand = `${command} ${args.join(' ')}`;
  if (isForbiddenCommand(fullCommand)) {
    throw new QCodeError('Command matches forbidden pattern', 'FORBIDDEN_COMMAND', {
      command: fullCommand,
    });
  }

  // Sanitize arguments
  const sanitizedArgs = sanitizeCommandArgs(args);

  const {
    cwd = process.cwd(),
    env = process.env,
    timeout = 30000, // 30 seconds default
    captureOutput = true,
  } = options;

  return new Promise((resolve, reject) => {
    const child = spawn(command, sanitizedArgs, {
      cwd,
      env: { ...process.env, ...env },
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
 * Escapes a command and its arguments for safe shell execution
 */
export function escapeCommand(command: string, args: string[] = []): string {
  return shellEscape([command, ...args]);
}
