import { z } from 'zod';
import path from 'path';
import {
  Config,
  SecurityConfig,
  OllamaConfig,
  MCPServerConfig,
  PartialConfig,
  ValidationResult,
} from '../types.js';

/**
 * Zod schema for workspace security configuration
 */
const WorkspaceSecuritySchema = z.object({
  allowedPaths: z
    .array(z.string().min(1, 'Path cannot be empty'))
    .min(1, 'At least one allowed path required'),
  forbiddenPatterns: z.array(z.string()),
  allowOutsideWorkspace: z.boolean(),
});

/**
 * Zod schema for command security configuration
 */
const CommandSecuritySchema = z.object({
  allowedCommands: z.array(z.string().min(1, 'Command cannot be empty')),
  forbiddenPatterns: z.array(z.string()),
  allowArbitraryCommands: z.boolean(),
});

/**
 * Zod schema for security configuration
 */
const SecurityConfigSchema = z.object({
  workspace: WorkspaceSecuritySchema,
  commands: CommandSecuritySchema,
});

/**
 * Zod schema for Ollama configuration
 */
const OllamaConfigSchema = z.object({
  url: z.string().url('Invalid Ollama URL'),
  model: z.string().min(1, 'Model name cannot be empty'),
  timeout: z
    .number()
    .int()
    .min(1000, 'Timeout must be at least 1000ms')
    .max(300000, 'Timeout cannot exceed 5 minutes'),
  retries: z
    .number()
    .int()
    .min(0, 'Retries must be non-negative')
    .max(10, 'Maximum 10 retries allowed'),
  temperature: z
    .number()
    .min(0, 'Temperature must be non-negative')
    .max(2, 'Temperature cannot exceed 2'),
  stream: z.boolean(),
});

/**
 * Zod schema for logging configuration
 */
const LoggingConfigSchema = z.object({
  level: z.enum(['error', 'warn', 'info', 'debug']),
  console: z.boolean(),
  file: z.string().optional(),
  timestamp: z.boolean(),
  colors: z.boolean(),
});

/**
 * Base MCP server configuration schema without refinement
 */
const BaseMCPServerConfigSchema = z.object({
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  cwd: z.string().optional(),
  env: z.record(z.string(), z.string()).optional(),
  url: z.string().url().optional(),
  apiKey: z.string().optional(),
  timeout: z.number().int().min(1000).max(300000).optional(),
  retries: z.number().int().min(0).max(10).optional(),
});

/**
 * MCP server configuration schema with refinement
 */
const MCPServerConfigSchema = BaseMCPServerConfigSchema.refine(
  data => {
    // Either stdio (command) or http (url) configuration must be present
    const hasStdio = data.command !== undefined;
    const hasHttp = data.url !== undefined;
    return hasStdio || hasHttp;
  },
  {
    message: 'MCP server must have either command (stdio) or url (http) configuration',
  }
);

/**
 * Zod schema for main configuration
 */
const ConfigSchema = z.object({
  security: SecurityConfigSchema,
  ollama: OllamaConfigSchema,
  mcpServers: z.record(z.string(), MCPServerConfigSchema),
  logging: LoggingConfigSchema,
  workingDirectory: z.string().min(1, 'Working directory cannot be empty'),
  configFiles: z.array(z.string()),
});

/**
 * Zod schema for partial configuration (used for merging)
 */
const PartialConfigSchema = z
  .object({
    security: z
      .object({
        workspace: WorkspaceSecuritySchema.partial(),
        commands: CommandSecuritySchema.partial(),
      })
      .partial(),
    ollama: OllamaConfigSchema.partial(),
    mcpServers: z.record(z.string(), BaseMCPServerConfigSchema.partial()),
    logging: LoggingConfigSchema.partial(),
    workingDirectory: z.string().optional(),
  })
  .partial();

/**
 * Validates a complete configuration object
 */
