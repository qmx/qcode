import { ShellTool } from '../../src/tools/shell.js';
import { WorkspaceSecurity } from '../../src/security/workspace.js';
import { jest } from '@jest/globals';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdtemp } from 'fs/promises';

// Mock the logger to avoid console output during tests
jest.mock('../../src/utils/logger.js', () => ({
  getLogger: jest.fn(() => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

describe('ShellTool', () => {
  let shellTool: ShellTool;
  let workspaceSecurity: WorkspaceSecurity;
  let testWorkspace: string;

  beforeEach(async () => {
    // Create a temporary test workspace
    testWorkspace = await mkdtemp(join(tmpdir(), 'qcode-shell-test-'));

    // Initialize workspace security with test workspace
    const securityConfig = {
      workspace: {
        allowedPaths: [testWorkspace],
        forbiddenPatterns: ['**/.git/**', '**/node_modules/**'],
        allowOutsideWorkspace: false,
      },
      commands: {
        allowedCommands: ['echo', 'ls', 'node', 'git'],
        forbiddenPatterns: ['rm *', 'del *', 'sudo *'], // Remove the problematic patterns for testing
        allowArbitraryCommands: false,
      },
    };

    workspaceSecurity = new WorkspaceSecurity(securityConfig, testWorkspace);

    // Use default configuration but with relaxed forbidden patterns for testing
    const shellConfig = {
      forbiddenPatterns: ['rm *', 'del *', 'sudo *', '* > *', '* ; *'], // Include operators but exclude node test pattern
    };

    shellTool = new ShellTool(workspaceSecurity, shellConfig);
  });

  describe('Command Validation', () => {
    it('should use custom configuration', () => {
      // Test that the configuration was applied correctly
      expect((shellTool as any).forbiddenPatterns).toEqual([
        'rm *',
        'del *',
        'sudo *',
        '* > *',
        '* ; *',
      ]);
      expect((shellTool as any).allowedCommands).toContain('echo');
    });

    it('should allow basic allowed commands', async () => {
      const result = await shellTool.execute({
        command: 'echo',
      });

      expect(result.success).toBe(true);
      expect(result.tool).toBe('shell');
    });

    it('should reject commands not in the allowlist', async () => {
      const result = await shellTool.execute({
        command: 'rm',
        args: ['-rf', '/'],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Command 'rm' is not in the allowed commands list");
    });

    it('should reject forbidden command patterns', async () => {
      const result = await shellTool.execute({
        command: 'ls',
        args: ['>', '/dev/null'],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Command matches forbidden pattern');
    });

    it('should reject dangerous arguments with shell operators', async () => {
      const result = await shellTool.execute({
        command: 'ls',
        args: [';', 'rm', '-rf', '/'],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Command matches forbidden pattern');
    });

    it('should allow only read-only git commands', async () => {
      // Test allowed git command
      const allowedResult = await shellTool.execute({
        command: 'git',
        args: ['status'],
      });
      expect(allowedResult.success).toBe(true);

      // Test forbidden git command
      const forbiddenResult = await shellTool.execute({
        command: 'git',
        args: ['commit', '-m', 'test'],
      });
      expect(forbiddenResult.success).toBe(false);
      expect(forbiddenResult.error).toContain("Git command 'commit' is not allowed");
    });
  });

  describe('Workspace Security Integration', () => {
    it('should respect workspace boundaries for working directory', async () => {
      const result = await shellTool.execute({
        command: 'ls',
        cwd: '/etc', // Outside workspace
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Working directory access denied');
    });

    it('should allow commands within workspace', async () => {
      const result = await shellTool.execute({
        command: 'ls',
        cwd: testWorkspace,
      });

      expect(result.success).toBe(true);
    });
  });

  describe('Command Execution', () => {
    it('should execute simple commands successfully', async () => {
      const result = await shellTool.execute({
        command: 'echo',
        args: ['hello', 'world'],
      });

      expect(result.success).toBe(true);
      if (result.success && result.data) {
        const shellResult = result.data as any;
        expect(shellResult.stdout.trim()).toBe('hello world');
        expect(shellResult.exitCode).toBe(0);
        expect(shellResult.command).toBe('echo');
        expect(shellResult.args).toEqual(['hello', 'world']);
      }
    });

    it('should capture stderr output', async () => {
      // Use a command that writes to stderr (works cross-platform)
      const result = await shellTool.execute({
        command: 'node',
        args: ['-e', 'console.error("error message")'],
      });

      expect(result.success).toBe(true);
      if (result.success && result.data) {
        const shellResult = result.data as any;
        expect(shellResult.stderr.trim()).toBe('error message');
      }
    });

    it('should handle command failures with non-zero exit codes', async () => {
      const result = await shellTool.execute({
        command: 'node',
        args: ['-e', 'process.exit(1)'],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Command failed');
    });

    it('should respect timeout settings', async () => {
      const result = await shellTool.execute({
        command: 'node',
        args: ['-e', 'setTimeout(() => {}, 10000)'], // 10 second delay
        timeout: 1000, // 1 second timeout
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Command timed out');
    }, 15000); // Test timeout longer than command timeout

    it('should measure execution duration', async () => {
      const result = await shellTool.execute({
        command: 'echo',
        args: ['test'],
      });

      expect(result.success).toBe(true);
      if (result.success && result.data) {
        const shellResult = result.data as any;
        expect(shellResult.duration).toBeGreaterThanOrEqual(0);
        expect(typeof shellResult.duration).toBe('number');
      }
    });
  });

  describe('Result Data', () => {
    it('should include command execution details in result data', async () => {
      const result = await shellTool.execute({
        command: 'echo',
        args: ['hello'],
      });

      expect(result.success).toBe(true);
      if (result.success && result.data) {
        const shellResult = result.data as any;
        expect(shellResult.command).toBe('echo');
        expect(shellResult.args).toEqual(['hello']);
        expect(shellResult.exitCode).toBe(0);
        expect(shellResult.workingDirectory).toBeDefined();
        expect(shellResult.duration).toBeGreaterThanOrEqual(0);
      }
    });

    it('should include stdout in result data', async () => {
      const result = await shellTool.execute({
        command: 'node',
        args: ['-e', 'console.log("stdout")'],
      });

      expect(result.success).toBe(true);
      if (result.success && result.data) {
        const shellResult = result.data as any;
        expect(shellResult.stdout.trim()).toBe('stdout');
        expect(shellResult.stderr.trim()).toBe('');
        expect(shellResult.command).toBe('node');
        expect(shellResult.args).toEqual(['-e', 'console.log("stdout")']);
      }
    });

    it('should include stderr in result data', async () => {
      const result = await shellTool.execute({
        command: 'node',
        args: ['-e', 'console.error("error")'],
      });

      expect(result.success).toBe(true);
      if (result.success && result.data) {
        const shellResult = result.data as any;
        expect(shellResult.stdout.trim()).toBe('');
        expect(shellResult.stderr.trim()).toBe('error');
      }
    });
  });

  describe('Streaming Support', () => {
    it('should support streaming output when enabled', async () => {
      const result = await shellTool.execute({
        command: 'echo',
        args: ['streaming-test'],
        allowStreaming: true,
      });

      expect(result.success).toBe(true);
      if (result.success && result.data) {
        const shellResult = result.data as any;
        expect(shellResult.stdout.trim()).toBe('streaming-test');
      }
    });

    it('should fall back to regular execution when streaming disabled', async () => {
      const result = await shellTool.execute({
        command: 'echo',
        args: ['non-streaming-test'],
        allowStreaming: false,
      });

      expect(result.success).toBe(true);
      if (result.success && result.data) {
        const shellResult = result.data as any;
        expect(shellResult.stdout.trim()).toBe('non-streaming-test');
      }
    });
  });

  describe('Parameter Validation', () => {
    it('should validate required command parameter', async () => {
      const result = await shellTool.execute({
        command: '',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Command is required');
    });

    it('should apply default values for optional parameters', async () => {
      const result = await shellTool.execute({
        command: 'echo',
        args: ['test'],
      });

      expect(result.success).toBe(true);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should validate timeout limits', async () => {
      const result = await shellTool.execute({
        command: 'echo',
        args: ['test'],
        timeout: 400000, // Over 5 minute limit
      });

      expect(result.success).toBe(false);
      // Should be caught by Zod validation
    });
  });

  describe('Tool Definition', () => {
    it('should provide correct tool definition format', () => {
      const definition = shellTool.toOllamaFormat() as any;

      expect(definition.type).toBe('function');
      expect(definition.function.name).toBe('shell');
      expect(definition.function.description).toContain('Execute shell commands safely');
      expect(definition.function.parameters).toBeDefined();
      expect(definition.function.parameters.properties.command).toBeDefined();
    });

    it('should include all schema properties in definition', () => {
      const definition = shellTool.toOllamaFormat() as any;
      const properties = definition.function.parameters.properties;

      expect(properties.command).toBeDefined();
      expect(properties.args).toBeDefined();
      expect(properties.cwd).toBeDefined();
      expect(properties.timeout).toBeDefined();
      expect(properties.captureOutput).toBeDefined();
      expect(properties.allowStreaming).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle command not found errors gracefully', async () => {
      const result = await shellTool.execute({
        command: 'nonexistent-command-12345',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should provide meaningful error messages for security violations', async () => {
      const result = await shellTool.execute({
        command: 'curl',
        args: ['https://example.com'],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Command 'curl' is not in the allowed commands list");
    });

    it('should include error metadata for debugging', async () => {
      const result = await shellTool.execute({
        command: 'invalid-command',
      });

      expect(result.success).toBe(false);
      expect(result.tool).toBe('shell');
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });
  });
});
