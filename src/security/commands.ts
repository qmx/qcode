import { QCodeError } from '../types.js';
import shellEscape from 'shell-escape';
import { execa } from 'execa';

/**
 * Default allowed commands for basic operations
 */
export const DEFAULT_ALLOWED_COMMANDS = [
  'git',
  'npm',
  'yarn',
  'pnpm',
  'node',
  'python',
  'python3',
  'pip',
  'ls',
  'dir',
  'cat',
  'head',
  'tail',
  'grep',
  'find',
  'which',
  'where',
  'echo',
  'pwd',
  'cd',
];

/**
 * Commands that should never be allowed regardless of configuration
 */
const FORBIDDEN_COMMANDS = [
  'rm',
  'del',
  'format',
  'fdisk',
  'sudo',
  'su',
  'passwd',
  'chmod',
  'chown',
  'kill',
  'killall',
  'pkill',
  'halt',
  'reboot',
  'shutdown',
  'poweroff',
  'mkfs',
  'dd',
  'eval',
  'exec',
  'source',
  '.',
];

/**
 * Validates that a command is safe to execute
 */
export function validateCommand(
  command: string,
  allowedCommands: string[] = DEFAULT_ALLOWED_COMMANDS
): void {
  if (!command || typeof command !== 'string') {
    throw new QCodeError('Command must be a non-empty string', 'INVALID_COMMAND', { command });
  }

  const trimmedCommand = command.trim();
  if (!trimmedCommand) {
    throw new QCodeError('Command cannot be empty', 'EMPTY_COMMAND', { command });
  }

  // Extract the base command (first word)
  const commandParts = trimmedCommand.split(/\s+/);
  const baseCommand = commandParts[0];

  if (!baseCommand) {
    throw new QCodeError('Could not extract base command', 'INVALID_COMMAND', {
      command: trimmedCommand,
    });
  }

  // Check against forbidden commands
  if (FORBIDDEN_COMMANDS.includes(baseCommand.toLowerCase())) {
    throw new QCodeError(
      `Command '${baseCommand}' is forbidden for security reasons`,
      'FORBIDDEN_COMMAND',
      { command: baseCommand, fullCommand: command }
    );
  }

  // Check if command is in allowed list
  if (!allowedCommands.includes(baseCommand)) {
    throw new QCodeError(
      `Command '${baseCommand}' is not in the allowed commands list`,
      'COMMAND_NOT_ALLOWED',
      { command: baseCommand, allowedCommands }
    );
  }
}

/**
 * Validates command arguments - no manual pattern matching needed with proper execution
 */
export function sanitizeArgs(args: string[]): string[] {
  return args.map(arg => {
    if (typeof arg !== 'string') {
      throw new QCodeError('All arguments must be strings', 'INVALID_ARGUMENT', {
        arg,
        type: typeof arg,
      });
    }

    // Just validate they are strings - shell-escape will handle the rest
    return arg;
  });
}

/**
 * Validates a complete command with arguments
 */
export function validateCommandWithArgs(
  command: string,
  args: string[] = [],
  allowedCommands: string[] = DEFAULT_ALLOWED_COMMANDS
): { command: string; args: string[] } {
  validateCommand(command, allowedCommands);
  const sanitizedArgs = sanitizeArgs(args);

  return {
    command: command.trim(),
    args: sanitizedArgs,
  };
}

/**
 * Checks if a command requires elevated privileges
 */
export function requiresElevatedPrivileges(command: string): boolean {
  const elevatedCommands = [
    'sudo',
    'su',
    'runas',
    'chmod',
    'chown',
    'mount',
    'umount',
    'systemctl',
    'service',
  ];

  const commandParts = command.trim().split(/\s+/);
  const baseCommand = commandParts[0];

  if (!baseCommand) {
    return false;
  }

  return elevatedCommands.includes(baseCommand.toLowerCase());
}

/**
 * Builds a safe command string using shell-escape for proper escaping
 */
export function buildSafeCommand(command: string, args: string[] = []): string {
  const validated = validateCommandWithArgs(command, args);

  // Use shell-escape for proper argument escaping
  return shellEscape([validated.command, ...validated.args]);
}

/**
 * Safely executes a command using execa for better security
 */
export async function executeCommand(
  command: string,
  args: string[] = [],
  options: {
    cwd?: string;
    env?: Record<string, string>;
    timeout?: number;
    allowedCommands?: string[];
  } = {}
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const { cwd, env, timeout = 30000, allowedCommands } = options;

  // Validate the command first
  const validated = validateCommandWithArgs(command, args, allowedCommands);

  // Validate environment variables if provided
  const validatedEnv = env ? validateEnvironmentVariables(env) : undefined;

  try {
    // Build options object without undefined values
    const execaOptions: Record<string, any> = {
      timeout,
      reject: false, // Don't throw on non-zero exit codes
    };

    if (cwd) {
      execaOptions.cwd = cwd;
    }

    if (validatedEnv) {
      execaOptions.env = validatedEnv;
    }

    // Use execa for safer command execution
    const result = await execa(validated.command, validated.args, execaOptions);

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new QCodeError(
        `Command execution failed: ${error.message}`,
        'COMMAND_EXECUTION_ERROR',
        { command: validated.command, args: validated.args, originalError: error }
      );
    }
    throw error;
  }
}

/**
 * Validates environment variables for command execution
 */
export function validateEnvironmentVariables(env: Record<string, string>): Record<string, string> {
  const validated: Record<string, string> = {};

  for (const [key, value] of Object.entries(env)) {
    // Validate environment variable names
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
      throw new QCodeError('Invalid environment variable name', 'INVALID_ENV_VAR', { key, value });
    }

    // Check for dangerous patterns in values
    if (typeof value !== 'string') {
      throw new QCodeError('Environment variable values must be strings', 'INVALID_ENV_VALUE', {
        key,
        value,
        type: typeof value,
      });
    }

    validated[key] = value;
  }

  return validated;
}
