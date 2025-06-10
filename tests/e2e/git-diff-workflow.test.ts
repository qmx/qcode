/**
 * VCR tests for Git Diff workflow operations
 * Tests the git diff tool integration with recorded Ollama interactions
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import path from 'path';
import fs from 'fs/promises';
import { execSync } from 'child_process';
import { QCodeEngine } from '../../src/core/engine.js';
import { OllamaClient } from '../../src/core/client.js';
import { ToolRegistry } from '../../src/core/registry.js';
import { GitDiffTool } from '../../src/tools/git/diff.js';
import { WorkspaceSecurity } from '../../src/security/workspace.js';
import { getDefaultConfig } from '../../src/config/defaults.js';
import { setupVCRTests } from '../helpers/vcr-helper.js';

describe('Git Diff Workflow Operations (VCR)', () => {
  let engine: QCodeEngine;
  const vcr = setupVCRTests(__filename);
  let testProjectPath: string;
  let originalCwd: string;

  beforeAll(async () => {
    originalCwd = process.cwd();
    
    // Create a temporary test project with git repository
    testProjectPath = path.join(__dirname, '../fixtures/git-test-project');
    await fs.mkdir(testProjectPath, { recursive: true });
    
    // Initialize git repository
    process.chdir(testProjectPath);
    execSync('git init', { stdio: 'pipe' });
    execSync('git config user.email "test@example.com"', { stdio: 'pipe' });
    execSync('git config user.name "Test User"', { stdio: 'pipe' });
    
         // Create initial files and commit
     await fs.mkdir(path.join(testProjectPath, 'src'), { recursive: true });
     await fs.writeFile(
       path.join(testProjectPath, 'README.md'),
       '# Test Project\n\nInitial content for testing git diff functionality.\n'
     );
     await fs.writeFile(
       path.join(testProjectPath, 'src/auth.ts'),
       'export function authenticate(token: string): boolean {\n  return token.length > 0;\n}\n'
     );
    execSync('git add .', { stdio: 'pipe' });
    execSync('git commit -m "Initial commit"', { stdio: 'pipe' });

    // Set up engine configuration
    const config = getDefaultConfig();
    config.workingDirectory = testProjectPath;

    const ollamaClient = new OllamaClient({ ...config.ollama, retries: 0 });
    const workspaceSecurity = new WorkspaceSecurity(config.security, testProjectPath);
    const toolRegistry = new ToolRegistry(config.security, testProjectPath);

    // Register git diff tool
    const gitDiffTool = new GitDiffTool(workspaceSecurity);
    toolRegistry.registerInternalTool(
      'git.diff',
      gitDiffTool.definition,
      gitDiffTool.execute.bind(gitDiffTool)
    );

    // Initialize QCode engine
    engine = new QCodeEngine(ollamaClient, toolRegistry, config, {
      workingDirectory: testProjectPath,
      enableStreaming: false,
      debug: false,
    });
  });

  afterAll(async () => {
    process.chdir(originalCwd);
    
    // Clean up test project
    try {
      await fs.rm(testProjectPath, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Working Directory Changes', () => {
    it('should show what I\'ve changed', async () => {
      await vcr.withRecording('git_diff_show_changes', async () => {
        // Make some changes to files
        await fs.writeFile(
          path.join(testProjectPath, 'src/auth.ts'),
          `export function authenticate(token: string): boolean {
  if (!token) {
    throw new Error('Token is required');
  }
  return validateToken(token);
}

function validateToken(token: string): boolean {
  return token.length > 10;
}
`
        );

        await fs.writeFile(
          path.join(testProjectPath, 'README.md'),
          `# Test Project

This is a test project for git diff functionality.

## Features
- Authentication system
- User management
`
        );

        const result = await engine.processQuery("show me what I've changed");

        expect(result.complete).toBe(true);
        expect(result.response).toContain('changed');
        expect(result.toolsExecuted).toContain('internal:git.diff');

        // Verify tool results
        const gitDiffResult = result.toolResults?.find(r => r.tool === 'git.diff');
        expect(gitDiffResult).toBeDefined();
        expect(gitDiffResult?.success).toBe(true);
        
        if (gitDiffResult?.data.hasChanges) {
          expect(gitDiffResult.data.changedFiles.length).toBeGreaterThan(0);
        }

        vcr.recordingLog('✓ Git diff show changes completed');
        vcr.recordingLog('✓ Response contains change information');
      });
    }, 30000);

    it('should display diff for specific files', async () => {
      await vcr.withRecording('git_diff_specific_files', async () => {
        const result = await engine.processQuery("show me changes in src/auth.ts");

        expect(result.complete).toBe(true);
        expect(result.response).toContain('auth.ts');
        expect(result.toolsExecuted).toContain('internal:git.diff');

        vcr.recordingLog('✓ Specific file diff completed');
        vcr.recordingLog('✓ Response focuses on auth.ts');
      });
    }, 30000);

    it('should handle when there are no changes', async () => {
      await vcr.withRecording('git_diff_no_changes', async () => {
        // Commit all changes first to have a clean working directory
        execSync('git add .', { cwd: testProjectPath, stdio: 'pipe' });
        execSync('git commit -m "Commit test changes"', { cwd: testProjectPath, stdio: 'pipe' });

        const result = await engine.processQuery("what are my current modifications?");

        expect(result.complete).toBe(true);
        expect(result.response.toLowerCase()).toMatch(/clean|no changes|nothing|up to date|no modifications|no current modifications/);
        expect(result.toolsExecuted).toContain('internal:git.diff');

        // Verify tool detected no changes
        const gitDiffResult = result.toolResults?.find(r => r.tool === 'git.diff');
        expect(gitDiffResult).toBeDefined();
        expect(gitDiffResult?.success).toBe(true);
        expect(gitDiffResult?.data.hasChanges).toBe(false);

        vcr.recordingLog('✓ Clean working directory detected');
        vcr.recordingLog('✓ No changes reported correctly');
      });
    }, 30000);
  });

  describe('Git Diff Options', () => {
    it('should handle requests for diff with context options', async () => {
      await vcr.withRecording('git_diff_with_context', async () => {
        // Make a small change to test context lines
        await fs.writeFile(
          path.join(testProjectPath, 'src/utils.ts'),
          `export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function formatTime(date: Date): string {
  return date.toTimeString().split(' ')[0];
}

export function getCurrentTimestamp(): string {
  const now = new Date();
  return \`\${formatDate(now)} \${formatTime(now)}\`;
}
`
        );

        const result = await engine.processQuery("show me the changes with more context lines");

        expect(result.complete).toBe(true);
        expect(result.response).toContain('changes');
        expect(result.toolsExecuted).toContain('internal:git.diff');

        vcr.recordingLog('✓ Context lines diff completed');
        vcr.recordingLog('✓ Response includes context information');
      });
    }, 30000);

    it('should provide statistics about changes', async () => {
      await vcr.withRecording('git_diff_statistics', async () => {
        const result = await engine.processQuery("give me statistics about my current changes");

        expect(result.complete).toBe(true);
        expect(result.response).toMatch(/files? changed|insertions?|deletions?|statistics/);
        expect(result.toolsExecuted).toContain('internal:git.diff');

        // Verify statistics in tool results
        const gitDiffResult = result.toolResults?.find(r => r.tool === 'git.diff');
        expect(gitDiffResult).toBeDefined();
        expect(gitDiffResult?.success).toBe(true);

        if (gitDiffResult?.data.hasChanges) {
          expect(gitDiffResult.data.summary).toContain('changed');
          expect(typeof gitDiffResult.data.filesChanged).toBe('number');
          expect(typeof gitDiffResult.data.insertions).toBe('number');
          expect(typeof gitDiffResult.data.deletions).toBe('number');
        }

        vcr.recordingLog('✓ Statistics diff completed');
        vcr.recordingLog('✓ Response includes statistical information');
      });
    }, 30000);
  });

  describe('Error Handling', () => {
    it('should handle non-git directories gracefully', async () => {
      await vcr.withRecording('git_diff_non_git_directory', async () => {
        // Create a separate non-git directory for this test
        const nonGitPath = path.join(__dirname, '../fixtures/non-git-test');
        await fs.mkdir(nonGitPath, { recursive: true });

        // Set up engine with non-git workspace
        const config = getDefaultConfig();
        config.workingDirectory = nonGitPath;

        const ollamaClient = new OllamaClient({ ...config.ollama, retries: 0 });
        const workspaceSecurity = new WorkspaceSecurity(config.security, nonGitPath);
        const toolRegistry = new ToolRegistry(config.security, nonGitPath);

        const gitDiffTool = new GitDiffTool(workspaceSecurity);
        toolRegistry.registerInternalTool(
          'git.diff',
          gitDiffTool.definition,
          gitDiffTool.execute.bind(gitDiffTool)
        );

        const nonGitEngine = new QCodeEngine(ollamaClient, toolRegistry, config, {
          workingDirectory: nonGitPath,
          enableStreaming: false,
          debug: false,
        });

        const result = await nonGitEngine.processQuery("show me what I've changed");

        expect(result.complete).toBe(true);

        // The git.diff tool should either report an error or succeed with no changes
        const gitDiffResult = result.toolResults?.find(r => r.tool === 'git.diff');
        if (gitDiffResult) {
          // Git diff tool may gracefully handle non-git directories by reporting no changes
          if (gitDiffResult.success === false) {
            expect(gitDiffResult.error).toContain('not a git repository');
          } else {
            // Or it may succeed but report no changes
            expect(gitDiffResult.data.hasChanges).toBe(false);
          }
        }

        vcr.recordingLog('✓ Non-git directory handled gracefully');
        vcr.recordingLog('✓ Appropriate error response provided');

        // Cleanup
        await fs.rm(nonGitPath, { recursive: true, force: true });
      });
    }, 30000);

    it('should provide helpful guidance when git operations fail', async () => {
      await vcr.withRecording('git_diff_error_guidance', async () => {
        const result = await engine.processQuery("show me the git diff for files that don't exist");

        expect(result.complete).toBe(true);
        expect(result.response).toBeDefined();
        expect(typeof result.response).toBe('string');

        vcr.recordingLog('✓ Error guidance provided');
        vcr.recordingLog('✓ Graceful handling of problematic requests');
      });
    }, 30000);
  });
}); 