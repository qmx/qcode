/**
 * VCR tests for Git Status workflow operations
 * Tests the git status tool integration with recorded Ollama interactions
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import path from 'path';
import fs from 'fs/promises';
import { execSync } from 'child_process';
import { QCodeEngine } from '../../src/core/engine.js';
import { OllamaClient } from '../../src/core/client.js';
import { ToolRegistry } from '../../src/core/registry.js';
import { GitStatusTool } from '../../src/tools/git/status.js';
import { WorkspaceSecurity } from '../../src/security/workspace.js';
import { getDefaultConfig } from '../../src/config/defaults.js';
import { setupVCRTests } from '../helpers/vcr-helper.js';

describe('Git Status Workflow Operations (VCR)', () => {
  let engine: QCodeEngine;
  const vcr = setupVCRTests(__filename);
  let testProjectPath: string;
  let originalCwd: string;

  beforeAll(async () => {
    originalCwd = process.cwd();
    
    // Create a temporary test project with git repository
    testProjectPath = path.join(__dirname, '../fixtures/git-status-test-project');
    await fs.mkdir(testProjectPath, { recursive: true });
    
    // Initialize git repository
    process.chdir(testProjectPath);
    execSync('git init', { stdio: 'pipe' });
    execSync('git config user.email "test@example.com"', { stdio: 'pipe' });
    execSync('git config user.name "Test User"', { stdio: 'pipe' });

    // Set up engine configuration
    const config = getDefaultConfig();
    config.workingDirectory = testProjectPath;

    const ollamaClient = new OllamaClient({ ...config.ollama, retries: 0 });
    const workspaceSecurity = new WorkspaceSecurity(config.security, testProjectPath);
    const toolRegistry = new ToolRegistry(config.security, testProjectPath);

    // Register git status tool
    const gitStatusTool = new GitStatusTool(workspaceSecurity);
    toolRegistry.registerInternalTool(
      'git.status',
      gitStatusTool.definition,
      gitStatusTool.execute.bind(gitStatusTool)
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

  describe('Clean Repository Status', () => {
    it('should correctly identify clean repository status', async () => {
      await vcr.withRecording('git_status_clean_repository', async () => {
        // Create and commit initial files to make repo clean
        await fs.writeFile(
          path.join(testProjectPath, 'README.md'),
          '# Test Project\n\nInitial content for testing git status functionality.\n'
        );
        
        execSync('git add .', { cwd: testProjectPath, stdio: 'pipe' });
        execSync('git commit -m "Initial commit"', { cwd: testProjectPath, stdio: 'pipe' });

        const result = await engine.processQuery('what\'s my git status?');

        expect(result.complete).toBe(true);
        expect(result.response.toLowerCase()).toMatch(/(clean|no changes|nothing to commit)/);
        expect(result.toolsExecuted).toContain('internal:git.status');

        // Verify tool results
        const gitStatusResult = result.toolResults?.find(r => r.tool === 'git.status');
        expect(gitStatusResult).toBeDefined();
        expect(gitStatusResult?.success).toBe(true);

        vcr.recordingLog('✓ Clean repository status detected');
      });
    }, 30000);

    it('should respond to clean directory check', async () => {
      await vcr.withRecording('git_status_is_clean_directory', async () => {
        const result = await engine.processQuery('is my working directory clean?');

        expect(result.complete).toBe(true);
        expect(result.response.toLowerCase()).toMatch(/(yes|clean|no changes)/);
        expect(result.toolsExecuted).toContain('internal:git.status');

        vcr.recordingLog('✓ Clean directory check completed');
      });
    }, 30000);
  });

  describe('Modified Files Detection', () => {
    it('should detect and report modified files', async () => {
      await vcr.withRecording('git_status_modified_files', async () => {
        // Modify an existing file
        await fs.writeFile(
          path.join(testProjectPath, 'README.md'),
          '# Test Project\n\nModified content for testing git status functionality.\n\n## New Section\nThis is new content.\n'
        );

        const result = await engine.processQuery('show me what files have been modified');

        expect(result.complete).toBe(true);
        expect(result.response.toLowerCase()).toContain('modified');
        expect(result.response).toContain('README.md');
        expect(result.toolsExecuted).toContain('internal:git.status');

        // Verify tool detected changes
        const gitStatusResult = result.toolResults?.find(r => r.tool === 'git.status');
        expect(gitStatusResult).toBeDefined();
        expect(gitStatusResult?.success).toBe(true);

        vcr.recordingLog('✓ Modified files detected');
      });
    }, 30000);
  });

  describe('Untracked Files Detection', () => {
    it('should identify untracked files', async () => {
      await vcr.withRecording('git_status_untracked_files', async () => {
        // Create untracked files
        await fs.writeFile(
          path.join(testProjectPath, 'untracked.log'),
          'log content'
        );
        await fs.writeFile(
          path.join(testProjectPath, 'temp.txt'),
          'temporary content'
        );

        const result = await engine.processQuery('what files are untracked in this repository?');

        expect(result.complete).toBe(true);
        expect(result.response.toLowerCase()).toContain('untracked');
        expect(result.toolsExecuted).toContain('internal:git.status');

        vcr.recordingLog('✓ Untracked files detected');
      });
    }, 30000);
  });

  describe('Comprehensive Status Reporting', () => {
    it('should provide comprehensive status overview', async () => {
      await vcr.withRecording('git_status_comprehensive_overview', async () => {
        // Create a complex state with multiple file types
        
        // New staged file
        await fs.writeFile(
          path.join(testProjectPath, 'staged.txt'),
          'staged content'
        );
        execSync('git add staged.txt', { cwd: testProjectPath, stdio: 'pipe' });
        
        // New untracked file
        await fs.writeFile(
          path.join(testProjectPath, 'untracked.txt'),
          'untracked content'
        );

        const result = await engine.processQuery('give me a complete overview of the repository status');

        expect(result.complete).toBe(true);
        expect(result.response.toLowerCase()).toMatch(/(status|changes|files)/);
        expect(result.toolsExecuted).toContain('internal:git.status');

        vcr.recordingLog('✓ Comprehensive status overview completed');
      });
    }, 30000);
  });

  describe('Error Handling', () => {
    it('should handle empty repository appropriately', async () => {
      await vcr.withRecording('git_status_empty_repository', async () => {
        // Clean up all files to simulate empty repository (but keep git)
        execSync('git reset --hard', { cwd: testProjectPath, stdio: 'pipe' });
        execSync('git clean -fd', { cwd: testProjectPath, stdio: 'pipe' });

        const result = await engine.processQuery('what\'s the git status of this empty repository?');

        expect(result.complete).toBe(true);
        expect(result.toolsExecuted).toContain('internal:git.status');

        vcr.recordingLog('✓ Empty repository status handled');
      });
    }, 30000);
  });
}); 