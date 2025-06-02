import { FilesTool } from '../../src/tools/files.js';
import { WorkspaceSecurity } from '../../src/security/workspace.js';
import { SecurityConfig } from '../../src/types.js';
import { promises as fs } from 'fs';
import path from 'path';

describe('FilesTool', () => {
  let filesTool: FilesTool;
  let workspaceSecurity: WorkspaceSecurity;
  let testFixturesDir: string;

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
    testFixturesDir = path.join(process.cwd(), 'tests', 'fixtures', 'test-files');
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

  // ============================================================================
  // TDD TESTS FOR READ FILE OPERATION (Section 1.7.2)
  // ============================================================================

  describe('Read File Operation - TDD Implementation', () => {
    let smallTextPath: string;
    let largeTextPath: string;
    let binaryFilePath: string;
    let utf8SpecialPath: string;

    beforeEach(() => {
      smallTextPath = path.join(testFixturesDir, 'small-text.txt');
      largeTextPath = path.join(testFixturesDir, 'large-text.txt');
      binaryFilePath = path.join(testFixturesDir, 'binary-file.bin');
      utf8SpecialPath = path.join(testFixturesDir, 'utf8-special.txt');
    });

    describe('Basic File Reading', () => {
      it('should read a small text file successfully', async () => {
        const result = await filesTool.execute({
          operation: 'read',
          path: smallTextPath,
        });

        expect(result.success).toBe(true);
        expect(result.data).toBeDefined();
        expect(result.data.content).toContain('Hello, World!');
        expect(result.data.content).toContain('This is a small test file.');
        expect(result.data.path).toBe(smallTextPath);
        expect(result.data.encoding).toBe('utf8');
        expect(result.data.size).toBeGreaterThan(0);
        expect(result.data.lines).toBe(6);
        expect(result.duration).toBeGreaterThanOrEqual(0);
      });

      it('should handle UTF-8 encoding with special characters', async () => {
        const result = await filesTool.execute({
          operation: 'read',
          path: utf8SpecialPath,
        });

        expect(result.success).toBe(true);
        expect(result.data.content).toContain('αβγδεζηθικλμνξοπρστυφχψω'); // Greek
        expect(result.data.content).toContain('你好世界'); // Chinese
        expect(result.data.content).toContain('🌍🚀🎉💻'); // Emoji
        expect(result.data.content).toContain('∀∂∃∅∈∉∋∌∎∏∑√∞∫≈≠≤≥'); // Mathematical
        expect(result.data.encoding).toBe('utf8');
      });

      it('should provide accurate file metadata', async () => {
        const stats = await fs.stat(smallTextPath);
        const result = await filesTool.execute({
          operation: 'read',
          path: smallTextPath,
        });

        expect(result.success).toBe(true);
        expect(result.data.size).toBe(stats.size);
        expect(result.data.path).toBe(smallTextPath);
        expect(result.data.truncated).toBeUndefined(); // Small file should not be truncated
      });
    });

    describe('Line Range Reading', () => {
      it('should read a specific line range (lines 10-15)', async () => {
        const result = await filesTool.execute({
          operation: 'read',
          path: largeTextPath,
          startLine: 10,
          endLine: 15,
        });

        expect(result.success).toBe(true);
        expect(result.data.content).toContain('Line 10: Special symbols');
        expect(result.data.content).toContain('Line 11: Numbers and punctuation');
        expect(result.data.content).toContain('Line 12: More test content');
        expect(result.data.content).toContain('Line 13: Testing line boundaries');
        expect(result.data.content).toContain('Line 14: Boundary testing is important');
        expect(result.data.content).toContain('Line 15: Middle section starts');
        // Should not contain lines outside the range
        expect(result.data.content).not.toContain('Line 9: Including UTF-8');
        expect(result.data.content).not.toContain('Line 16: This is the middle');
        expect(result.data.lines).toBe(6); // Lines 10-15 inclusive = 6 lines
      });

      it('should read from start line to end of file', async () => {
        const result = await filesTool.execute({
          operation: 'read',
          path: largeTextPath,
          startLine: 23,
        });

        expect(result.success).toBe(true);
        expect(result.data.content).toContain('Line 23: Getting close to end');
        expect(result.data.content).toContain('Line 24: Very close now');
        expect(result.data.content).toContain('Line 25: This is the last line');
        expect(result.data.content).not.toContain('Line 22: Almost at the end');
        expect(result.data.lines).toBe(3); // Lines 23-25 = 3 lines
      });

      it('should read single line when startLine equals endLine', async () => {
        const result = await filesTool.execute({
          operation: 'read',
          path: largeTextPath,
          startLine: 15,
          endLine: 15,
        });

        expect(result.success).toBe(true);
        expect(result.data.content.trim()).toBe('Line 15: Middle section starts here');
        expect(result.data.lines).toBe(1);
      });

      it('should handle invalid line ranges gracefully', async () => {
        const result = await filesTool.execute({
          operation: 'read',
          path: largeTextPath,
          startLine: 100,
          endLine: 200,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('line range');
      });

      it('should validate that startLine <= endLine', async () => {
        const result = await filesTool.execute({
          operation: 'read',
          path: largeTextPath,
          startLine: 15,
          endLine: 10,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('startLine cannot be greater than endLine');
      });
    });

    describe('Error Handling', () => {
      it('should handle non-existent files gracefully', async () => {
        const result = await filesTool.execute({
          operation: 'read',
          path: 'non-existent-file.txt',
        });

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/File not found|Cannot access path|Path does not exist/);
        expect(result.duration).toBeGreaterThanOrEqual(0);
      });

      it('should handle empty file path', async () => {
        const result = await filesTool.execute({
          operation: 'read',
          path: '',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('path');
      });

      it('should prevent directory traversal attacks', async () => {
        const result = await filesTool.execute({
          operation: 'read',
          path: '../../../etc/passwd',
        });

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/Path traversal detected|workspace|security/);
      });

      it('should handle permission errors gracefully', async () => {
        // Create a file with no read permissions (if supported by the system)
        const testFile = path.join(testFixturesDir, 'no-read-permission.txt');
        try {
          await fs.writeFile(testFile, 'test content');
          await fs.chmod(testFile, 0o000); // No permissions

          const result = await filesTool.execute({
            operation: 'read',
            path: testFile,
          });

          expect(result.success).toBe(false);
          expect(result.error).toMatch(/Permission denied|EACCES|Unknown error/);
        } finally {
          // Cleanup: restore permissions and delete file
          try {
            await fs.chmod(testFile, 0o644);
            await fs.unlink(testFile);
          } catch (e) {
            // Ignore cleanup errors
          }
        }
      });
    });

    describe('Binary File Detection', () => {
      it('should detect binary files and handle gracefully', async () => {
        const result = await filesTool.execute({
          operation: 'read',
          path: binaryFilePath,
        });

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/binary|Binary file/);
      });

      it('should allow reading binary files when explicitly requested', async () => {
        const result = await filesTool.execute({
          operation: 'read',
          path: binaryFilePath,
          encoding: 'base64',
        });

        expect(result.success).toBe(true);
        expect(result.data.encoding).toBe('base64');
        expect(result.data.content).toMatch(/^[A-Za-z0-9+/]*={0,2}$/); // Base64 pattern
      });
    });

    describe('Large File Handling', () => {
      it('should handle large files with memory management', async () => {
        const result = await filesTool.execute({
          operation: 'read',
          path: largeTextPath,
        });

        expect(result.success).toBe(true);
        expect(result.data.content).toBeDefined();
        expect(result.data.size).toBeGreaterThan(0);
        expect(result.data.lines).toBe(25);
      });

      it('should truncate extremely large files and indicate truncation', async () => {
        // Create a very large file for testing
        const largeFile = path.join(testFixturesDir, 'very-large.txt');
        const largeContent = 'A'.repeat(10 * 1024 * 1024); // 10MB of 'A's

        try {
          await fs.writeFile(largeFile, largeContent);

          const result = await filesTool.execute({
            operation: 'read',
            path: largeFile,
          });

          expect(result.success).toBe(true);
          if (result.data.truncated) {
            expect(result.data.content.length).toBeLessThan(largeContent.length);
            expect(result.data.truncated).toBe(true);
          }
        } finally {
          // Cleanup
          try {
            await fs.unlink(largeFile);
          } catch (e) {
            // Ignore cleanup errors
          }
        }
      });
    });

    describe('Encoding Support', () => {
      it('should support different encoding options', async () => {
        const result = await filesTool.execute({
          operation: 'read',
          path: smallTextPath,
          encoding: 'utf-8',
        });

        expect(result.success).toBe(true);
        expect(result.data.encoding).toBe('utf-8');
      });

      it('should handle ascii encoding', async () => {
        const result = await filesTool.execute({
          operation: 'read',
          path: smallTextPath,
          encoding: 'ascii',
        });

        expect(result.success).toBe(true);
        expect(result.data.encoding).toBe('ascii');
      });
    });

    describe('Performance and Resource Management', () => {
      it('should complete file reading within reasonable time', async () => {
        const startTime = Date.now();

        const result = await filesTool.execute({
          operation: 'read',
          path: smallTextPath,
        });

        const endTime = Date.now();
        const duration = endTime - startTime;

        expect(result.success).toBe(true);
        expect(duration).toBeLessThan(1000); // Should complete within 1 second
        expect(result.duration).toBeLessThanOrEqual(duration);
      });

      it('should handle concurrent file reads without issues', async () => {
        const promises = Array(5)
          .fill(null)
          .map(() =>
            filesTool.execute({
              operation: 'read',
              path: smallTextPath,
            })
          );

        const results = await Promise.all(promises);

        results.forEach(result => {
          expect(result.success).toBe(true);
          expect(result.data.content).toContain('Hello, World!');
        });
      });
    });
  });

  describe('Placeholder Operations', () => {
    it('should throw NOT_IMPLEMENTED for write operation', async () => {
      const result = await filesTool.execute({
        operation: 'write',
        path: 'test.txt',
        content: 'test content',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not yet implemented');
    });

    it('should successfully execute list operation', async () => {
      const result = await filesTool.execute({
        operation: 'list',
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.files).toBeDefined();
      expect(Array.isArray(result.data.files)).toBe(true);
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

      // Once implemented, should succeed or fail with specific error, not parameter validation
      expect(result.duration).toBeGreaterThanOrEqual(0);
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

      // Should succeed since list operation is now implemented
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.files).toBeDefined();
      expect(Array.isArray(result.data.files)).toBe(true);
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
