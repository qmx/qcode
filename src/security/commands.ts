import { QCodeError } from '../types.js';

/**
 * List of potentially dangerous command patterns
 */
const DANGEROUS_PATTERNS = [
  // Command injection patterns
  /[;&|`$(){}[\]]/,
  /\|\|/,
  /&&/,
  // Redirection patterns
  /[<>]/,
  // Process substitution
  /\$\(/,
  // Command substitution
  /`/,
  // Variable expansion
  /\$[{]/,
];

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
export function validateCommand(command: string, allowedCommands: string[] = DEFAULT_ALLOWED_COMMANDS): void {
  if (!command || typeof command !== 'string') {
    throw new QCodeError(
      'Command must be a non-empty string',
      'INVALID_COMMAND',
      { command }
    );
  }

  const trimmedCommand = command.trim();
  if (!trimmedCommand) {
    throw new QCodeError(
      'Command cannot be empty',
      'EMPTY_COMMAND',
      { command }
    );
  }

  // Extract the base command (first word)
  const commandParts = trimmedCommand.split(/\s+/);
  const baseCommand = commandParts[0];
  
  if (!baseCommand) {
    throw new QCodeError(
      'Could not extract base command',
      'INVALID_COMMAND',
      { command: trimmedCommand }
    );
  }

  // Check against forbidden commands
  if (FORBIDDEN_COMMANDS.includes(baseCommand.toLowerCase())) {
    throw new QCodeError(
      `Command '${baseCommand}' is forbidden for security reasons`,
      'FORBIDDEN_COMMAND',
      { command: baseCommand, fullCommand: command }
    );
  }

  // Check against dangerous patterns
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      throw new QCodeError(
        'Command contains potentially dangerous patterns',
        'DANGEROUS_COMMAND',
        { command, pattern: pattern.source }
      );
    }
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
 * Sanitizes command arguments to prevent injection
 */
export function sanitizeArgs(args: string[]): string[] {
  return args.map((arg) => {
    if (typeof arg !== 'string') {
      throw new QCodeError(
        'All arguments must be strings',
        'INVALID_ARGUMENT',
        { arg, type: typeof arg }
      );
    }

    // Check for dangerous patterns in arguments
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(arg)) {
        throw new QCodeError(
          'Argument contains potentially dangerous patterns',
          'DANGEROUS_ARGUMENT',
          { arg, pattern: pattern.source }
        );
      }
    }

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
 * Builds a safe command string for execution
 */
export function buildSafeCommand(command: string, args: string[] = []): string {
  const validated = validateCommandWithArgs(command, args);
  
  // Escape arguments to prevent shell interpretation
  const escapedArgs = validated.args.map(arg => {
    // Simple escaping - wrap in quotes if contains spaces or special chars
    if (/[\s"'\\$`]/.test(arg)) {
      return `"${arg.replace(/["\\]/g, '\\$&')}"`;
    }
    return arg;
  });

  return [validated.command, ...escapedArgs].join(' ');
}

/**
 * Validates environment variables for command execution
 */
export function validateEnvironmentVariables(env: Record<string, string>): Record<string, string> {
  const validated: Record<string, string> = {};

  for (const [key, value] of Object.entries(env)) {
    // Validate environment variable names
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
      throw new QCodeError(
        'Invalid environment variable name',
        'INVALID_ENV_VAR',
        { key, value }
      );
    }

    // Check for dangerous patterns in values
    if (typeof value !== 'string') {
      throw new QCodeError(
        'Environment variable values must be strings',
        'INVALID_ENV_VALUE',
        { key, value, type: typeof value }
      );
    }

    // Check for injection attempts in values
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(value)) {
        throw new QCodeError(
          'Environment variable value contains dangerous patterns',
          'DANGEROUS_ENV_VALUE',
          { key, value, pattern: pattern.source }
        );
      }
    }

    validated[key] = value;
  }

  return validated;
} 