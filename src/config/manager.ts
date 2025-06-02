import fs from 'fs';
import path from 'path';
import os from 'os';
import { Config, PartialConfig, QCodeError } from '../types.js';
import { getDefaultConfigForWorkspace, getConfigPreset } from './defaults.js';
import { validateConfig, validatePartialConfig } from './validation.js';

/**
 * Configuration file names to search for
 */
const CONFIG_FILE_NAMES = [
  'qcode.config.json',
  'qcode.config.js',
  '.qcoderc',
  '.qcoderc.json',
  '.qcode.json',
];

/**
 * Environment variable prefix for configuration
 */
const ENV_PREFIX = 'QCODE_';

/**
 * Configuration source information
 */
export interface ConfigSource {
  /** The source type */
  type: 'default' | 'global' | 'project' | 'env' | 'cli';
  /** Path to the config file (if applicable) */
  path?: string | undefined;
  /** The configuration data */
  config: PartialConfig;
  /** Priority level (higher = more important) */
  priority: number;
}

/**
 * Configuration loading result
 */
export interface ConfigLoadResult {
  /** The final merged configuration */
  config: Config;
  /** Sources that were loaded and merged */
  sources: ConfigSource[];
  /** Warnings that occurred during loading */
  warnings: string[];
  /** Errors that occurred but didn't prevent loading */
  errors: string[];
}

/**
 * Configuration manager that handles hierarchical configuration loading
 */
export class ConfigManager {
  private workingDirectory: string;
  private cliOverrides?: PartialConfig;

  constructor(workingDirectory: string = process.cwd()) {
    this.workingDirectory = path.resolve(workingDirectory);
  }

  /**
   * Sets CLI overrides for configuration
   */
  setCLIOverrides(overrides: PartialConfig): void {
    this.cliOverrides = overrides;
  }

  /**
   * Loads configuration from all sources in hierarchical order
   */
  async loadConfig(): Promise<ConfigLoadResult> {
    const sources: ConfigSource[] = [];
    const warnings: string[] = [];
    const errors: string[] = [];

    try {
      // 1. Load default configuration
      const defaultConfig = getDefaultConfigForWorkspace(this.workingDirectory);
      sources.push({
        type: 'default',
        config: this.configToPartial(defaultConfig),
        priority: 0,
      });

      // 2. Load global configuration
      const globalConfig = await this.loadGlobalConfig();
      if (globalConfig) {
        sources.push({
          type: 'global',
          path: globalConfig.path,
          config: globalConfig.config,
          priority: 1,
        });
      }

      // 3. Load project configuration
      const projectResult = await this.loadProjectConfigs();
      sources.push(...projectResult.sources);
      warnings.push(...projectResult.warnings);

      // 4. Load environment configuration
      const envConfig = this.loadEnvironmentConfig();
      if (envConfig) {
        sources.push({
          type: 'env',
          config: envConfig,
          priority: 3,
        });
      }

      // 5. Apply CLI overrides
      if (this.cliOverrides) {
        sources.push({
          type: 'cli',
          config: this.cliOverrides,
          priority: 4,
        });
      }

      // Merge all configurations
      const mergedConfig = this.mergeConfigs(sources);

      // Validate the final configuration
      const validationResult = validateConfig(mergedConfig);
      if (!validationResult.success) {
        throw new QCodeError('Configuration validation failed', 'CONFIG_VALIDATION_ERROR', {
          errors: validationResult.details,
          sources: sources.map(s => ({ type: s.type, path: s.path })),
        });
      }

      // Set config file paths that were loaded
      const configFiles = sources
        .filter(s => s.path)
        .map(s => s.path!)
        .filter(p => p);

      const finalConfig: Config = {
        ...validationResult.data!,
        configFiles,
      };

      return {
        config: finalConfig,
        sources,
        warnings,
        errors,
      };
    } catch (error) {
      if (error instanceof QCodeError) {
        throw error;
      }

      throw new QCodeError('Failed to load configuration', 'CONFIG_LOAD_ERROR', {
        originalError: error instanceof Error ? error.message : 'Unknown error',
        workingDirectory: this.workingDirectory,
      });
    }
  }