export function validateConfig(config: unknown): ValidationResult<Config> {
  try {
    const validatedConfig = ConfigSchema.parse(config) as Config;

    // Additional custom validations
    const errors = validateConfigPaths(validatedConfig);
    if (errors.length > 0) {
      return {
        success: false,
        error: 'Configuration validation failed',
        details: errors,
      };
    }

    return {
      success: true,
      data: validatedConfig,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: 'Configuration validation failed',
        details: error.errors.map(err => `${err.path.join('.')}: ${err.message}`),
      };
    }

    return {
      success: false,
      error: `Unexpected validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Validates a partial configuration object (for merging)
 */
export function validatePartialConfig(config: unknown): ValidationResult<PartialConfig> {
  try {
    const validatedConfig = PartialConfigSchema.parse(config) as PartialConfig;
    return {
      success: true,
      data: validatedConfig,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: 'Partial configuration validation failed',
        details: error.errors.map(err => `${err.path.join('.')}: ${err.message}`),
      };
    }

    return {
      success: false,
      error: `Unexpected validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Validates security configuration
 */
export function validateSecurityConfig(config: unknown): ValidationResult<SecurityConfig> {
  try {
    const validatedConfig = SecurityConfigSchema.parse(config);
    return {
      success: true,
      data: validatedConfig,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: 'Security configuration validation failed',
        details: error.errors.map(err => `${err.path.join('.')}: ${err.message}`),
      };
    }

    return {
      success: false,
      error: `Unexpected validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Validates Ollama configuration
 */
export function validateOllamaConfig(config: unknown): ValidationResult<OllamaConfig> {
  try {
    const validatedConfig = OllamaConfigSchema.parse(config);
    return {
      success: true,
      data: validatedConfig,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: 'Ollama configuration validation failed',
        details: error.errors.map(err => `${err.path.join('.')}: ${err.message}`),
      };
    }

    return {
      success: false,
      error: `Unexpected validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Validates MCP server configuration
 */
export function validateMCPServerConfig(config: unknown): ValidationResult<MCPServerConfig> {
  try {
    const validatedConfig = MCPServerConfigSchema.parse(config);
    return {
      success: true,
      data: validatedConfig,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: 'MCP server configuration validation failed',
        details: error.errors.map(err => `${err.path.join('.')}: ${err.message}`),
      };
    }

    return {
      success: false,
      error: `Unexpected validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Additional path validation that can't be done with Zod alone
 */
function validateConfigPaths(config: Config): string[] {
  const errors: string[] = [];

  // Validate working directory
  try {
    if (!path.isAbsolute(path.resolve(config.workingDirectory))) {
      errors.push('Working directory must resolve to an absolute path');
    }
  } catch (error) {
    errors.push(
      `Invalid working directory: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }

  // Validate workspace paths
  for (const workspacePath of config.security.workspace.allowedPaths) {
    try {
      const resolved = path.resolve(workspacePath);
      if (!resolved) {
        errors.push(`Invalid workspace path: ${workspacePath}`);
      }
    } catch (error) {
      errors.push(
        `Cannot resolve workspace path ${workspacePath}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // Validate MCP server configurations
  for (const [serverId, serverConfig] of Object.entries(config.mcpServers)) {
    if (serverConfig.cwd) {
      try {
        const resolved = path.resolve(serverConfig.cwd);
        if (!resolved) {
          errors.push(`Invalid working directory for MCP server ${serverId}: ${serverConfig.cwd}`);
        }
      } catch (error) {
        errors.push(
          `Cannot resolve working directory for MCP server ${serverId}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }
  }

  // Validate log file path if specified
  if (config.logging.file) {
    try {
      const logDir = path.dirname(path.resolve(config.logging.file));
      if (!logDir) {
        errors.push(`Invalid log file directory: ${config.logging.file}`);
      }
    } catch (error) {
      errors.push(
        `Cannot resolve log file path: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  return errors;
}

/**
 * Type guard to check if a value is a valid configuration
 */
export function isValidConfig(value: unknown): value is Config {
  const result = validateConfig(value);
  return result.success;
}

/**
 * Transforms and validates unknown input into a Config object
 */
export function parseConfig(input: unknown): Config {
  const result = validateConfig(input);
  if (!result.success) {
    throw new Error(
      `Configuration validation failed: ${result.details?.join(', ') || result.error}`
    );
  }
  return result.data!;
}

/**
 * Export schemas for external use
 */
export {
  ConfigSchema,
  PartialConfigSchema,
  SecurityConfigSchema,
  OllamaConfigSchema,
  LoggingConfigSchema,
  MCPServerConfigSchema,
};
