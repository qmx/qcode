import { EditTool } from '../../src/tools/edit.js';
import { WorkspaceSecurity } from '../../src/security/workspace.js';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdtemp } from 'fs/promises';

describe('EditTool', () => {
  let editTool: EditTool;
  let workspaceSecurity: WorkspaceSecurity;
  let testDir: string;

  beforeEach(async () => {
    // Create a temporary directory for testing
    testDir = await mkdtemp(join(tmpdir(), 'qcode-edit-test-'));

    // Create WorkspaceSecurity with the test directory
    const securityConfig = {
      workspace: {
        allowedPaths: [testDir],
        forbiddenPatterns: [],
        allowOutsideWorkspace: false,
      },
      commands: {
        allowedCommands: [],
        forbiddenPatterns: [],
        allowArbitraryCommands: false,
      },
    };

    workspaceSecurity = new WorkspaceSecurity(securityConfig, testDir);
    editTool = new EditTool(workspaceSecurity);
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Basic Structure', () => {
    it('should have correct namespace and name', () => {
      expect(editTool.namespace).toBe('internal');
      expect(editTool.name).toBe('edit');
      expect(editTool.fullName).toBe('internal.edit');
    });

    it('should provide a valid tool definition', () => {
      const definition = editTool.definition;
      expect(definition).toBeDefined();
      expect(definition.name).toBe('internal.edit');
      expect(definition.description).toContain('SURGICAL FILE EDITING TOOL');
      expect(definition.parameters).toBeDefined();
      // The zodToJsonSchema might create a different structure
      expect(typeof definition.parameters).toBe('object');
    });
  });

  describe('Insert Line Operation', () => {
    it('should insert a line at the specified position', async () => {
      // Create test file
      const testFile = join(testDir, 'test.txt');
      const originalContent = 'line 1\nline 2\nline 3\n';
      await fs.writeFile(testFile, originalContent);

      // Insert line at position 2
      const result = await editTool.execute({
        operation: 'insert_line',
        file: 'test.txt',
        line_number: 2,
        content: 'inserted line',
      });

      expect(result.success).toBe(true);
      expect(result.data.operation).toBe('insert_line');
      expect(result.data.line_number).toBe(2);

      // Verify file content
      const newContent = await fs.readFile(testFile, 'utf8');
      const expectedContent = 'line 1\ninserted line\nline 2\nline 3\n';
      expect(newContent).toBe(expectedContent);
    });

    it('should handle inserting at the end of file', async () => {
      // Create test file
      const testFile = join(testDir, 'test.txt');
      const originalContent = 'line 1\nline 2';
      await fs.writeFile(testFile, originalContent);

      // Insert line at the end (position 3)
      const result = await editTool.execute({
        operation: 'insert_line',
        file: 'test.txt',
        line_number: 3,
        content: 'new last line',
      });

      expect(result.success).toBe(true);

      // Verify file content
      const newContent = await fs.readFile(testFile, 'utf8');
      const expectedContent = 'line 1\nline 2\nnew last line';
      expect(newContent).toBe(expectedContent);
    });
  });

  describe('Replace Text Operation', () => {
    it('should replace text using simple string matching', async () => {
      // Create test file
      const testFile = join(testDir, 'test.js');
      const originalContent = 'function getUserData() {\n  return userData;\n}';
      await fs.writeFile(testFile, originalContent);

      // Replace function name
      const result = await editTool.execute({
        operation: 'replace',
        file: 'test.js',
        search: 'getUserData',
        replace: 'fetchUserProfile',
        regex: false,
        global: true,
      });

      expect(result.success).toBe(true);
      expect(result.data.operation).toBe('replace');
      expect(result.data.matches_found).toBe(1);

      // Verify file content
      const newContent = await fs.readFile(testFile, 'utf8');
      expect(newContent).toContain('fetchUserProfile');
      expect(newContent).not.toContain('getUserData');
    });

    it('should replace text using regex patterns', async () => {
      // Create test file
      const testFile = join(testDir, 'test.js');
      const originalContent = 'var x = 1;\nvar y = 2;\nlet z = 3;';
      await fs.writeFile(testFile, originalContent);

      // Replace all 'var' with 'const'
      const result = await editTool.execute({
        operation: 'replace',
        file: 'test.js',
        search: '\\bvar\\b',
        replace: 'const',
        regex: true,
        global: true,
      });

      expect(result.success).toBe(true);
      expect(result.data.matches_found).toBe(2);

      // Verify file content
      const newContent = await fs.readFile(testFile, 'utf8');
      expect(newContent).toBe('const x = 1;\nconst y = 2;\nlet z = 3;');
    });
  });

  describe('Create File Operation', () => {
    it('should create a new file with content', async () => {
      const testFile = join(testDir, 'new-file.js');

      const result = await editTool.execute({
        operation: 'create_file',
        file: 'new-file.js',
        content: 'export default function MyComponent() {\n  return <div>Hello</div>;\n}',
        create_directories: true,
      });

      expect(result.success).toBe(true);
      expect(result.data.operation).toBe('create_file');

      // Verify file was created with correct content
      const content = await fs.readFile(testFile, 'utf8');
      expect(content).toContain('MyComponent');
      expect(content).toContain('Hello');
    });

    it('should create directories when needed', async () => {
      const testFile = join(testDir, 'src', 'components', 'Button.js');

      const result = await editTool.execute({
        operation: 'create_file',
        file: 'src/components/Button.js',
        content: 'export const Button = () => <button>Click me</button>;',
        create_directories: true,
      });

      expect(result.success).toBe(true);

      // Verify file and directories were created
      expect(
        await fs
          .access(testFile)
          .then(() => true)
          .catch(() => false)
      ).toBe(true);
      const content = await fs.readFile(testFile, 'utf8');
      expect(content).toContain('Button');
    });

    it('should fail if file already exists', async () => {
      const testFile = join(testDir, 'existing.txt');
      await fs.writeFile(testFile, 'existing content');

      await expect(
        editTool.execute({
          operation: 'create_file',
          file: 'existing.txt',
          content: 'new content',
        })
      ).rejects.toThrow('file-exists');
    });
  });

  describe('Delete Lines Operation', () => {
    it('should delete a range of lines', async () => {
      // Create test file
      const testFile = join(testDir, 'test.txt');
      const originalContent = 'line 1\nline 2\nline 3\nline 4\nline 5';
      await fs.writeFile(testFile, originalContent);

      // Delete lines 2-4
      const result = await editTool.execute({
        operation: 'delete_lines',
        file: 'test.txt',
        start_line: 2,
        end_line: 4,
      });

      expect(result.success).toBe(true);
      expect(result.data.lines_deleted).toBe(3);

      // Verify file content
      const newContent = await fs.readFile(testFile, 'utf8');
      expect(newContent).toBe('line 1\nline 5');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid operation types', async () => {
      await expect(
        editTool.execute({
          operation: 'invalid_operation',
          file: 'test.txt',
        })
      ).rejects.toThrow('invalid-params');
    });

    it('should handle security violations', async () => {
      await expect(
        editTool.execute({
          operation: 'create_file',
          file: '../outside-workspace.txt',
          content: 'malicious content',
        })
      ).rejects.toThrow();
    });

    it('should handle invalid line numbers', async () => {
      const testFile = join(testDir, 'test.txt');
      await fs.writeFile(testFile, 'line 1\nline 2');

      await expect(
        editTool.execute({
          operation: 'insert_line',
          file: 'test.txt',
          line_number: 10, // Beyond file length
          content: 'new line',
        })
      ).rejects.toThrow('invalid-line-number');
    });
  });


});
