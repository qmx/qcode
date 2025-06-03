import { FilesTool } from '../../src/tools/files.js';
import { WorkspaceSecurity } from '../../src/security/workspace.js';
import { SecurityConfig } from '../../src/types.js';
import { TEST_WORKSPACE } from '../setup.js';
import { promises as fs } from 'fs';
import path from 'path';
import { tmpdir } from 'os';

describe('FilesTool - Search Operation (Section 1.7.5)', () => {
  let filesTool: FilesTool;
  let workspaceSecurity: WorkspaceSecurity;
  let testFixturesDir: string;

  beforeEach(async () => {
    // Create security config
    const securityConfig: SecurityConfig = {
      workspace: {
        allowedPaths: [tmpdir()],
        forbiddenPatterns: ['*.secret', '*.private'],
        allowOutsideWorkspace: false,
      },
      commands: {
        allowedCommands: ['echo', 'ls'],
        forbiddenPatterns: ['rm', 'del'],
        allowArbitraryCommands: false,
      },
    };

    workspaceSecurity = new WorkspaceSecurity(securityConfig, TEST_WORKSPACE);

    // Add test fixtures directory to allowed paths
    testFixturesDir = path.join(process.cwd(), 'tests', 'fixtures', 'test-files');
    workspaceSecurity.addAllowedPath(testFixturesDir);
    workspaceSecurity.addAllowedPath(path.join(process.cwd(), 'tests'));

    filesTool = new FilesTool(workspaceSecurity);
  });

  describe('Search Parameter Validation', () => {
    it('should reject search operation with missing query parameter', async () => {
      const result = await filesTool.execute({
        operation: 'search',
        // Missing required query parameter
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('query');
    });

    it('should reject search operation with empty query', async () => {
      const result = await filesTool.execute({
        operation: 'search',
        query: '',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('query');
    });

    it('should accept valid search parameters', async () => {
      const result = await filesTool.execute({
        operation: 'search',
        query: 'test',
        path: testFixturesDir,
        pattern: '*.txt',
        useRegex: false,
        caseSensitive: false,
        maxResults: 50,
        includeContext: true,
      });

      // Should not fail with parameter validation error
      // (may fail with NOT_IMPLEMENTED initially)
      expect(result.tool).toBe('files');
      expect(result.namespace).toBe('internal');
    });
  });

  describe('Simple Text Search', () => {
    it('should find simple text matches across files', async () => {
      const result = await filesTool.execute({
        operation: 'search',
        query: 'test',
        path: testFixturesDir,
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.matches).toBeDefined();
      expect(Array.isArray(result.data.matches)).toBe(true);
      expect(result.data.query).toBe('test');
      expect(result.data.filesSearched).toBeGreaterThan(0);
      expect(result.data.totalMatches).toBeGreaterThan(0);

      // Should find matches in test files
      const matchFiles = result.data.matches.map((m: any) => path.basename(m.file));
      expect(matchFiles).toContain('test-file.txt');
      expect(matchFiles).toContain('large-text.txt');
    });

    it('should find matches with correct line and column information', async () => {
      const result = await filesTool.execute({
        operation: 'search',
        query: 'TypeScript',
        path: testFixturesDir,
      });

      expect(result.success).toBe(true);
      expect(result.data.matches.length).toBeGreaterThan(0);

      const match = result.data.matches[0];
      expect(match.file).toBeDefined();
      expect(match.line).toBeDefined();
      expect(match.column).toBeDefined();
      expect(match.match).toContain('TypeScript');
      expect(typeof match.line).toBe('number');
      expect(typeof match.column).toBe('number');
      expect(match.line).toBeGreaterThan(0);
      expect(match.column).toBeGreaterThanOrEqual(0);
    });

    it('should include context lines when requested', async () => {
      const result = await filesTool.execute({
        operation: 'search',
        query: 'TypeScript',
        path: testFixturesDir,
        includeContext: true,
      });

      expect(result.success).toBe(true);
      expect(result.data.matches.length).toBeGreaterThan(0);

      const match = result.data.matches[0];
      expect(match.context).toBeDefined();
      expect(match.context.before).toBeDefined();
      expect(match.context.after).toBeDefined();
      expect(Array.isArray(match.context.before)).toBe(true);
      expect(Array.isArray(match.context.after)).toBe(true);
    });

    it('should work with specific file patterns', async () => {
      const result = await filesTool.execute({
        operation: 'search',
        query: 'line',
        path: testFixturesDir,
        pattern: 'large-*.txt',
      });

      expect(result.success).toBe(true);
      expect(result.data.matches.length).toBeGreaterThan(0);

      // Should only search in files matching the pattern
      const matchFiles = result.data.matches.map((m: any) => path.basename(m.file));
      expect(matchFiles.every((f: string) => f.startsWith('large-'))).toBe(true);
    });
  });

  describe('Case Sensitivity', () => {
    it('should perform case-insensitive search by default', async () => {
      const result = await filesTool.execute({
        operation: 'search',
        query: 'HELLO',
        path: testFixturesDir,
        caseSensitive: false,
      });

      expect(result.success).toBe(true);
      expect(result.data.matches.length).toBeGreaterThan(0);

      // Should find "Hello" in test-file.txt
      const matchFiles = result.data.matches.map((m: any) => path.basename(m.file));
      expect(matchFiles).toContain('test-file.txt');
    });

    it('should perform case-sensitive search when requested', async () => {
      const result = await filesTool.execute({
        operation: 'search',
        query: 'HELLO',
        path: testFixturesDir,
        caseSensitive: true,
      });

      expect(result.success).toBe(true);
      // Should not find lowercase "hello"
      expect(result.data.totalMatches).toBe(0);
    });

    it('should find exact case matches in case-sensitive mode', async () => {
      const result = await filesTool.execute({
        operation: 'search',
        query: 'Hello',
        path: testFixturesDir,
        caseSensitive: true,
      });

      expect(result.success).toBe(true);
      expect(result.data.matches.length).toBeGreaterThan(0);

      const match = result.data.matches[0];
      expect(match.match).toContain('Hello');
    });
  });

  describe('Regular Expression Search', () => {
    it('should support simple regex patterns', async () => {
      const result = await filesTool.execute({
        operation: 'search',
        query: 'Line \\d+:',
        path: testFixturesDir,
        useRegex: true,
      });

      expect(result.success).toBe(true);
      expect(result.data.matches.length).toBeGreaterThan(0);

      // Should find "Line 1:", "Line 2:", etc.
      const matches = result.data.matches.map((m: any) => m.match);
      expect(matches.some((m: string) => /Line \d+:/.test(m))).toBe(true);
    });

    it('should support regex with capture groups', async () => {
      const result = await filesTool.execute({
        operation: 'search',
        query: '(Line \\d+): (.+)',
        path: testFixturesDir,
        useRegex: true,
      });

      expect(result.success).toBe(true);
      expect(result.data.matches.length).toBeGreaterThan(0);

      // Should find full line matches
      const match = result.data.matches[0];
      expect(match.match).toMatch(/Line \d+: .+/);
    });

    it('should handle complex regex patterns', async () => {
      const result = await filesTool.execute({
        operation: 'search',
        query: '[0-9]{3},[0-9]{3}\\.[0-9]{3}',
        path: testFixturesDir,
        useRegex: true,
      });

      expect(result.success).toBe(true);
      expect(result.data.matches.length).toBeGreaterThan(0);

      // Should find "123,456.789" in large-text.txt
      const match = result.data.matches[0];
      expect(match.match).toContain('123,456.789');
    });

    it('should handle regex case sensitivity', async () => {
      const result = await filesTool.execute({
        operation: 'search',
        query: '[A-Z][a-z]+',
        path: testFixturesDir,
        useRegex: true,
        caseSensitive: true,
      });

      expect(result.success).toBe(true);
      expect(result.data.matches.length).toBeGreaterThan(0);

      // Should find capitalized words
      const matches = result.data.matches.map((m: any) => m.match);
      expect(matches.some((m: string) => /^[A-Z][a-z]+/.test(m))).toBe(true);
    });
  });

  describe('Search Result Limits', () => {
    it('should respect maxResults parameter', async () => {
      const result = await filesTool.execute({
        operation: 'search',
        query: 'line',
        path: testFixturesDir,
        maxResults: 3,
      });

      expect(result.success).toBe(true);
      expect(result.data.matches.length).toBeLessThanOrEqual(3);

      if (result.data.totalMatches > 3) {
        expect(result.data.truncated).toBe(true);
      }
    });

    it('should set truncated flag when results are limited', async () => {
      const result = await filesTool.execute({
        operation: 'search',
        query: 'Line',
        path: testFixturesDir,
        maxResults: 2,
      });

      expect(result.success).toBe(true);
      expect(result.data.matches.length).toBeLessThanOrEqual(2);

      // If there are more than 2 "Line" matches in test files, should be truncated
      if (result.data.totalMatches > result.data.matches.length) {
        expect(result.data.truncated).toBe(true);
      }
    });

    it('should work with default maxResults (100)', async () => {
      const result = await filesTool.execute({
        operation: 'search',
        query: 'e',
        path: testFixturesDir,
      });

      expect(result.success).toBe(true);
      // Should find many matches for 'e'
      expect(result.data.totalMatches).toBeGreaterThan(10);
      expect(result.data.matches.length).toBeLessThanOrEqual(100);
    });
  });

  describe('Binary File Exclusion', () => {
    it('should exclude binary files from search', async () => {
      const result = await filesTool.execute({
        operation: 'search',
        query: 'test',
        path: testFixturesDir,
      });

      expect(result.success).toBe(true);

      // Should not include binary-file.bin in results
      const matchFiles = result.data.matches.map((m: any) => path.basename(m.file));
      expect(matchFiles).not.toContain('binary-file.bin');
    });

    it('should only search text files', async () => {
      const result = await filesTool.execute({
        operation: 'search',
        query: '.',
        path: testFixturesDir,
        useRegex: true,
      });

      expect(result.success).toBe(true);

      // All result files should be text files
      const matchFiles = result.data.matches.map((m: any) => path.basename(m.file));
      const textFiles = matchFiles.filter((f: string) => f.endsWith('.txt'));
      expect(textFiles.length).toBe(matchFiles.length);
    });
  });

  describe('Search Performance', () => {
    it('should complete search within reasonable time', async () => {
      const startTime = Date.now();

      const result = await filesTool.execute({
        operation: 'search',
        query: 'test',
        path: testFixturesDir,
      });

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(2000); // Should complete within 2 seconds
      expect(result.duration).toBeLessThanOrEqual(duration);
    });

    it('should handle searches in larger directory trees', async () => {
      // Add src directory to allowed paths for this test
      const srcPath = path.join(process.cwd(), 'src');
      workspaceSecurity.addAllowedPath(srcPath);

      // Search in src directory (should contain TypeScript files)
      const result = await filesTool.execute({
        operation: 'search',
        query: 'function',
        path: srcPath,
        pattern: '**/*.ts',
        maxResults: 10,
      });

      expect(result.success).toBe(true);
      expect(result.data.filesSearched).toBeGreaterThan(1);
    });
  });

  describe('Context Lines', () => {
    it('should provide context lines before and after matches', async () => {
      const result = await filesTool.execute({
        operation: 'search',
        query: 'Middle section',
        path: testFixturesDir,
        includeContext: true,
      });

      expect(result.success).toBe(true);
      expect(result.data.matches.length).toBeGreaterThan(0);

      const match = result.data.matches[0];
      expect(match.context).toBeDefined();
      expect(match.context.before.length).toBeGreaterThan(0);
      expect(match.context.after.length).toBeGreaterThan(0);

      // Context should contain adjacent lines
      expect(match.context.before.some((line: string) => line.length > 0)).toBe(true);
      expect(match.context.after.some((line: string) => line.length > 0)).toBe(true);
    });

    it('should omit context when includeContext is false', async () => {
      const result = await filesTool.execute({
        operation: 'search',
        query: 'test',
        path: testFixturesDir,
        includeContext: false,
      });

      expect(result.success).toBe(true);
      expect(result.data.matches.length).toBeGreaterThan(0);

      const match = result.data.matches[0];
      expect(match.context).toBeUndefined();
    });

    it('should handle context at file boundaries', async () => {
      const result = await filesTool.execute({
        operation: 'search',
        query: 'Hello World',
        path: testFixturesDir,
        includeContext: true,
      });

      expect(result.success).toBe(true);
      expect(result.data.matches.length).toBeGreaterThan(0);

      const match = result.data.matches[0];
      expect(match.context).toBeDefined();

      // First line should have no "before" context or empty before context
      if (match.line === 1) {
        expect(match.context.before.length).toBe(0);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle search in non-existent directory', async () => {
      const result = await filesTool.execute({
        operation: 'search',
        query: 'test',
        path: '/non/existent/directory',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('workspace');
    });

    it('should handle invalid regex patterns gracefully', async () => {
      const result = await filesTool.execute({
        operation: 'search',
        query: '[unclosed bracket',
        path: testFixturesDir,
        useRegex: true,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('regex');
    });

    it('should respect workspace security boundaries', async () => {
      const result = await filesTool.execute({
        operation: 'search',
        query: 'test',
        path: '../../../../../../etc',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error!.includes('Path traversal') || result.error!.includes('workspace')).toBe(
        true
      );
    });

    it('should handle permission denied gracefully', async () => {
      // This test may not work on all systems, but should handle gracefully
      const result = await filesTool.execute({
        operation: 'search',
        query: 'test',
        path: '/root',
      });

      // Should either succeed (if accessible) or fail gracefully
      if (!result.success) {
        expect(result.error).toBeDefined();
        expect(typeof result.error).toBe('string');
      }
    });
  });

  describe('Search Result Accuracy', () => {
    it('should provide accurate file paths', async () => {
      const result = await filesTool.execute({
        operation: 'search',
        query: 'Hello',
        path: testFixturesDir,
      });

      expect(result.success).toBe(true);
      expect(result.data.matches.length).toBeGreaterThan(0);

      for (const match of result.data.matches) {
        expect(path.isAbsolute(match.file)).toBe(true);

        // Check if file exists
        let fileExists = false;
        try {
          await fs.access(match.file);
          fileExists = true;
        } catch {
          fileExists = false;
        }
        expect(fileExists).toBe(true);
      }
    });

    it('should provide accurate line numbers', async () => {
      const result = await filesTool.execute({
        operation: 'search',
        query: 'Line 5:',
        path: testFixturesDir,
      });

      expect(result.success).toBe(true);
      expect(result.data.matches.length).toBeGreaterThan(0);

      const match = result.data.matches[0];
      expect(match.line).toBe(5);

      // Verify by reading the actual line
      const fileContent = await fs.readFile(match.file, 'utf8');
      const lines = fileContent.split('\n');
      expect(lines[match.line - 1]).toContain('Line 5:');
    });

    it('should provide accurate column positions', async () => {
      const result = await filesTool.execute({
        operation: 'search',
        query: 'TypeScript',
        path: testFixturesDir,
      });

      expect(result.success).toBe(true);
      expect(result.data.matches.length).toBeGreaterThan(0);

      const match = result.data.matches[0];

      // Verify column position
      const fileContent = await fs.readFile(match.file, 'utf8');
      const lines = fileContent.split('\n');
      const line = lines[match.line - 1];
      expect(line).toBeDefined();

      const foundIndex = line!.indexOf('TypeScript');
      expect(foundIndex).toBe(match.column);
    });
  });

  describe('UTF-8 and Special Characters', () => {
    it('should handle UTF-8 characters in search', async () => {
      const result = await filesTool.execute({
        operation: 'search',
        query: 'áéíóú',
        path: testFixturesDir,
      });

      expect(result.success).toBe(true);
      expect(result.data.matches.length).toBeGreaterThan(0);

      const match = result.data.matches[0];
      expect(match.match).toContain('áéíóú');
    });

    it('should handle special symbols in search', async () => {
      const result = await filesTool.execute({
        operation: 'search',
        query: '!@#$%^&*()',
        path: testFixturesDir,
      });

      expect(result.success).toBe(true);
      expect(result.data.matches.length).toBeGreaterThan(0);

      const match = result.data.matches[0];
      expect(match.match).toContain('!@#$%^&*()');
    });
  });
});
