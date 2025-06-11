import { FilesTool } from '../../src/tools/files.js';
import { WorkspaceSecurity } from '../../src/security/workspace.js';
import { SecurityConfig } from '../../src/types.js';
import { TEST_WORKSPACE } from '../setup.js';
import { join } from 'path';
import { tmpdir } from 'os';
import fs from 'fs/promises';

describe('FilesTool - List Operation', () => {
  let filesTool: FilesTool;
  let workspaceSecurity: WorkspaceSecurity;
  let tempDir: string;

  beforeEach(async () => {
    // Create a temporary directory for test files
    tempDir = await fs.mkdtemp(join(tmpdir(), 'qcode-files-list-test-'));

    // Set up workspace security with the temp directory
    const securityConfig: SecurityConfig = {
      workspace: {
        allowedPaths: [tempDir],
        forbiddenPatterns: ['*.secret', '*.private'],
        allowOutsideWorkspace: false,
      },
      permissions: {
        allow: [
          'Shell(echo *)',
          'Shell(ls *)',
        ],
        deny: [
          'Shell(rm *)',
          'Shell(del *)',
        ],
      },
    };

    workspaceSecurity = new WorkspaceSecurity(securityConfig, TEST_WORKSPACE);
    workspaceSecurity.addAllowedPath(tempDir);
    filesTool = new FilesTool(workspaceSecurity);

    // Create test project structure
    const testFiles = {
      'package.json': '{"name": "test-project", "version": "1.0.0"}',
      'src/index.ts': 'export const main = () => console.log("Hello");',
      'src/utils/helper.ts': 'export const helper = () => "help";',
      'src/components/Button.tsx': 'export const Button = () => <button />;',
      'dist/index.js': 'console.log("compiled");',
      'dist/utils/helper.js': 'module.exports = { helper: () => "help" };',
      '.env': 'NODE_ENV=development',
      '.gitignore': 'node_modules/\ndist/',
      'README.md': '# Test Project',
      'docs/api.md': '# API Documentation',
      'docs/guides/setup.md': '# Setup Guide',
    };

    // Create all test files and directories
    for (const [filePath, content] of Object.entries(testFiles)) {
      const fullPath = join(tempDir, filePath);
      const dirPath = join(fullPath, '..');
      await fs.mkdir(dirPath, { recursive: true });
      await fs.writeFile(fullPath, content, 'utf8');
    }
  });

  afterEach(async () => {
    // Clean up test workspace
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  describe('Basic Directory Listing', () => {
    it('should list files in root directory', async () => {
      const result = await filesTool.execute({
        operation: 'list',
        path: tempDir,
      });

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        path: expect.any(String),
        count: expect.any(Number),
        files: expect.any(Array),
      });

      const files = result.data.files;
      expect(files.length).toBeGreaterThan(0);

      // Should include package.json
      const packageJson = files.find((f: any) => f.name === 'package.json');
      expect(packageJson).toMatchObject({
        name: 'package.json',
        path: expect.stringContaining('package.json'),
        relativePath: 'package.json',
        size: expect.any(Number),
        isDirectory: false,
        isFile: true,
      });
      expect(packageJson.modified).toBeDefined();
    });

    it('should list files in subdirectory', async () => {
      const result = await filesTool.execute({
        operation: 'list',
        path: join(tempDir, 'src'),
      });

      expect(result.success).toBe(true);
      const files = result.data.files;

      // Should include index.ts
      const indexFile = files.find((f: any) => f.name === 'index.ts');
      expect(indexFile).toMatchObject({
        name: 'index.ts',
        isFile: true,
      });
      // The relative path should just be the filename since we're listing the src directory
      expect(indexFile.relativePath).toBe('index.ts');
    });

    it('should list directories', async () => {
      const result = await filesTool.execute({
        operation: 'list',
        path: tempDir,
      });

      expect(result.success).toBe(true);
      const files = result.data.files;

      // Should include src directory
      const srcDir = files.find((f: any) => f.name === 'src');
      expect(srcDir).toMatchObject({
        name: 'src',
        isDirectory: true,
        isFile: false,
      });
    });
  });

  describe('Recursive Listing', () => {
    it('should list files recursively when recursive=true', async () => {
      const result = await filesTool.execute({
        operation: 'list',
        path: tempDir,
        recursive: true,
      });

      expect(result.success).toBe(true);
      const files = result.data.files;

      // Should include nested files
      const helperFile = files.find(
        (f: any) =>
          f.relativePath.includes('src/utils/helper.ts') ||
          f.relativePath.includes('src\\utils\\helper.ts')
      );
      expect(helperFile).toMatchObject({
        name: 'helper.ts',
        isFile: true,
      });

      const setupGuide = files.find(
        (f: any) =>
          f.relativePath.includes('docs/guides/setup.md') ||
          f.relativePath.includes('docs\\guides\\setup.md')
      );
      expect(setupGuide).toMatchObject({
        name: 'setup.md',
        isFile: true,
      });
    });

    it('should not list files recursively when recursive=false', async () => {
      const result = await filesTool.execute({
        operation: 'list',
        path: tempDir,
        recursive: false,
      });

      expect(result.success).toBe(true);
      const files = result.data.files;

      // Should not include nested files
      const helperFile = files.find(
        (f: any) =>
          f.relativePath.includes('src/utils/helper.ts') ||
          f.relativePath.includes('src\\utils\\helper.ts')
      );
      expect(helperFile).toBeUndefined();

      // But should include top-level files and directories
      const srcDir = files.find((f: any) => f.name === 'src');
      expect(srcDir).toBeDefined();
    });
  });

  describe('Hidden Files Handling', () => {
    it('should exclude hidden files by default', async () => {
      const result = await filesTool.execute({
        operation: 'list',
        path: tempDir,
      });

      expect(result.success).toBe(true);
      const files = result.data.files;

      const envFile = files.find((f: any) => f.name === '.env');
      const gitignoreFile = files.find((f: any) => f.name === '.gitignore');

      expect(envFile).toBeUndefined();
      expect(gitignoreFile).toBeUndefined();
    });

    it('should include hidden files when includeHidden=true', async () => {
      const result = await filesTool.execute({
        operation: 'list',
        path: tempDir,
        includeHidden: true,
      });

      expect(result.success).toBe(true);
      const files = result.data.files;

      const envFile = files.find((f: any) => f.name === '.env');
      const gitignoreFile = files.find((f: any) => f.name === '.gitignore');

      expect(envFile).toMatchObject({
        name: '.env',
        relativePath: '.env',
        isFile: true,
      });

      expect(gitignoreFile).toMatchObject({
        name: '.gitignore',
        relativePath: '.gitignore',
        isFile: true,
      });
    });
  });

  describe('Glob Pattern Matching', () => {
    it('should filter files using glob patterns', async () => {
      const result = await filesTool.execute({
        operation: 'list',
        path: tempDir,
        pattern: '**/*.ts',
        recursive: true,
      });

      expect(result.success).toBe(true);
      const files = result.data.files;

      // Should only include TypeScript files
      files.forEach((file: any) => {
        expect(file.name).toMatch(/\.ts$/);
      });

      // Should include specific TypeScript files
      const indexFile = files.find(
        (f: any) =>
          f.relativePath.includes('src/index.ts') || f.relativePath.includes('src\\index.ts')
      );
      const helperFile = files.find(
        (f: any) =>
          f.relativePath.includes('src/utils/helper.ts') ||
          f.relativePath.includes('src\\utils\\helper.ts')
      );

      expect(indexFile).toBeDefined();
      expect(helperFile).toBeDefined();

      // Should not include JavaScript files
      const jsFile = files.find((f: any) => f.name.endsWith('.js'));
      expect(jsFile).toBeUndefined();
    });

    it('should support multiple file extensions in pattern', async () => {
      const result = await filesTool.execute({
        operation: 'list',
        path: tempDir,
        pattern: '**/*.{ts,tsx,md}',
        recursive: true,
      });

      expect(result.success).toBe(true);
      const files = result.data.files;

      // Should include TypeScript, TSX, and Markdown files
      const hasTs = files.some((f: any) => f.name.endsWith('.ts'));
      const hasTsx = files.some((f: any) => f.name.endsWith('.tsx'));
      const hasMd = files.some((f: any) => f.name.endsWith('.md'));

      expect(hasTs).toBe(true);
      expect(hasTsx).toBe(true);
      expect(hasMd).toBe(true);

      // Should not include other file types
      const hasJs = files.some((f: any) => f.name.endsWith('.js'));
      const hasJson = files.some((f: any) => f.name.endsWith('.json'));

      expect(hasJs).toBe(false);
      expect(hasJson).toBe(false);
    });

    it('should support directory-specific patterns', async () => {
      const result = await filesTool.execute({
        operation: 'list',
        path: tempDir,
        pattern: 'src/**/*.ts',
        recursive: true,
      });

      expect(result.success).toBe(true);
      const files = result.data.files;

      // Should only include TypeScript files from src directory
      files.forEach((file: any) => {
        expect(file.relativePath).toMatch(/src[/\\].*\.ts$/);
      });

      // Should include specific files
      const indexFile = files.find(
        (f: any) =>
          f.relativePath.includes('src/index.ts') || f.relativePath.includes('src\\index.ts')
      );
      const helperFile = files.find(
        (f: any) =>
          f.relativePath.includes('src/utils/helper.ts') ||
          f.relativePath.includes('src\\utils\\helper.ts')
      );

      expect(indexFile).toBeDefined();
      expect(helperFile).toBeDefined();
    });
  });

  describe('File Metadata', () => {
    it('should include basic metadata by default', async () => {
      const result = await filesTool.execute({
        operation: 'list',
        path: tempDir,
      });

      expect(result.success).toBe(true);
      const files = result.data.files;
      const packageJson = files.find((f: any) => f.name === 'package.json');

      expect(packageJson).toMatchObject({
        name: 'package.json',
        path: expect.any(String),
        relativePath: 'package.json',
        size: expect.any(Number),
        isDirectory: false,
        isFile: true,
      });
      expect(packageJson.modified).toBeDefined();

      // Should not include extended metadata by default
      expect(packageJson.created).toBeUndefined();
      expect(packageJson.permissions).toBeUndefined();
    });

    it('should include extended metadata when includeMetadata=true', async () => {
      const result = await filesTool.execute({
        operation: 'list',
        path: tempDir,
        includeMetadata: true,
      });

      expect(result.success).toBe(true);
      const files = result.data.files;
      const packageJson = files.find((f: any) => f.name === 'package.json');

      expect(packageJson).toMatchObject({
        name: 'package.json',
        path: expect.any(String),
        relativePath: 'package.json',
        size: expect.any(Number),
        isDirectory: false,
        isFile: true,
        permissions: expect.any(String),
      });
      expect(packageJson.modified).toBeDefined();
      expect(packageJson.created).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should return error for non-existent directory', async () => {
      const result = await filesTool.execute({
        operation: 'list',
        path: join(tempDir, 'non-existent-directory'),
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/not found|cannot access|directory not found/i);
    });

    it('should validate workspace boundaries', async () => {
      const result = await filesTool.execute({
        operation: 'list',
        path: '../../../etc',
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/access denied|outside|workspace|path traversal/i);
    });

    it('should handle permission denied errors gracefully', async () => {
      // Create a directory with restricted permissions
      const restrictedDir = join(tempDir, 'restricted');
      await fs.mkdir(restrictedDir);
      await fs.chmod(restrictedDir, 0o000);

      try {
        const result = await filesTool.execute({
          operation: 'list',
          path: restrictedDir,
        });

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/permission denied|cannot read/i);
      } finally {
        // Restore permissions for cleanup
        await fs.chmod(restrictedDir, 0o755);
      }
    });
  });

  describe('Result Format', () => {
    it('should return properly formatted result', async () => {
      const result = await filesTool.execute({
        operation: 'list',
        path: join(tempDir, 'src'),
        pattern: '*.ts',
      });

      expect(result).toMatchObject({
        success: true,
        data: {
          files: expect.any(Array),
          path: expect.any(String),
          count: expect.any(Number),
          pattern: '*.ts',
        },
      });

      expect(result.data.count).toBe(result.data.files.length);
    });

    it('should handle empty directories', async () => {
      // Create an empty directory
      const emptyDir = join(tempDir, 'empty');
      await fs.mkdir(emptyDir);

      const result = await filesTool.execute({
        operation: 'list',
        path: emptyDir,
      });

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        files: [],
        count: 0,
        path: expect.stringContaining('empty'),
      });
    });
  });

  describe('Performance', () => {
    it('should handle large directory structures efficiently', async () => {
      // Create a larger directory structure
      const largeDir = join(tempDir, 'large');
      await fs.mkdir(largeDir);

      // Create 100 files in the directory
      for (let i = 0; i < 100; i++) {
        await fs.writeFile(join(largeDir, `file${i}.txt`), `Content ${i}`);
      }

      const startTime = Date.now();
      const result = await filesTool.execute({
        operation: 'list',
        path: largeDir,
      });
      const endTime = Date.now();

      expect(result.success).toBe(true);
      expect(result.data.files.length).toBe(100);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
    });
  });
});
