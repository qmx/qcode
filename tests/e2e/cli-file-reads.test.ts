/**
 * VCR tests for CLI file read operations
 * Tests the CLI class methods directly with recorded Ollama interactions
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import path from 'path';
import fs from 'fs/promises';
import { QCodeEngine } from '../../src/core/engine.js';
import { OllamaClient } from '../../src/core/client.js';
import { ToolRegistry } from '../../src/core/registry.js';
import { FilesTool } from '../../src/tools/files.js';
import { WorkspaceSecurity } from '../../src/security/workspace.js';
import { getDefaultConfig } from '../../src/config/defaults.js';
import { setupVCRTests } from '../helpers/vcr-helper';

describe('CLI File Read Operations (VCR)', () => {
  let engine: QCodeEngine;
  const vcr = setupVCRTests(__filename);
  const fixturesPath = path.join(__dirname, '../fixtures');
  const testFilePath = path.join(fixturesPath, 'test-files/sample.txt');

  beforeAll(async () => {
    // Create test fixture file
    await fs.mkdir(path.dirname(testFilePath), { recursive: true });
    await fs.writeFile(
      testFilePath,
      'Hello World!\n\nThis is a test file for CLI testing.\nIt contains multiple lines to test the file reading functionality.\n\nLine 1: TypeScript\nLine 2: AI Assistant\nLine 3: File Operations\nLine 4: Security\nLine 5: Workspace'
    );

    const config = getDefaultConfig();
    config.workingDirectory = path.join(__dirname, '../..');

    const ollamaClient = new OllamaClient({ ...config.ollama, retries: 0 });
    const workspaceSecurity = new WorkspaceSecurity(config.security, config.workingDirectory);
    const toolRegistry = new ToolRegistry(config.security, config.workingDirectory);

    // Register file tool
    const filesTool = new FilesTool(workspaceSecurity);
    toolRegistry.registerInternalTool(
      'files',
      filesTool.definition,
      filesTool.execute.bind(filesTool)
    );

    // Initialize QCode engine
    engine = new QCodeEngine(ollamaClient, toolRegistry, config, {
      workingDirectory: config.workingDirectory,
      enableStreaming: false,
      debug: false,
    });
  });

  afterAll(async () => {
    // Clean up test fixtures
    try {
      await fs.unlink(testFilePath);
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  it('should successfully read a file when requested', async () => {
    await vcr.withRecording('cli_file_read_basic', async () => {
      const result = await engine.processQuery(`show me the contents of ${testFilePath}`);

      expect(result.complete).toBe(true);
      expect(result.response).toContain('Hello World!');
      expect(result.response).toContain('This is a test file for CLI testing');
      expect(result.toolsExecuted).toContain('internal:files');

      vcr.recordingLog('✓ File read completed');
      vcr.recordingLog('✓ Response contains expected content');
    });
  }, 30000);

  it('should handle file read with tool execution details', async () => {
    await vcr.withRecording('cli_file_read_verbose', async () => {
      const result = await engine.processQuery(`read ${testFilePath}`);

      expect(result.complete).toBe(true);
      expect(result.toolsExecuted).toContain('internal:files');
      expect(result.toolResults).toHaveLength(1);
      expect(result.processingTime).toBeGreaterThan(0);

      vcr.recordingLog('✓ Tool execution details verified');
      vcr.recordingLog('✓ Processing time:', result.processingTime, 'ms');
    });
  }, 30000);

  it('should handle partial file read with line ranges', async () => {
    await vcr.withRecording('cli_file_read_partial', async () => {
      const result = await engine.processQuery(`read the first 5 lines of ${testFilePath}`);

      expect(result.complete).toBe(true);
      expect(result.response).toContain('Hello World!');
      expect(result.toolsExecuted).toContain('internal:files');
      // Should not contain the later lines like "Line 5: Workspace"
      expect(result.response).not.toContain('Line 5: Workspace');

      vcr.recordingLog('✓ Partial file read completed');
      vcr.recordingLog('✓ Line range correctly limited');
    });
  }, 30000);

  it('should handle non-existent file gracefully', async () => {
    await vcr.withRecording('cli_file_read_error', async () => {
      const result = await engine.processQuery('show me nonexistent-file.txt');

      expect(result.complete).toBe(true);
      expect(result.response).toBeDefined();
      expect(typeof result.response).toBe('string');

      // Should handle error gracefully and explain what happened
      const responseText = result.response.toLowerCase();
      expect(
        responseText.includes('not found') ||
          responseText.includes('error') ||
          responseText.includes('does not exist')
      ).toBe(true);

      vcr.recordingLog('✓ Error handling completed');
      vcr.recordingLog('✓ Response includes error information');
    });
  }, 30000);

  it('should handle multiple file operations', async () => {
    await vcr.withRecording('cli_file_read_multiple', async () => {
      const result = await engine.processQuery(
        `list files in ${path.dirname(testFilePath)} and show me sample.txt`
      );

      expect(result.complete).toBe(true);
      expect(result.toolsExecuted).toContain('internal:files');
      expect(result.response).toBeDefined();
      expect(typeof result.response).toBe('string');

      vcr.recordingLog('✓ Multiple file operations completed');
      vcr.recordingLog('✓ Tools executed:', result.toolsExecuted);
    });
  }, 30000);

  it('should provide meaningful responses for file operations', async () => {
    await vcr.withRecording('cli_file_read_meaningful', async () => {
      const result = await engine.processQuery(`what is in the file ${testFilePath}?`);

      expect(result.complete).toBe(true);
      expect(result.response).toBeDefined();
      expect(result.response.length).toBeGreaterThan(50);
      expect(result.toolsExecuted).toContain('internal:files');

      // Should provide meaningful interpretation of file content
      expect(result.response).toContain('test file');

      vcr.recordingLog('✓ Meaningful response provided');
      vcr.recordingLog('✓ Response length:', result.response.length);
    });
  }, 30000);
});
