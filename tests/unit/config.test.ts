/**
 * Unit tests for configuration system
 * Tests our configuration loading, merging, and validation logic
 */

import {
  getDefaultConfig,
  getDefaultConfigForWorkspace,
  getConfigPreset,
} from '../../src/config/defaults';
import { ConfigManager } from '../../src/config/manager';
import { validateConfig } from '../../src/config/validation';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

describe('Configuration System', () => {
  describe('Default Configuration', () => {
    it('should use llama3.1:8b as default model', () => {
      const config = getDefaultConfig();
      expect(config.ollama.model).toBe('llama3.1:8b');
    });

    it('should have sensible default values', () => {
      const config = getDefaultConfig();

      // Ollama defaults
      expect(config.ollama.url).toBe('http://localhost:11434');
      expect(config.ollama.timeout).toBe(30000);
      expect(config.ollama.retries).toBe(3);
      expect(config.ollama.temperature).toBe(0.1);
      expect(config.ollama.stream).toBe(true);

      // Security defaults
      expect(config.security.workspace.allowOutsideWorkspace).toBe(false);
      expect(config.security.commands.allowArbitraryCommands).toBe(false);
      expect(config.security.workspace.forbiddenPatterns).toContain('**/.env*');
      expect(config.security.workspace.forbiddenPatterns).toContain('**/.git/**');

      // Logging defaults
      expect(config.logging.level).toBe('info');
      expect(config.logging.console).toBe(true);
      expect(config.logging.timestamp).toBe(true);
      expect(config.logging.colors).toBe(true);
    });

    it('should include current working directory in allowed paths', () => {
      const config = getDefaultConfig();
      expect(config.security.workspace.allowedPaths).toContain(process.cwd());
      expect(config.workingDirectory).toBe(process.cwd());
    });

    it('should create workspace-specific configuration', () => {
      const testWorkspace = '/test/workspace';
      const config = getDefaultConfigForWorkspace(testWorkspace);

      expect(config.workingDirectory).toBe(path.resolve(testWorkspace));
      expect(config.security.workspace.allowedPaths).toContain(path.resolve(testWorkspace));
    });
  });

  describe('Configuration Presets', () => {
    it('should provide development preset', () => {
      const preset = getConfigPreset('development');
      expect(preset).toBeDefined();
      expect(preset?.security?.workspace?.allowOutsideWorkspace).toBe(true);
      expect(preset?.logging?.level).toBe('debug');
    });

    it('should provide production preset', () => {
      const preset = getConfigPreset('production');
      expect(preset).toBeDefined();
      expect(preset?.security?.workspace?.allowOutsideWorkspace).toBe(false);
      expect(preset?.security?.commands?.allowArbitraryCommands).toBe(false);
      expect(preset?.logging?.level).toBe('warn');
      expect(preset?.logging?.colors).toBe(false);
    });

    it('should provide testing preset', () => {
      const preset = getConfigPreset('testing');
      expect(preset).toBeDefined();
      expect(preset?.logging?.level).toBe('error');
      expect(preset?.logging?.console).toBe(false);
    });

    it('should return undefined for unknown preset', () => {
      const preset = getConfigPreset('unknown-preset');
      expect(preset).toBeUndefined();
    });
  });

  describe('Configuration Validation', () => {
    it('should validate correct configuration', () => {
      const config = getDefaultConfig();
      const result = validateConfig(config);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(config);
      expect(result.error).toBeUndefined();
    });

    it('should reject invalid Ollama URL', () => {
      const config = {
        ...getDefaultConfig(),
        ollama: {
          ...getDefaultConfig().ollama,
          url: 'not-a-url',
        },
      };

      const result = validateConfig(config);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject negative timeout', () => {
      const config = {
        ...getDefaultConfig(),
        ollama: {
          ...getDefaultConfig().ollama,
          timeout: -1000,
        },
      };

      const result = validateConfig(config);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject invalid log level', () => {
      const config = {
        ...getDefaultConfig(),
        logging: {
          ...getDefaultConfig().logging,
          level: 'invalid' as any,
        },
      };

      const result = validateConfig(config);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('ConfigManager Integration', () => {
    let tempDir: string;
    let manager: ConfigManager;

    beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'qcode-config-test-'));
      manager = new ConfigManager(tempDir);
    });

    afterEach(async () => {
      await fs.rmdir(tempDir, { recursive: true });
    });

    it('should load default configuration when no files exist', async () => {
      const result = await manager.loadConfig();
      const config = result.config;

      expect(config.ollama.model).toBe('llama3.1:8b');
      expect(config.workingDirectory).toBe(tempDir);
      expect(config.security.workspace.allowedPaths).toContain(tempDir);
    });

    it('should merge project configuration with defaults', async () => {
      const projectConfig = {
        ollama: {
          model: 'custom-model:latest',
          temperature: 0.5,
        },
        logging: {
          level: 'debug' as const,
        },
      };

      const configPath = path.join(tempDir, 'qcode.config.json');
      await fs.writeFile(configPath, JSON.stringify(projectConfig, null, 2));

      const result = await manager.loadConfig();
      const config = result.config;

      // Should merge with defaults
      expect(config.ollama.model).toBe('custom-model:latest');
      expect(config.ollama.temperature).toBe(0.5);
      expect(config.ollama.url).toBe('http://localhost:11434'); // From defaults
      expect(config.logging.level).toBe('debug');
      expect(config.logging.console).toBe(true); // From defaults
    });

    it('should handle invalid JSON configuration gracefully', async () => {
      const configPath = path.join(tempDir, 'qcode.config.json');
      await fs.writeFile(configPath, '{ invalid json }');

      const result = await manager.loadConfig();

      // Should get warnings about invalid JSON but still load defaults
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('Failed to parse config file as JSON');
      expect(result.config.ollama.model).toBe('llama3.1:8b'); // Should fall back to defaults
    });

    it('should respect environment variable overrides', async () => {
      const originalEnv = process.env.QCODE_OLLAMA_MODEL;
      process.env.QCODE_OLLAMA_MODEL = 'env-model:latest';

      try {
        const result = await manager.loadConfig();
        const config = result.config;
        expect(config.ollama.model).toBe('env-model:latest');
      } finally {
        if (originalEnv !== undefined) {
          process.env.QCODE_OLLAMA_MODEL = originalEnv;
        } else {
          delete process.env.QCODE_OLLAMA_MODEL;
        }
      }
    });

    it('should handle configuration file discovery', async () => {
      // Test different config file names
      const configs = ['qcode.config.json', '.qcoderc.json', '.qcode.json'];

      for (const configName of configs) {
        const testDir = path.join(tempDir, configName.replace('.', '-'));
        await fs.mkdir(testDir, { recursive: true });

        const projectConfig = {
          ollama: { model: `model-for-${configName}` },
        };

        const configPath = path.join(testDir, configName);
        await fs.writeFile(configPath, JSON.stringify(projectConfig, null, 2));

        const testManager = new ConfigManager(testDir);
        const result = await testManager.loadConfig();
        const config = result.config;
        expect(config.ollama.model).toBe(`model-for-${configName}`);
      }
    });
  });

  describe('Configuration Precedence', () => {
    let tempDir: string;
    let manager: ConfigManager;

    beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'qcode-precedence-test-'));
      manager = new ConfigManager(tempDir);
    });

    afterEach(async () => {
      await fs.rmdir(tempDir, { recursive: true });
    });

    it('should follow correct precedence order: env > project > defaults', async () => {
      // Set up project config
      const projectConfig = {
        ollama: {
          model: 'project-model:latest',
          temperature: 0.3,
        },
      };

      const configPath = path.join(tempDir, 'qcode.config.json');
      await fs.writeFile(configPath, JSON.stringify(projectConfig, null, 2));

      // Set environment variable (should override project config)
      const originalEnv = process.env.QCODE_OLLAMA_MODEL;
      process.env.QCODE_OLLAMA_MODEL = 'env-model:latest';

      try {
        const result = await manager.loadConfig();
        const config = result.config;

        // Environment should override project
        expect(config.ollama.model).toBe('env-model:latest');
        // Project should override defaults
        expect(config.ollama.temperature).toBe(0.3);
        // Defaults should fill in missing values
        expect(config.ollama.url).toBe('http://localhost:11434');
      } finally {
        if (originalEnv !== undefined) {
          process.env.QCODE_OLLAMA_MODEL = originalEnv;
        } else {
          delete process.env.QCODE_OLLAMA_MODEL;
        }
      }
    });
  });
});
