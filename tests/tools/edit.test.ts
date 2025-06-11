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
      permissions: {
        allow: [
          'Shell(echo *)',
        ],
        deny: [
          'Shell(rm *)',
        ],
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

  describe('Diff Operations (1.7.10 Features)', () => {
    describe('apply_diff operation', () => {
      it('should apply a simple unified diff successfully', async () => {
        const testFile = join(testDir, 'diff-test.js');
        const originalContent = `function test() {
  return true;
}`;
        await fs.writeFile(testFile, originalContent);

        const diff = `--- a/diff-test.js
+++ b/diff-test.js
@@ -1,3 +1,4 @@
 function test() {
+  console.log('debug');
   return true;
 }`;

        const result = await editTool.execute({
          operation: 'apply_diff',
          file: 'diff-test.js',
          diff: diff,
        });

        expect(result.success).toBe(true);
        expect(result.data.operation).toBe('apply_diff');
        expect(result.data.applied).toBe(true);
        expect(result.data.diff_hunks).toBe(1);

        const newContent = await fs.readFile(testFile, 'utf8');
        expect(newContent).toContain("console.log('debug');");
        expect(newContent).toContain('function test()');
        expect(newContent).toContain('return true;');
      });

      it('should apply a simple hunk diff (@@-style) successfully', async () => {
        const testFile = join(testDir, 'simple-diff.js');
        const originalContent = `function calculate() {
  let result = 0;
  return result;
}`;
        await fs.writeFile(testFile, originalContent);

        // Use a simpler diff that should definitely work
        const simpleDiff = `@@ -1,4 +1,5 @@
 function calculate() {
   let result = 0;
+  result = 42;
   return result;
 }`;

        const result = await editTool.execute({
          operation: 'apply_diff',
          file: 'simple-diff.js',
          diff: simpleDiff,
        });

        expect(result.success).toBe(true);
        expect(result.data.applied).toBe(true);

        const newContent = await fs.readFile(testFile, 'utf8');
        expect(newContent).toContain('result = 42;');
        expect(newContent).toContain('let result = 0;');
        expect(newContent).toContain('return result;');
      });

      it('should handle multiple line additions and deletions', async () => {
        const testFile = join(testDir, 'multi-diff.js');
        const originalContent = `function oldFunction() {
  var x = 1;
  var y = 2;
  return x + y;
}`;
        await fs.writeFile(testFile, originalContent);

        const diff = `@@ -1,5 +1,5 @@
-function oldFunction() {
-  var x = 1;
-  var y = 2;
+function newFunction() {
+  const x = 1;
+  const y = 2;
   return x + y;
 }`;

        const result = await editTool.execute({
          operation: 'apply_diff',
          file: 'multi-diff.js',
          diff: diff,
        });

        expect(result.success).toBe(true);
        const newContent = await fs.readFile(testFile, 'utf8');
        expect(newContent).toContain('function newFunction()');
        expect(newContent).toContain('const x = 1;');
        expect(newContent).toContain('const y = 2;');
        expect(newContent).not.toContain('var x = 1;');
      });

      it('should reject invalid diff formats', async () => {
        const testFile = join(testDir, 'invalid-diff.js');
        await fs.writeFile(testFile, 'function test() { return true; }');

        await expect(
          editTool.execute({
            operation: 'apply_diff',
            file: 'invalid-diff.js',
            diff: 'this is not a valid diff',
            validate: true,
          })
        ).rejects.toThrow('invalid-diff-format');
      });

      it('should handle diff context mismatches gracefully', async () => {
        const testFile = join(testDir, 'mismatch-diff.js');
        await fs.writeFile(testFile, 'function test() { return false; }');

        const diff = `@@ -1,1 +1,2 @@
 function test() { return true; }
+console.log('added');`;

        await expect(
          editTool.execute({
            operation: 'apply_diff',
            file: 'mismatch-diff.js',
            diff: diff,
          })
        ).rejects.toThrow(); // Either diff-apply-failed or diff-context-mismatch, both are valid
      });

      it('should validate text content when requested', async () => {
        const testFile = join(testDir, 'validation-test.js');
        await fs.writeFile(testFile, 'function test() { return true; }');

        const diff = `@@ -1,1 +1,2 @@
 function test() { return true; }
+const binaryData = "\\0\\0\\0";`;

        await expect(
          editTool.execute({
            operation: 'apply_diff',
            file: 'validation-test.js',
            diff: diff,
            validate: true,
          })
        ).rejects.toThrow('binary-content-detected');
      });

      it('should skip format validation when disabled but still parse diffs', async () => {
        const testFile = join(testDir, 'no-validation-test.js');
        await fs.writeFile(testFile, 'function test() { return true; }');

        // A diff that would work but might fail format validation
        const validDiff = `@@ -1,1 +1,2 @@
 function test() { return true; }
+console.log('added');`;

        const result = await editTool.execute({
          operation: 'apply_diff',
          file: 'no-validation-test.js',
          diff: validDiff,
          validate: false,
        });

        expect(result.success).toBe(true);
        const newContent = await fs.readFile(testFile, 'utf8');
        expect(newContent).toContain("console.log('added');");
      });
    });

    describe('Enhanced line editing with validation', () => {
      it('should apply smart indentation when inserting lines', async () => {
        const testFile = join(testDir, 'indent-test.js');
        const originalContent = `function test() {
  if (true) {
    console.log('existing');
  }
}`;
        await fs.writeFile(testFile, originalContent);

        const result = await editTool.execute({
          operation: 'insert_line',
          file: 'indent-test.js',
          line_number: 3, // Between the if statement and console.log
          content: "console.log('new line');",
        });

        expect(result.success).toBe(true);
        expect(result.data.indentation_applied).toBe(true);

        const newContent = await fs.readFile(testFile, 'utf8');
        const lines = newContent.split('\n');

        // Check that the inserted line has the same indentation as surrounding lines
        expect(lines[2]).toMatch(/^\s{4}console\.log\('new line'\);/);
      });

      it('should preserve existing indentation when content has whitespace', async () => {
        const testFile = join(testDir, 'preserve-indent.js');
        await fs.writeFile(testFile, 'function test() {\n  existing line\n}');

        const result = await editTool.execute({
          operation: 'insert_line',
          file: 'preserve-indent.js',
          line_number: 2,
          content: '    custom indented line', // Pre-indented content
        });

        expect(result.success).toBe(true);
        expect(result.data.indentation_applied).toBe(false);

        const newContent = await fs.readFile(testFile, 'utf8');
        expect(newContent).toContain('    custom indented line');
      });

      it('should reject line content with line breaks', async () => {
        const testFile = join(testDir, 'line-break-test.js');
        await fs.writeFile(testFile, 'function test() { return true; }');

        await expect(
          editTool.execute({
            operation: 'insert_line',
            file: 'line-break-test.js',
            line_number: 1,
            content: 'line 1\nline 2',
          })
        ).rejects.toThrow('invalid-line-content');
      });

      it('should reject excessively long lines', async () => {
        const testFile = join(testDir, 'long-line-test.js');
        await fs.writeFile(testFile, 'function test() { return true; }');

        const longContent = 'x'.repeat(1001); // Exceeds 1000 character limit

        await expect(
          editTool.execute({
            operation: 'insert_line',
            file: 'long-line-test.js',
            line_number: 1,
            content: longContent,
          })
        ).rejects.toThrow('line-too-long');
      });

      it('should preserve line endings from original file', async () => {
        const testFile = join(testDir, 'line-ending-test.js');
        const windowsContent = 'function test() {\r\n  return true;\r\n}';
        await fs.writeFile(testFile, windowsContent);

        await editTool.execute({
          operation: 'insert_line',
          file: 'line-ending-test.js',
          line_number: 2,
          content: "  console.log('debug');",
        });

        const newContent = await fs.readFile(testFile, 'utf8');
        // Should preserve CRLF line endings
        expect(newContent).toContain('\r\n');
        expect(newContent.split('\r\n')).toHaveLength(4); // Original 3 + 1 inserted
      });
    });

    describe('Text validation utilities', () => {
      it('should detect and preserve Windows line endings', async () => {
        const testFile = join(testDir, 'windows-line-endings.txt');
        const windowsContent = 'line 1\r\nline 2\r\nline 3';
        await fs.writeFile(testFile, windowsContent);

        await editTool.execute({
          operation: 'replace',
          file: 'windows-line-endings.txt',
          search: 'line 2',
          replace: 'modified line 2',
        });

        const newContent = await fs.readFile(testFile, 'utf8');
        expect(newContent).toContain('\r\n');
        expect(newContent).toContain('modified line 2');
      });

      it('should handle mixed line endings gracefully', async () => {
        const testFile = join(testDir, 'mixed-endings.txt');
        const mixedContent = 'unix line\nmac line\rwindows line\r\n';
        await fs.writeFile(testFile, mixedContent);

        const result = await editTool.execute({
          operation: 'insert_line',
          file: 'mixed-endings.txt',
          line_number: 2,
          content: 'inserted line',
        });

        expect(result.success).toBe(true);

        const newContent = await fs.readFile(testFile, 'utf8');
        expect(newContent).toContain('inserted line');
      });
    });
  });
});
