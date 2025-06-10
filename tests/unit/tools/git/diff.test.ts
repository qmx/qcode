import { GitDiffTool } from '../../../../src/tools/git/diff.js';
import { WorkspaceSecurity } from '../../../../src/security/workspace.js';
import { jest } from '@jest/globals';

// Mock the logger
jest.mock('../../../../src/utils/logger.js', () => ({
  getLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

// Mock the git base class methods
const mockExecuteGitCommand = jest.fn() as jest.MockedFunction<any>;
const mockIsGitRepository = jest.fn() as jest.MockedFunction<any>;
const mockSanitizeFilePaths = jest.fn() as jest.MockedFunction<any>;

jest.mock('../../../../src/tools/git/base.js', () => ({
  GitBase: class MockGitBase {
    protected workspaceSecurity: any;
    protected workingDirectory: string;

    constructor(workspaceSecurity: any, workingDirectory?: string) {
      this.workspaceSecurity = workspaceSecurity;
      this.workingDirectory = workingDirectory || '/test/workspace';
    }

    protected async executeGitCommand(args: string[]) {
      return mockExecuteGitCommand(args);
    }

    async isGitRepository(path?: string) {
      return mockIsGitRepository(path);
    }

    protected async sanitizeFilePaths(paths: string[]) {
      return mockSanitizeFilePaths(paths);
    }
  },
}));

describe('GitDiffTool', () => {
  let gitDiffTool: GitDiffTool;
  let mockWorkspaceSecurity: jest.Mocked<WorkspaceSecurity>;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create mock workspace security
    mockWorkspaceSecurity = {
      validateWorkspacePath: jest.fn(),
      validateReadPath: jest.fn(),
      validateWritePath: jest.fn(),
      validateDirectoryPath: jest.fn(),
    } as any;

    // Create git diff tool instance
    gitDiffTool = new GitDiffTool(mockWorkspaceSecurity);

    // Set up default mock implementations
    mockIsGitRepository.mockResolvedValue(true);
    mockSanitizeFilePaths.mockImplementation(async (paths: string[]) => paths);
  });

  describe('Tool Definition', () => {
    it('should have correct tool metadata', () => {
      expect(gitDiffTool.namespace).toBe('internal');
      expect(gitDiffTool.name).toBe('git.diff');
      expect(gitDiffTool.fullName).toBe('internal:git.diff');
    });

    it('should have proper tool definition for LLM', () => {
      const definition = gitDiffTool.definition;

      expect(definition.name).toBe('git.diff');
      expect(definition.description).toContain('working directory');
      expect(definition.parameters.type).toBe('object');
      expect(definition.parameters.properties).toHaveProperty('files');
      expect(definition.parameters.properties).toHaveProperty('contextLines');
      expect(definition.parameters.properties).toHaveProperty('ignoreWhitespace');
      expect(definition.parameters.properties).toHaveProperty('statsOnly');
    });
  });

  describe('Working Directory Diff Generation Accuracy', () => {
    it('should get working directory diff with changes', async () => {
      const mockDiffOutput = `
 src/file1.ts | 5 +++--
 src/file2.ts | 3 +--
 2 files changed, 4 insertions(+), 3 deletions(-)

diff --git a/src/file1.ts b/src/file1.ts
index abc123..def456 100644
--- a/src/file1.ts
+++ b/src/file1.ts
@@ -1,3 +1,4 @@
 export function test() {
+  console.log('debug');
   return true;
 }
`;

      mockExecuteGitCommand.mockResolvedValue({
        exitCode: 0,
        stdout: mockDiffOutput.trim(),
        stderr: '',
        command: 'git',
        args: ['diff', '--unified=3', '--stat'],
        duration: 100,
      });

      const result = await gitDiffTool.execute({
        contextLines: 3,
      });

      expect(result.success).toBe(true);
      expect(result.data.hasChanges).toBe(true);
      expect(result.data.filesChanged).toBe(2);
      expect(result.data.insertions).toBe(4);
      expect(result.data.deletions).toBe(3);
      expect(result.data.changedFiles).toContain('src/file1.ts');
      expect(result.data.changedFiles).toContain('src/file2.ts');
      expect(result.data.summary).toContain('2 files changed');

      expect(mockExecuteGitCommand).toHaveBeenCalledWith(['diff', '--unified=3', '--stat']);
    });

    it('should handle clean working directory', async () => {
      mockExecuteGitCommand.mockResolvedValue({
        exitCode: 0,
        stdout: '',
        stderr: '',
        command: 'git',
        args: ['diff', '--unified=3', '--stat'],
        duration: 50,
      });

      const result = await gitDiffTool.execute({});

      expect(result.success).toBe(true);
      expect(result.data.hasChanges).toBe(false);
      expect(result.data.summary).toBe('No changes in working directory');
      expect(result.data.filesChanged).toBe(0);
      expect(result.data.insertions).toBe(0);
      expect(result.data.deletions).toBe(0);
    });

    it('should parse statistics correctly from git output', async () => {
      const mockDiffOutput = `
 app/models/user.rb     | 15 ++++++++-------
 config/routes.rb       |  1 +
 spec/models/user_spec.rb |  8 +++-----
 3 files changed, 12 insertions(+), 11 deletions(-)
`;

      mockExecuteGitCommand.mockResolvedValue({
        exitCode: 0,
        stdout: mockDiffOutput.trim(),
        stderr: '',
        command: 'git',
        args: ['diff', '--unified=3', '--stat'],
        duration: 75,
      });

      const result = await gitDiffTool.execute({});

      expect(result.success).toBe(true);
      expect(result.data.filesChanged).toBe(3);
      expect(result.data.insertions).toBe(12);
      expect(result.data.deletions).toBe(11);
      expect(result.data.changedFiles).toHaveLength(3);
      expect(result.data.changedFiles).toContain('app/models/user.rb');
      expect(result.data.changedFiles).toContain('config/routes.rb');
      expect(result.data.changedFiles).toContain('spec/models/user_spec.rb');
    });
  });

  describe('File Filtering and Path Sanitization', () => {
    it('should include specific files in diff', async () => {
      mockSanitizeFilePaths.mockResolvedValue(['src/auth.ts', 'src/user.ts']);
      mockExecuteGitCommand.mockResolvedValue({
        exitCode: 0,
        stdout: 'diff output for specific files',
        stderr: '',
        command: 'git',
        args: ['diff', '--unified=3', '--stat', '--', 'src/auth.ts', 'src/user.ts'],
        duration: 75,
      });

      await gitDiffTool.execute({
        files: ['src/auth.ts', 'src/user.ts'],
      });

      expect(mockSanitizeFilePaths).toHaveBeenCalledWith(['src/auth.ts', 'src/user.ts']);
      expect(mockExecuteGitCommand).toHaveBeenCalledWith([
        'diff',
        '--unified=3',
        '--stat',
        '--',
        'src/auth.ts',
        'src/user.ts',
      ]);
    });

    it('should handle empty file list by not adding path filter', async () => {
      mockExecuteGitCommand.mockResolvedValue({
        exitCode: 0,
        stdout: '',
        stderr: '',
        command: 'git',
        args: ['diff', '--unified=3', '--stat'],
        duration: 60,
      });

      await gitDiffTool.execute({
        files: [],
      });

      expect(mockExecuteGitCommand).toHaveBeenCalledWith(['diff', '--unified=3', '--stat']);
    });

    it('should skip invalid paths from sanitization', async () => {
      // Simulate sanitizeFilePaths filtering out invalid paths
      mockSanitizeFilePaths.mockResolvedValue(['src/valid.ts']);
      mockExecuteGitCommand.mockResolvedValue({
        exitCode: 0,
        stdout: '',
        stderr: '',
        command: 'git',
        args: ['diff', '--unified=3', '--stat', '--', 'src/valid.ts'],
        duration: 60,
      });

      await gitDiffTool.execute({
        files: ['src/valid.ts', '../outside/workspace.ts'],
      });

      expect(mockSanitizeFilePaths).toHaveBeenCalledWith(['src/valid.ts', '../outside/workspace.ts']);
      expect(mockExecuteGitCommand).toHaveBeenCalledWith([
        'diff',
        '--unified=3',
        '--stat',
        '--',
        'src/valid.ts',
      ]);
    });
  });

  describe('Context Line and Whitespace Options', () => {
    it('should use custom context lines', async () => {
      mockExecuteGitCommand.mockResolvedValue({
        exitCode: 0,
        stdout: '',
        stderr: '',
        command: 'git',
        args: ['diff', '--unified=5', '--stat'],
        duration: 60,
      });

      await gitDiffTool.execute({
        contextLines: 5,
      });

      expect(mockExecuteGitCommand).toHaveBeenCalledWith(['diff', '--unified=5', '--stat']);
    });

    it('should handle ignore whitespace option', async () => {
      mockExecuteGitCommand.mockResolvedValue({
        exitCode: 0,
        stdout: '',
        stderr: '',
        command: 'git',
        args: ['diff', '--unified=3', '--ignore-all-space', '--stat'],
        duration: 60,
      });

      await gitDiffTool.execute({
        ignoreWhitespace: true,
      });

      expect(mockExecuteGitCommand).toHaveBeenCalledWith([
        'diff',
        '--unified=3',
        '--ignore-all-space',
        '--stat',
      ]);
    });

    it('should handle stats only mode', async () => {
      const mockStatsOutput = `
 src/auth.ts | 10 ++++++++++
 1 file changed, 10 insertions(+)
`;

      mockExecuteGitCommand.mockResolvedValue({
        exitCode: 0,
        stdout: mockStatsOutput.trim(),
        stderr: '',
        command: 'git',
        args: ['diff', '--unified=3', '--stat'],
        duration: 40,
      });

      const result = await gitDiffTool.execute({
        statsOnly: true,
      });

      expect(result.success).toBe(true);
      expect(result.data.diff).toBe(''); // Should be empty in stats-only mode
      expect(result.data.summary).toContain('1 file changed');
    });

    it('should validate context lines parameter', async () => {
      mockExecuteGitCommand.mockResolvedValue({
        exitCode: 0,
        stdout: '',
        stderr: '',
        command: 'git',
        args: ['diff', '--unified=0', '--stat'],
        duration: 30,
      });

      // Test minimum context lines
      await gitDiffTool.execute({
        contextLines: 0,
      });

      expect(mockExecuteGitCommand).toHaveBeenCalledWith(['diff', '--unified=0', '--stat']);
    });
  });

  describe('Error Handling', () => {
    it('should fail when not in git repository', async () => {
      mockIsGitRepository.mockResolvedValue(false);

      const result = await gitDiffTool.execute({});

      expect(result.success).toBe(false);
      expect(result.error).toContain('not a git repository');
    });

    it('should handle git command failures', async () => {
      mockExecuteGitCommand.mockResolvedValue({
        exitCode: 1,
        stdout: '',
        stderr: 'fatal: not a git repository',
        command: 'git',
        args: ['diff'],
        duration: 30,
      });

      const result = await gitDiffTool.execute({});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to get git diff');
    });

    it('should handle git command exceptions', async () => {
      mockExecuteGitCommand.mockRejectedValue(new Error('Git command failed'));

      const result = await gitDiffTool.execute({});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Git diff failed');
    });
  });

  describe('Parameter Validation', () => {
    it('should handle default parameters', async () => {
      mockExecuteGitCommand.mockResolvedValue({
        exitCode: 0,
        stdout: '',
        stderr: '',
        command: 'git',
        args: ['diff', '--unified=3', '--stat'],
        duration: 50,
      });

      await gitDiffTool.execute({});

      expect(mockExecuteGitCommand).toHaveBeenCalledWith(['diff', '--unified=3', '--stat']);
    });

    it('should convert string parameters to correct types', async () => {
      mockExecuteGitCommand.mockResolvedValue({
        exitCode: 0,
        stdout: '',
        stderr: '',
        command: 'git',
        args: ['diff', '--unified=7', '--stat'],
        duration: 50,
      });

      // Test that string numbers are coerced to numbers
      await gitDiffTool.execute({
        contextLines: '7',
        ignoreWhitespace: 'true',
      });

      expect(mockExecuteGitCommand).toHaveBeenCalledWith([
        'diff',
        '--unified=7',
        '--ignore-all-space',
        '--stat',
      ]);
    });
  });
}); 