  /**
   * Discovers configuration files in the project hierarchy
   */
  async discoverConfigFiles(startDir?: string): Promise<string[]> {
    const searchDir = startDir || this.workingDirectory;
    const configFiles: string[] = [];

    let currentDir = path.resolve(searchDir);
    const rootDir = path.parse(currentDir).root;

    // Search up the directory tree
    while (currentDir !== rootDir) {
      for (const fileName of CONFIG_FILE_NAMES) {
        const configPath = path.join(currentDir, fileName);
        if (await this.fileExists(configPath)) {
          configFiles.push(configPath);
        }
      }

      // Stop if we found a config file at this level (closest wins)
      if (configFiles.length > 0) {
        break;
      }

      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) {
        break; // Reached the root
      }
      currentDir = parentDir;
    }

    return configFiles;
  }

  /**
   * Loads configuration from a specific file
   */
  async loadConfigFile(filePath: string): Promise<PartialConfig | null> {
    try {
      if (!(await this.fileExists(filePath))) {
        return null;
      }

      const ext = path.extname(filePath).toLowerCase();
      const content = await fs.promises.readFile(filePath, 'utf-8');

      let parsed: unknown;

      if (ext === '.js') {
        // For .js files, we need to use dynamic import
        // This is more complex and potentially unsafe, so we'll skip for now
        throw new QCodeError(
          'JavaScript config files not yet supported',
          'UNSUPPORTED_CONFIG_FORMAT',
          { filePath }
        );
      } else {
        // Assume JSON format
        try {
          parsed = JSON.parse(content);
        } catch (parseError) {
          throw new QCodeError('Failed to parse config file as JSON', 'CONFIG_PARSE_ERROR', {
            filePath,
            parseError: parseError instanceof Error ? parseError.message : 'Unknown error',
          });
        }
      }

      // Validate the parsed configuration
      const validationResult = validatePartialConfig(parsed);
      if (!validationResult.success) {
        throw new QCodeError('Invalid configuration in file', 'CONFIG_VALIDATION_ERROR', {
          filePath,
          errors: validationResult.details,
        });
      }

      return validationResult.data!;
    } catch (error) {
      if (error instanceof QCodeError) {
        throw error;
      }

      throw new QCodeError('Failed to load config file', 'CONFIG_FILE_ERROR', {
        filePath,
        originalError: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Loads global configuration from user's home directory
   */
  private async loadGlobalConfig(): Promise<{ config: PartialConfig; path: string } | null> {
    const homeDir = os.homedir();
    const globalConfigDir = path.join(homeDir, '.config', 'qcode');

    // Check for global config files
    for (const fileName of CONFIG_FILE_NAMES) {
      const configPath = path.join(globalConfigDir, fileName);
      const config = await this.loadConfigFile(configPath);
      if (config) {
        return { config, path: configPath };
      }
    }

    // Also check directly in home directory
    for (const fileName of CONFIG_FILE_NAMES) {
      const configPath = path.join(homeDir, fileName);
      const config = await this.loadConfigFile(configPath);
      if (config) {
        return { config, path: configPath };
      }
    }

    return null;
  }

  /**
   * Loads project-specific configurations
   */
  private async loadProjectConfigs(): Promise<{ sources: ConfigSource[]; warnings: string[] }> {
    const sources: ConfigSource[] = [];
    const warnings: string[] = [];
    const configFiles = await this.discoverConfigFiles();

    for (let i = 0; i < configFiles.length; i++) {
      const filePath: string = configFiles[i]!;
      try {
        const config = await this.loadConfigFile(filePath);
        if (config) {
          sources.push({
            type: 'project',
            path: filePath,
            config,
            // Closer to working directory = higher priority
            priority: 2 + (configFiles.length - i) * 0.1,
          });
        }
      } catch (error) {
        // Collect warning but continue with other files
        warnings.push(
          `Failed to load config file ${filePath}: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`
        );
      }
    }

    return { sources, warnings };
  }

  /**
   * Loads configuration from environment variables
   */
  private loadEnvironmentConfig(): PartialConfig | null {
    const envConfig: PartialConfig = {};
    let hasValues = false;

    // Helper to set nested property
    const setNestedProperty = (obj: any, path: string[], value: any) => {
      let current = obj;
      for (let i = 0; i < path.length - 1; i++) {
        const key = path[i];
        if (key && !(key in current)) {
          current[key] = {};
        }
        if (key) {
          current = current[key];
        }
      }
      const finalKey = path[path.length - 1];
      if (finalKey) {
        current[finalKey] = value;
        hasValues = true;
      }
    };

    // Helper to parse environment value
    const parseEnvValue = (value: string): any => {
      // Try to parse as JSON first
      try {
        return JSON.parse(value);
      } catch {
        // If not JSON, try boolean and numbers
        if (value.toLowerCase() === 'true') return true;
        if (value.toLowerCase() === 'false') return false;
        const num = Number(value);
        if (!isNaN(num)) return num;
        // Otherwise return as string
        return value;
      }
    };

    // Map environment variables to config properties
    const envMappings: Record<string, string[]> = {
      [`${ENV_PREFIX}OLLAMA_URL`]: ['ollama', 'url'],
      [`${ENV_PREFIX}OLLAMA_MODEL`]: ['ollama', 'model'],
      [`${ENV_PREFIX}OLLAMA_TIMEOUT`]: ['ollama', 'timeout'],
      [`${ENV_PREFIX}OLLAMA_RETRIES`]: ['ollama', 'retries'],
      [`${ENV_PREFIX}OLLAMA_TEMPERATURE`]: ['ollama', 'temperature'],
      [`${ENV_PREFIX}OLLAMA_STREAM`]: ['ollama', 'stream'],
      [`${ENV_PREFIX}LOG_LEVEL`]: ['logging', 'level'],
      [`${ENV_PREFIX}LOG_CONSOLE`]: ['logging', 'console'],
      [`${ENV_PREFIX}LOG_FILE`]: ['logging', 'file'],
      [`${ENV_PREFIX}LOG_TIMESTAMP`]: ['logging', 'timestamp'],
      [`${ENV_PREFIX}LOG_COLORS`]: ['logging', 'colors'],
      [`${ENV_PREFIX}WORKING_DIRECTORY`]: ['workingDirectory'],
      [`${ENV_PREFIX}SECURITY_ALLOW_OUTSIDE_WORKSPACE`]: [
        'security',
        'workspace',
        'allowOutsideWorkspace',
      ],
      [`${ENV_PREFIX}SECURITY_ALLOW_ARBITRARY_COMMANDS`]: [
        'security',
        'commands',
        'allowArbitraryCommands',
      ],
    };

    // Process environment variables
    for (const [envVar, configPath] of Object.entries(envMappings)) {
      const value = process.env[envVar];
      if (value !== undefined) {
        setNestedProperty(envConfig, configPath, parseEnvValue(value));
      }
    }

    // Check for preset environment variable
    const preset = process.env[`${ENV_PREFIX}PRESET`];
    if (preset) {
      const presetConfig = getConfigPreset(preset);
      if (presetConfig) {
        // Merge preset config with env config (env config takes precedence)
        const merged = this.mergePartialConfigs([presetConfig, envConfig]);
        return merged;
      }
    }

    return hasValues ? envConfig : null;
  }

  /**
   * Merges multiple configurations in priority order
   */
  private mergeConfigs(sources: ConfigSource[]): Config {
    // Sort sources by priority (lowest to highest)
    const sortedSources = [...sources].sort((a, b) => a.priority - b.priority);

    // Start with a default config
    let merged = getDefaultConfigForWorkspace(this.workingDirectory);

    // Apply each source in order
    for (const source of sortedSources) {
      if (source.type === 'default') {
        // Default is already our base
        continue;
      }
      merged = this.mergeIntoConfig(merged, source.config);
    }

    return merged;
  }

  /**
   * Merges a partial config into a full config
   */
  private mergeIntoConfig(target: Config, source: PartialConfig): Config {
    const result: Config = { ...target };

    if (source.security) {
      result.security = {
        workspace: {
          ...result.security.workspace,
          ...(source.security.workspace && {
            ...(source.security.workspace.allowedPaths !== undefined && {
              allowedPaths: source.security.workspace.allowedPaths,
            }),
            ...(source.security.workspace.forbiddenPatterns !== undefined && {
              forbiddenPatterns: source.security.workspace.forbiddenPatterns,
            }),
            ...(source.security.workspace.allowOutsideWorkspace !== undefined && {
              allowOutsideWorkspace: source.security.workspace.allowOutsideWorkspace,
            }),
          }),
        },
        commands: {
          ...result.security.commands,
          ...(source.security.commands && {
            ...(source.security.commands.allowedCommands !== undefined && {
              allowedCommands: source.security.commands.allowedCommands,
            }),
            ...(source.security.commands.forbiddenPatterns !== undefined && {
              forbiddenPatterns: source.security.commands.forbiddenPatterns,
            }),
            ...(source.security.commands.allowArbitraryCommands !== undefined && {
              allowArbitraryCommands: source.security.commands.allowArbitraryCommands,
            }),
          }),
        },
      };
    }

    if (source.ollama) {
      result.ollama = {
        ...result.ollama,
        ...(source.ollama.url !== undefined && { url: source.ollama.url }),
        ...(source.ollama.model !== undefined && { model: source.ollama.model }),
        ...(source.ollama.timeout !== undefined && { timeout: source.ollama.timeout }),
        ...(source.ollama.retries !== undefined && { retries: source.ollama.retries }),
        ...(source.ollama.temperature !== undefined && { temperature: source.ollama.temperature }),
        ...(source.ollama.stream !== undefined && { stream: source.ollama.stream }),
      };
    }

    if (source.mcpServers) {
      result.mcpServers = {
        ...result.mcpServers,
        ...source.mcpServers,
      };
    }

    if (source.logging) {
      result.logging = {
        ...result.logging,
        ...(source.logging.level !== undefined && { level: source.logging.level }),
        ...(source.logging.console !== undefined && { console: source.logging.console }),
        ...(source.logging.file !== undefined && { file: source.logging.file }),
        ...(source.logging.timestamp !== undefined && { timestamp: source.logging.timestamp }),
        ...(source.logging.colors !== undefined && { colors: source.logging.colors }),
      };
    }

    if (source.workingDirectory !== undefined) {
      result.workingDirectory = source.workingDirectory;
    }

    return result;
  }

  /**
   * Merges multiple partial configurations
   */
  private mergePartialConfigs(sources: PartialConfig[]): PartialConfig {
    const result: PartialConfig = {};

    for (const source of sources) {
      if (source.security) {
        if (!result.security) result.security = {};
        if (source.security.workspace) {
          if (!result.security.workspace) result.security.workspace = {};
          Object.assign(result.security.workspace, source.security.workspace);
        }
        if (source.security.commands) {
          if (!result.security.commands) result.security.commands = {};
          Object.assign(result.security.commands, source.security.commands);
        }
      }

      if (source.ollama) {
        if (!result.ollama) result.ollama = {};
        Object.assign(result.ollama, source.ollama);
      }

      if (source.mcpServers) {
        if (!result.mcpServers) result.mcpServers = {};
        Object.assign(result.mcpServers, source.mcpServers);
      }

      if (source.logging) {
        if (!result.logging) result.logging = {};
        Object.assign(result.logging, source.logging);
      }

      if (source.workingDirectory !== undefined) {
        result.workingDirectory = source.workingDirectory;
      }
    }

    return result;
  }

  /**
   * Converts a full config to a partial config
   */
  private configToPartial(config: Config): PartialConfig {
    return {
      security: config.security,
      ollama: config.ollama,
      mcpServers: config.mcpServers,
      logging: config.logging,
      workingDirectory: config.workingDirectory,
    };
  }

  /**
   * Checks if a file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.promises.access(filePath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Creates a new configuration manager
 */
export function createConfigManager(workingDirectory?: string): ConfigManager {
  return new ConfigManager(workingDirectory);
}

/**
 * Loads configuration using the default manager
 */
export async function loadConfig(workingDirectory?: string): Promise<ConfigLoadResult> {
  const manager = createConfigManager(workingDirectory);
  return await manager.loadConfig();
}

/**
 * Loads configuration with CLI overrides
 */
export async function loadConfigWithOverrides(
  workingDirectory?: string,
  cliOverrides?: PartialConfig
): Promise<ConfigLoadResult> {
  const manager = createConfigManager(workingDirectory);
  if (cliOverrides) {
    manager.setCLIOverrides(cliOverrides);
  }
  return await manager.loadConfig();
}
