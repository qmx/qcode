import path from 'path';
import { Config, SecurityConfig, OllamaConfig, LoggingConfig, PartialConfig } from '../types.js';
import { DEFAULT_ALLOWED_COMMANDS } from '../security/commands.js';

/**
 * Default security configuration
 */
export const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  workspace: {
    allowedPaths: [process.cwd()],
    forbiddenPatterns: [
      '**/node_modules/**',
      '**/.git/**',
      '**/.*',
      '**/*.log',
      '**/temp/**',
      '**/tmp/**',
      '**/.env*',
      '**/secrets/**',
      '**/private/**',
      '**/*.key',
      '**/*.pem',
      '**/*.p12',
      '**/*.pfx',
    ],
    allowOutsideWorkspace: false,
  },
  commands: {
    allowedCommands: [...DEFAULT_ALLOWED_COMMANDS],
    forbiddenPatterns: [
      'rm *',
      'del *',
      'format *',
      'sudo *',
      'su *',
      '* > /dev/*',
      '* | *',
      '* && *',
      '* || *',
      '* ; *',
    ],
    allowArbitraryCommands: false,
  },
};

/**
 * Default Ollama configuration
 */
export const DEFAULT_OLLAMA_CONFIG: OllamaConfig = {
  url: 'http://localhost:11434',
  model: 'llama3.1:8b',
  timeout: 30000, // 30 seconds
  retries: 3,
  temperature: 0.1,
  stream: true,
};

/**
 * Default logging configuration
 */
export const DEFAULT_LOGGING_CONFIG: LoggingConfig = {
  level: 'info',
  console: true,
  timestamp: true,
  colors: true,
};

/**
 * Default application configuration
 */
export const DEFAULT_CONFIG: Config = {
  security: DEFAULT_SECURITY_CONFIG,
  ollama: DEFAULT_OLLAMA_CONFIG,
  mcpServers: {},
  logging: DEFAULT_LOGGING_CONFIG,
  workingDirectory: process.cwd(),
  configFiles: [],
};

/**
 * Gets the default configuration with current working directory
 */
export function getDefaultConfig(): Config {
  return {
    ...DEFAULT_CONFIG,
    workingDirectory: process.cwd(),
    security: {
      ...DEFAULT_SECURITY_CONFIG,
      workspace: {
        ...DEFAULT_SECURITY_CONFIG.workspace,
        allowedPaths: [process.cwd()],
      },
    },
  };
}

/**
 * Gets default configuration for a specific workspace
 */
export function getDefaultConfigForWorkspace(workspacePath: string): Config {
  const resolvedWorkspace = path.resolve(workspacePath);

  return {
    ...DEFAULT_CONFIG,
    workingDirectory: resolvedWorkspace,
    security: {
      ...DEFAULT_SECURITY_CONFIG,
      workspace: {
        ...DEFAULT_SECURITY_CONFIG.workspace,
        allowedPaths: [resolvedWorkspace],
      },
    },
  };
}

/**
 * Configuration presets for different environments
 */
export const CONFIG_PRESETS: Record<string, PartialConfig> = {
  development: {
    security: {
      workspace: {
        allowOutsideWorkspace: true,
      },
      commands: {
        allowArbitraryCommands: false, // Still keep some restrictions
      },
    },
    logging: {
      level: 'debug',
    },
  },

  production: {
    security: {
      workspace: {
        allowOutsideWorkspace: false,
      },
      commands: {
        allowArbitraryCommands: false,
      },
    },
    logging: {
      level: 'warn',
      colors: false,
    },
  },

  testing: {
    security: {
      workspace: {
        allowedPaths: [path.join(process.cwd(), 'test')],
        allowOutsideWorkspace: false,
      },
    },
    logging: {
      level: 'error',
      console: false,
    },
  },
};

/**
 * Gets configuration preset by name
 */
export function getConfigPreset(preset: string): PartialConfig | undefined {
  return CONFIG_PRESETS[preset];
}

/**
 * Validates that required directories exist for configuration
 */
export function validateConfigDirectories(config: Config): string[] {
  const errors: string[] = [];

  // Check workspace paths
  for (const workspacePath of config.security.workspace.allowedPaths) {
    try {
      const resolved = path.resolve(workspacePath);
      // Note: We don't check if they exist here, just if they can be resolved
      if (!resolved) {
        errors.push(`Invalid workspace path: ${workspacePath}`);
      }
    } catch (error) {
      errors.push(
        `Cannot resolve workspace path ${workspacePath}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  return errors;
}
