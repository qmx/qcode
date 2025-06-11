import path from 'path';
import { Config, SecurityConfig, OllamaConfig, LoggingConfig, PartialConfig } from '../types.js';

/**
 * Default security configuration - paths will be resolved relative to working directory
 */
export const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  workspace: {
    allowedPaths: ['.'], // Current directory relative to working directory
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
  permissions: {
    allow: [
      // Very restrictive defaults - users must explicitly configure what they need
      'Shell(echo *)',
      'Shell(ls *)',
      
      // Future permissions (placeholders - not implemented yet)
      // 'Read(*.md)',
      // 'Edit(docs/**)',
      // 'MCP(server, tool)',
    ],
    deny: [
      // Deny everything dangerous - this is the security boundary
      'Shell(rm *)',
      'Shell(del *)',
      'Shell(format *)',
      'Shell(sudo *)',
      'Shell(su *)',
      'Shell(* > /dev/*)',
      'Shell(* | *)',
      'Shell(* && *)',
      'Shell(* || *)',
      'Shell(* ; *)',
      'Shell(* > *)',
      'Shell(* < *)',
      'Shell(chmod *)',
      'Shell(chown *)',
      'Shell(kill *)',
      'Shell(killall *)',
      'Shell(curl *)',
      'Shell(wget *)',
      'Shell(ssh *)',
      'Shell(scp *)',
      'Shell(rsync *)',
    ],
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
 * Default application configuration - working directory must be provided separately
 */
export const DEFAULT_CONFIG: Config = {
  security: DEFAULT_SECURITY_CONFIG,
  ollama: DEFAULT_OLLAMA_CONFIG,
  mcpServers: {},
  logging: DEFAULT_LOGGING_CONFIG,
  workingDirectory: '', // Will be set explicitly by the caller
  configFiles: [],
};

/**
 * Gets the default configuration with specified working directory
 */
export function getDefaultConfig(workingDirectory?: string): Config {
  const resolvedWorkingDirectory = workingDirectory || process.cwd();

  return {
    ...DEFAULT_CONFIG,
    workingDirectory: resolvedWorkingDirectory,
    security: {
      ...DEFAULT_SECURITY_CONFIG,
      workspace: {
        ...DEFAULT_SECURITY_CONFIG.workspace,
        allowedPaths: ['.'], // Relative to working directory
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
        allowedPaths: ['.'], // Current directory relative to workspace
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
      permissions: {
        // More permissive in development for typical development workflows
        allow: [
          'Shell(echo *)',
          'Shell(ls *)',
          'Shell(cat *)',
          'Shell(node *)',
          'Shell(npm *)',
          'Shell(yarn *)',
          'Shell(pnpm *)',
          'Shell(git status)',
          'Shell(git diff*)',
          'Shell(git log*)',
          'Shell(git add*)',
          'Shell(git commit*)',
          'Shell(python *)',
          'Shell(pip *)',
          'Shell(poetry *)',
          'Shell(cargo *)',
          'Shell(make *)',
          'Shell(cmake *)',
        ],
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
      permissions: {
        // Very restrictive in production
        allow: [
          'Shell(echo *)',
          'Shell(ls *)',
        ],
        deny: [
          'Shell(*)',  // Deny everything else
        ],
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
