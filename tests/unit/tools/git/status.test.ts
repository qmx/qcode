import { describe, beforeEach, it, expect, jest } from '@jest/globals';
import { GitStatusTool } from '../../../../src/tools/git/status.js';
import { WorkspaceSecurity } from '../../../../src/security/workspace.js';

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

jest.mock('../../../../src/tools/git/base.js', () => ({
  GitBase: class MockGitBase {
    protected workspaceSecurity: any;
    protected workingDirectory: string;

    constructor(workspaceSecurity: any) {
      this.workspaceSecurity = workspaceSecurity;
      this.workingDirectory = '/test/workspace';
    }

    protected async executeGitCommand(args: string[]) {
      return mockExecuteGitCommand(args);
    }

    async isGitRepository() {
      return mockIsGitRepository();
    }
  },
}));

describe('GitStatusTool', () => {
  let gitStatusTool: GitStatusTool;
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

    // Create git status tool instance
    gitStatusTool = new GitStatusTool(mockWorkspaceSecurity);

    // Set up default mock implementations
    mockIsGitRepository.mockResolvedValue(true);
  });

  describe('Tool Definition', () => {
    it('should have correct tool metadata', () => {
      expect(gitStatusTool.namespace).toBe('internal');
      expect(gitStatusTool.name).toBe('git.status');
      expect(gitStatusTool.fullName).toBe('internal:git.status');
    });

    it('should have proper tool definition for LLM', () => {
      const definition = gitStatusTool.definition;

      expect(definition.name).toBe('git.status');
      expect(definition.description).toContain('git working directory status');
      expect(definition.parameters.type).toBe('object');
      expect(definition.parameters.properties).toHaveProperty('includeUntracked');
      expect(definition.parameters.properties).toHaveProperty('porcelain');
    });
  });

  describe('Working Directory Status Parsing', () => {
    it('should parse clean repository status correctly', async () => {
      const mockStatusOutput = 'On branch main\nnothing to commit, working tree clean\n';

      mockExecuteGitCommand.mockResolvedValue({
        exitCode: 0,
        stdout: mockStatusOutput,
        stderr: '',
        command: 'git',
        args: ['status'],
        duration: 100,
      });

      const result = await gitStatusTool.execute({});

      expect(result.success).toBe(true);
      expect(result.data?.isClean).toBe(true);
      expect(result.data?.modifiedFiles).toEqual([]);
      expect(result.data?.addedFiles).toEqual([]);
      expect(result.data?.deletedFiles).toEqual([]);
      expect(result.data?.untrackedFiles).toEqual([]);
      expect(result.data?.renamedFiles).toEqual([]);
      expect(result.data?.summary).toBe('Working directory is clean');

      expect(mockExecuteGitCommand).toHaveBeenCalledWith(['status']);
    });

    it('should parse modified files correctly', async () => {
      const mockStatusOutput = `On branch main
Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
\tmodified:   src/example.ts
\tmodified:   README.md
`;

      mockExecuteGitCommand.mockResolvedValue({
        exitCode: 0,
        stdout: mockStatusOutput,
        stderr: '',
        command: 'git',
        args: ['status'],
        duration: 100,
      });

      const result = await gitStatusTool.execute({});

      expect(result.success).toBe(true);
      expect(result.data?.isClean).toBe(false);
      expect(result.data?.modifiedFiles).toEqual(['src/example.ts', 'README.md']);
      expect(result.data?.summary).toContain('2 modified');
    });

    it('should parse added and deleted files correctly', async () => {
      const mockStatusOutput = `On branch main
Changes to be committed:
  (use "git restore --staged <file>..." to unstage)
\tnew file:   src/new-feature.ts
\tdeleted:    src/old-feature.ts
`;

      mockExecuteGitCommand.mockResolvedValue({
        exitCode: 0,
        stdout: mockStatusOutput,
        stderr: '',
        command: 'git',
        args: ['status'],
        duration: 100,
      });

      const result = await gitStatusTool.execute({});

      expect(result.success).toBe(true);
      expect(result.data?.isClean).toBe(false);
      expect(result.data?.addedFiles).toEqual(['src/new-feature.ts']);
      expect(result.data?.deletedFiles).toEqual(['src/old-feature.ts']);
      expect(result.data?.summary).toContain('1 added');
      expect(result.data?.summary).toContain('1 deleted');
    });

    it('should parse untracked files correctly', async () => {
      const mockStatusOutput = `On branch main
Untracked files:
  (use "git add <file>..." to include in what will be committed)
\ttemp.log
\tsrc/experimental.ts
`;

      mockExecuteGitCommand.mockResolvedValue({
        exitCode: 0,
        stdout: mockStatusOutput,
        stderr: '',
        command: 'git',
        args: ['status'],
        duration: 100,
      });

      const result = await gitStatusTool.execute({});

      expect(result.success).toBe(true);
      expect(result.data?.isClean).toBe(false);
      expect(result.data?.untrackedFiles).toEqual(['temp.log', 'src/experimental.ts']);
      expect(result.data?.summary).toContain('2 untracked');
    });

    it('should handle renamed files correctly', async () => {
      const mockStatusOutput = `On branch main
Changes to be committed:
  (use "git restore --staged <file>..." to unstage)
\trenamed:    old-name.ts -> new-name.ts
`;

      mockExecuteGitCommand.mockResolvedValue({
        exitCode: 0,
        stdout: mockStatusOutput,
        stderr: '',
        command: 'git',
        args: ['status'],
        duration: 100,
      });

      const result = await gitStatusTool.execute({});

      expect(result.success).toBe(true);
      expect(result.data?.isClean).toBe(false);
      expect(result.data?.renamedFiles).toEqual([
        { from: 'old-name.ts', to: 'new-name.ts' }
      ]);
      expect(result.data?.summary).toContain('1 renamed');
    });
  });

  describe('File Categorization and State Detection', () => {
    it('should categorize mixed file states correctly', async () => {
      const mockStatusOutput = `On branch main
Changes to be committed:
  (use "git restore --staged <file>..." to unstage)
\tnew file:   src/new.ts
\trenamed:    old.ts -> renamed.ts

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
\tmodified:   src/modified.ts
\tdeleted:    src/deleted.ts

Untracked files:
  (use "git add <file>..." to include in what will be committed)
\ttemp.log
`;

      mockExecuteGitCommand.mockResolvedValue({
        exitCode: 0,
        stdout: mockStatusOutput,
        stderr: '',
        command: 'git',
        args: ['status'],
        duration: 100,
      });

      const result = await gitStatusTool.execute({});

      expect(result.success).toBe(true);
      expect(result.data?.isClean).toBe(false);
      expect(result.data?.addedFiles).toEqual(['src/new.ts']);
      expect(result.data?.renamedFiles).toEqual([{ from: 'old.ts', to: 'renamed.ts' }]);
      expect(result.data?.modifiedFiles).toEqual(['src/modified.ts']);
      expect(result.data?.deletedFiles).toEqual(['src/deleted.ts']);
      expect(result.data?.untrackedFiles).toEqual(['temp.log']);
      expect(result.data?.summary).toMatch(/1 modified.*1 added.*1 deleted.*1 renamed.*1 untracked/);
    });

    it('should exclude untracked files when includeUntracked is false', async () => {
      const mockStatusOutput = `On branch main
Untracked files:
  (use "git add <file>..." to include in what will be committed)
\ttemp.log
\texample.txt
`;

      mockExecuteGitCommand.mockResolvedValue({
        exitCode: 0,
        stdout: mockStatusOutput,
        stderr: '',
        command: 'git',
        args: ['status'],
        duration: 100,
      });

      const result = await gitStatusTool.execute({ includeUntracked: false });

      expect(result.success).toBe(true);
      expect(result.data?.untrackedFiles).toEqual([]);
      expect(result.data?.isClean).toBe(true);
      expect(result.data?.summary).toBe('Working directory is clean');
    });
  });

  describe('Error Handling', () => {
    it('should handle non-git directory gracefully', async () => {
      mockIsGitRepository.mockResolvedValue(false);

      const result = await gitStatusTool.execute({});

      expect(result.success).toBe(false);
      expect(result.error).toContain('not a git repository');
    });

    it('should handle git command execution failure', async () => {
      mockExecuteGitCommand.mockResolvedValue({
        exitCode: 1,
        stdout: '',
        stderr: 'git: command failed\n',
        command: 'git',
        args: ['status'],
        duration: 75,
      });

      const result = await gitStatusTool.execute({});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to get git status');
    });

    it('should handle unexpected errors gracefully', async () => {
      mockExecuteGitCommand.mockRejectedValue(new Error('Unexpected error'));

      const result = await gitStatusTool.execute({});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Git status failed');
      expect(result.error).toContain('Unexpected error');
    });
  });
}); 