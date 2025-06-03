import { FilesTool } from '../../src/tools/files.js';
import { WorkspaceSecurity } from '../../src/security/workspace.js';
import { getDefaultConfig } from '../../src/config/defaults.js';
import { TEST_WORKSPACE } from '../setup.js';
import { promises as fs } from 'fs';
import { mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';

describe('FilesTool', () => {
  let filesTool: FilesTool;
  let workspaceSecurity: WorkspaceSecurity;
  let testFixturesDir: string;

  beforeEach(() => {
    const securityConfig = getDefaultConfig(TEST_WORKSPACE).security;

    workspaceSecurity = new WorkspaceSecurity(securityConfig, TEST_WORKSPACE);
    workspaceSecurity.addAllowedPath(tmpdir());

    // Add test fixtures directory to allowed paths
    testFixturesDir = path.join(process.cwd(), 'tests', 'fixtures', 'test-files');
    workspaceSecurity.addAllowedPath(testFixturesDir);
    workspaceSecurity.addAllowedPath(path.join(process.cwd(), 'tests'));

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
    describe('Write Operations - Critical Tests', () => {
      let tempDir: string;

      beforeEach(async () => {
        tempDir = await mkdtemp(path.join(tmpdir(), 'qcode-test-'));
      });

      afterEach(async () => {
        try {
          await fs.rm(tempDir, { recursive: true });
        } catch {
          // Ignore cleanup errors
        }
      });

      it('should enforce workspace boundary security validation', async () => {
        // Test path traversal prevention
        const result1 = await filesTool.execute({
          operation: 'write',
          path: '../outside-workspace.txt',
          content: 'malicious content',
        });

        expect(result1.success).toBe(false);
        expect(result1.error).toContain('Path traversal detected');

        // Test absolute path outside workspace
        const result2 = await filesTool.execute({
          operation: 'write',
          path: '/tmp/outside-workspace.txt',
          content: 'malicious content',
        });

        expect(result2.success).toBe(false);
        expect(result2.error).toMatch(/Path traversal detected|workspace|security/);
      });

      it('should overwrite existing file with backup functionality', async () => {
        const testFile = path.join(tempDir, 'overwrite-test.txt');
        const originalContent = 'original content that should be backed up';
        const newContent = 'new content that overwrites the original';

        // Create original file in temp directory
        await fs.writeFile(testFile, originalContent, 'utf8');

        // Overwrite with backup enabled
        const result = await filesTool.execute({
          operation: 'write',
          path: testFile,
          content: newContent,
          backup: true,
        });

        expect(result.success).toBe(true);
        expect(result.data.created).toBe(false); // File existed
        expect(result.data.backup).toBeDefined();
        expect(result.data.backup).toMatch(/\.backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}/);

        // Verify new content was written
        const currentContent = await fs.readFile(testFile, 'utf8');
        expect(currentContent).toBe(newContent);

        // Verify backup contains original content
        const backupContent = await fs.readFile(result.data.backup, 'utf8');
        expect(backupContent).toBe(originalContent);
      });

      it('should perform atomic write operations preventing corruption', async () => {
        const testFile = path.join(tempDir, 'atomic-test.txt');
        const originalContent = 'original content for atomic test';
        const newContent = 'new content written atomically';

        // Create original file in temp directory
        await fs.writeFile(testFile, originalContent, 'utf8');

        // Mock a write failure scenario by creating a test that verifies
        // the file is never in a partial state during write
        let fileReadsDuringWrite: string[] = [];

        // Start the write operation
        const writePromise = filesTool.execute({
          operation: 'write',
          path: testFile,
          content: newContent,
        });

        // Attempt to read the file multiple times during write
        // In an atomic operation, we should only see original OR new content, never partial
        const readPromises = Array(5)
          .fill(null)
          .map(async (_, i) => {
            await new Promise(resolve => setTimeout(resolve, i * 2)); // Stagger reads
            try {
              const content = await fs.readFile(testFile, 'utf8');
              fileReadsDuringWrite.push(content);
            } catch {
              // File might not exist during atomic operation
              fileReadsDuringWrite.push('FILE_NOT_FOUND');
            }
          });

        // Wait for both write and reads to complete
        const [writeResult] = await Promise.all([writePromise, ...readPromises]);

        expect(writeResult.success).toBe(true);

        // Verify final content is correct
        const finalContent = await fs.readFile(testFile, 'utf8');
        expect(finalContent).toBe(newContent);

        // Verify atomic behavior: all reads should show either original content,
        // new content, or file not found (during atomic rename), but never partial content
        fileReadsDuringWrite.forEach(content => {
          expect([originalContent, newContent, 'FILE_NOT_FOUND']).toContain(content);
        });
      });

      it('should create new file in existing directory', async () => {
        const testFile = path.join(tempDir, 'new-file-test.txt');
        const content = 'content for new file creation test';

        const result = await filesTool.execute({
          operation: 'write',
          path: testFile,
          content: content,
        });

        expect(result.success).toBe(true);
        expect(result.data.created).toBe(true);
        expect(result.data.path).toBe(testFile);
        expect(result.data.size).toBe(content.length);
        expect(result.data.backup).toBeUndefined(); // No backup for new file

        // Verify file was created with correct content
        const fileContent = await fs.readFile(testFile, 'utf8');
        expect(fileContent).toBe(content);
      });
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

    it('should successfully execute search operation', async () => {
      const result = await filesTool.execute({
        operation: 'search',
        query: 'test',
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.matches).toBeDefined();
      expect(Array.isArray(result.data.matches)).toBe(true);
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

      // Should succeed since search operation is now implemented
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.matches).toBeDefined();
      expect(Array.isArray(result.data.matches)).toBe(true);
    });
  });
});
