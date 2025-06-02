import { FilesTool } from '../../src/tools/files.js';
import { WorkspaceSecurity } from '../../src/security/workspace.js';
import { SecurityConfig } from '../../src/types.js';

describe('FilesTool', () => {
  let filesTool: FilesTool;
  let workspaceSecurity: WorkspaceSecurity;

  beforeEach(() => {
    const securityConfig: SecurityConfig = {
      workspace: {
        allowedPaths: [process.cwd()],
        forbiddenPatterns: ['**/.git/**', '**/node_modules/**'],
        allowOutsideWorkspace: false,
      },
      commands: {
        allowedCommands: [],
        forbiddenPatterns: [],
        allowArbitraryCommands: false,
      },
    };

    workspaceSecurity = new WorkspaceSecurity(securityConfig);
    filesTool = new FilesTool(workspaceSecurity);
  });

  describe('Basic Structure', () => {
    it('should have correct namespace and name', () => {
      expect(filesTool.namespace).toBe('internal');
      expect(filesTool.name).toBe('files');
      expect(filesTool.fullName).toBe('internal:files');
    });

    it('should provide a valid tool definition', () => {
      const definition = filesTool.definition;

      expect(definition.name).toBe('files');
      expect(definition.description).toContain('file operations');
      expect(definition.parameters.type).toBe('object');
      expect(definition.parameters.properties.operation).toBeDefined();
      expect(definition.parameters.required).toContain('operation');
    });

    it('should validate operation parameter in tool definition', () => {
      const definition = filesTool.definition;
      const operationProp = definition.parameters.properties.operation;

      expect(operationProp.enum).toEqual(['read', 'write', 'list', 'search']);
    });
  });

  describe('Parameter Validation', () => {
    it('should reject invalid operations', async () => {
      const result = await filesTool.execute({ operation: 'invalid' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('operation');
      expect(result.tool).toBe('files');
      expect(result.namespace).toBe('internal');
    });

    it('should reject missing operation parameter', async () => {
      const result = await filesTool.execute({});

      expect(result.success).toBe(false);
      expect(result.error).toContain('operation');
    });

    it('should validate read operation parameters', async () => {
      const result = await filesTool.execute({
        operation: 'read',
        // Missing required path parameter
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('path');
    });

    it('should validate write operation parameters', async () => {
      const result = await filesTool.execute({
        operation: 'write',
        path: 'test.txt',
        // Missing required content parameter
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('content');
    });

    it('should validate search operation parameters', async () => {
      const result = await filesTool.execute({
        operation: 'search',
        // Missing required query parameter
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('query');
    });
  });

  describe('Placeholder Operations', () => {
    it('should throw NOT_IMPLEMENTED for read operation', async () => {
      const result = await filesTool.execute({
        operation: 'read',
        path: 'test.txt',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not yet implemented');
    });

    it('should throw NOT_IMPLEMENTED for write operation', async () => {
      const result = await filesTool.execute({
        operation: 'write',
        path: 'test.txt',
        content: 'test content',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not yet implemented');
    });

    it('should throw NOT_IMPLEMENTED for list operation', async () => {
      const result = await filesTool.execute({
        operation: 'list',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not yet implemented');
    });

    it('should throw NOT_IMPLEMENTED for search operation', async () => {
      const result = await filesTool.execute({
        operation: 'search',
        query: 'test',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not yet implemented');
    });
  });

  describe('Execution Timing', () => {
    it('should track execution duration', async () => {
      const result = await filesTool.execute({
        operation: 'read',
        path: 'test.txt',
      });

      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(typeof result.duration).toBe('number');
    });
  });

  describe('Optional Parameters', () => {
    it('should accept valid optional parameters for read operation', async () => {
      const result = await filesTool.execute({
        operation: 'read',
        path: 'test.txt',
        startLine: 1,
        endLine: 10,
        encoding: 'utf8',
      });

      // Should fail with NOT_IMPLEMENTED, not parameter validation error
      expect(result.success).toBe(false);
      expect(result.error).toContain('not yet implemented');
    });

    it('should accept valid optional parameters for list operation', async () => {
      const result = await filesTool.execute({
        operation: 'list',
        path: './src',
        pattern: '**/*.ts',
        recursive: true,
        includeHidden: false,
        includeMetadata: true,
      });

      // Should fail with NOT_IMPLEMENTED, not parameter validation error
      expect(result.success).toBe(false);
      expect(result.error).toContain('not yet implemented');
    });

    it('should accept valid optional parameters for search operation', async () => {
      const result = await filesTool.execute({
        operation: 'search',
        query: 'function',
        path: './src',
        pattern: '**/*.ts',
        useRegex: false,
        caseSensitive: true,
        maxResults: 50,
        includeContext: true,
      });

      // Should fail with NOT_IMPLEMENTED, not parameter validation error
      expect(result.success).toBe(false);
      expect(result.error).toContain('not yet implemented');
    });
  });
});
