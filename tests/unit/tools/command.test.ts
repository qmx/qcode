import { CommandTool } from '../../../src/tools/command.js';
import { WorkspaceSecurity } from '../../../src/security/workspace.js';
import { jest } from '@jest/globals';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdtemp } from 'fs/promises';

// Mock the logger to avoid console output during tests
jest.mock('../../../src/utils/logger.js', () => ({
  getLogger: jest.fn(() => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

describe('CommandTool', () => {
  let commandTool: CommandTool;
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
      permissions: {
        allow: [
          'Shell(echo *)',
          'Shell(ls *)', 
          'Shell(node *)',
          'Shell(git *)',
          'Read(*.ts)',  // Future permission
        ],
        deny: [
          'Shell(rm *)',
          'Shell(del *)', 
          'Shell(sudo *)',
          'Shell(* && *)',  // Deny shell operators
          'Shell(* || *)',
          'Shell(* ; *)',
          'Shell(* | *)',
        ],
      },
    };

    workspaceSecurity = new WorkspaceSecurity(securityConfig, testWorkspace);

    // Parse Shell permissions from Claude Code-style format
    const { parseShellPermissions } = await import('../../../src/security/permissions.js');
    const shellPermissions = parseShellPermissions(
      securityConfig.permissions.allow,
      securityConfig.permissions.deny
    );

    commandTool = new CommandTool(workspaceSecurity, shellPermissions);
  });

  describe('Permission-Based Security', () => {
    it('should use Claude Code-style permission patterns', () => {
      // Test that the Shell permissions were parsed correctly from Claude Code format
      expect((commandTool as any).allowPatterns).toContain('echo *');
      expect((commandTool as any).allowPatterns).toContain('ls *');
      expect((commandTool as any).allowPatterns).toContain('node *');
      expect((commandTool as any).allowPatterns).toContain('git *');
      expect((commandTool as any).denyPatterns).toContain('rm *');
      expect((commandTool as any).denyPatterns).toContain('del *');
      expect((commandTool as any).denyPatterns).toContain('sudo *');
    });

    it('should deny commands matching deny patterns', async () => {
      const result = await commandTool.execute({
        command: 'rm',
        args: ['-rf', '/'],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('denied by security policy');
    });

    it('should deny shell operators to prevent injection', async () => {
      const result = await commandTool.execute({
        command: 'echo',
        args: ['hello', '&&', 'rm', '-rf', '/'],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('denied by security policy');
    });

    it('should deny commands not in allow patterns', async () => {
      const result = await commandTool.execute({
        command: 'curl',
        args: ['http://example.com'],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not allowed by security policy');
    });
  });

  describe('Workspace Security Integration', () => {
    it('should respect workspace boundaries for working directory', async () => {
      const result = await commandTool.execute({
        command: 'echo',
        args: ['test'],
        cwd: '/etc', // Outside workspace
      });

            expect(result.success).toBe(false);
      expect(result.error).toContain('Working directory access denied');
    });
  });

  describe('Parameter Validation', () => {
    it('should validate required command parameter', async () => {
      const result = await commandTool.execute({
        args: ['hello'],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Required');
    });

    it('should validate timeout limits', async () => {
      const result = await commandTool.execute({
        command: 'echo',
        args: ['test'],
        timeout: 500000, // Exceeds max limit
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('less than or equal to 300000');
    });
  });

  describe('Tool Definition', () => {
    it('should provide correct tool definition format', () => {
      const definition = commandTool.definition;
      expect(definition.name).toBe('command');
      expect(definition.description).toContain('commands');
      expect(definition.parameters).toBeDefined();
      expect(definition.parameters.type).toBe('object');
    });

    it('should include all schema properties in definition', () => {
      const definition = commandTool.definition;
      const properties = definition.parameters.properties;
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
      const result = await commandTool.execute({
        command: 'nonexistentcommand12345',
        args: [],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not allowed by security policy');
    });

    it('should provide meaningful error messages for security violations', async () => {
      const result = await commandTool.execute({
        command: 'rm',
        args: ['-rf', '/'],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('denied by security policy');
      expect(result.tool).toBe('command');
    });

    it('should include error metadata for debugging', async () => {
      const result = await commandTool.execute({
        command: 'invalidcommand',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.tool).toBe('command');
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });
  });
}); 