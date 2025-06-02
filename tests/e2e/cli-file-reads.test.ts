/**
 * VCR tests for CLI file read operations
 * Tests the CLI class methods directly with recorded Ollama interactions
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from '@jest/globals';
import path from 'path';
import fs from 'fs/promises';
import nock from 'nock';

// Import the CLI class and related types (we'll need to expose them)
// For now, let's create a test helper that gives us access to the CLI internals

describe('CLI File Read Operations (VCR)', () => {
  const fixturesPath = path.join(__dirname, '../fixtures');
  const recordingsPath = path.join(fixturesPath, 'recordings/cli');
  const testFilePath = path.join(fixturesPath, 'test-files/sample.txt');

  beforeAll(async () => {
    // Create recordings and fixtures directories
    await fs.mkdir(recordingsPath, { recursive: true });
    await fs.mkdir(path.dirname(testFilePath), { recursive: true });

    // Create test fixture file
    await fs.writeFile(
      testFilePath,
      'Hello World!\n\nThis is a test file for CLI testing.\nIt contains multiple lines to test the file reading functionality.\n\nLine 1: TypeScript\nLine 2: AI Assistant\nLine 3: File Operations\nLine 4: Security\nLine 5: Workspace'
    );
  });

  afterAll(async () => {
    // Clean up test fixtures (but keep recordings)
    try {
      await fs.unlink(testFilePath);
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  beforeEach(() => {
    if (process.env.NOCK_MODE === 'record') {
      // In record mode, allow real HTTP and record the interactions
      nock.restore();
      nock.recorder.rec({
        output_objects: true,
        enable_reqheaders_recording: false, // More stable replays
      });
    } else {
      // In replay mode, don't allow real HTTP requests
      nock.disableNetConnect();
    }
  });

  afterEach(async () => {
    if (process.env.NOCK_MODE === 'record') {
      nock.recorder.clear();
    } else {
      // Clean up any remaining mocks
      nock.cleanAll();
    }
  });

  /**
   * Helper function to setup VCR replay for a test
   */
  const setupVCRReplay = async (testName: string): Promise<boolean> => {
    if (process.env.NOCK_MODE === 'record') {
      return true; // In record mode, make real calls
    }

    try {
      const recordingFile = path.join(recordingsPath, `${testName}.json`);
      const recordings = JSON.parse(await fs.readFile(recordingFile, 'utf-8'));

      recordings.forEach((recording: any) => {
        const scope = nock(recording.scope);
        if (recording.method.toLowerCase() === 'post') {
          scope.post(recording.path).reply(recording.status, recording.response);
        } else if (recording.method.toLowerCase() === 'get') {
          scope.get(recording.path).reply(recording.status, recording.response);
        }
      });
      return true;
    } catch (error) {
      console.log(`No recording found for ${testName}, skipping test in replay mode`);
      return false;
    }
  };

  /**
   * Helper function to save VCR recording after a test
   */
  const saveVCRRecording = async (testName: string): Promise<void> => {
    if (process.env.NOCK_MODE !== 'record') {
      return;
    }

    const recordings = nock.recorder.play();
    if (recordings.length > 0) {
      const recordingFile = path.join(recordingsPath, `${testName}.json`);
      await fs.writeFile(recordingFile, JSON.stringify(recordings, null, 2));
      console.log(`Recorded ${recordings.length} HTTP interactions to ${recordingFile}`);
    }
    nock.recorder.clear();
  };

  /**
   * Helper function to create and initialize a CLI instance
   */
  const createCLI = async () => {
    // We need to import the CLI class - let's create a simple approach
    // Since we can't easily import the CLI class from the compiled file,
    // let's test the engine directly, which is what the CLI uses
    const { QCodeEngine } = await import('../../src/core/engine.js');
    const { OllamaClient } = await import('../../src/core/client.js');
    const { ToolRegistry } = await import('../../src/core/registry.js');
    const { FilesTool } = await import('../../src/tools/files.js');
    const { WorkspaceSecurity } = await import('../../src/security/workspace.js');
    const { getDefaultConfig } = await import('../../src/config/defaults.js');

    const config = getDefaultConfig();
    config.workingDirectory = path.join(__dirname, '../..');

    const ollamaClient = new OllamaClient(config.ollama);
    const workspaceSecurity = new WorkspaceSecurity(config.security);
    const toolRegistry = new ToolRegistry(config.security);

    // Register the FilesTool
    const filesTool = new FilesTool(workspaceSecurity);
    toolRegistry.registerInternalTool(
      'files',
      filesTool.definition,
      filesTool.execute.bind(filesTool)
    );

    const engine = new QCodeEngine(ollamaClient, toolRegistry, config);

    return { engine, config };
  };

  it('should successfully read a file when requested', async () => {
    const testName = 'cli_file_read_basic';

    const hasRecording = await setupVCRReplay(testName);
    if (!hasRecording) return;

    const { engine } = await createCLI();
    const result = await engine.processQuery(`show me the contents of ${testFilePath}`);

    expect(result.complete).toBe(true);
    expect(result.response).toContain('Hello World!');
    expect(result.response).toContain('This is a test file for CLI testing');
    expect(result.toolsExecuted).toContain('internal:files');

    await saveVCRRecording(testName);
  }, 30000);

  it('should handle file read with tool execution details', async () => {
    const testName = 'cli_file_read_verbose';

    const hasRecording = await setupVCRReplay(testName);
    if (!hasRecording) return;

    const { engine } = await createCLI();
    const result = await engine.processQuery(`read ${testFilePath}`);

    expect(result.complete).toBe(true);
    expect(result.toolsExecuted).toContain('internal:files');
    expect(result.toolResults).toHaveLength(1);
    expect(result.processingTime).toBeGreaterThan(0);

    await saveVCRRecording(testName);
  }, 30000);

  it('should handle partial file read with line ranges', async () => {
    const testName = 'cli_file_read_partial';

    const hasRecording = await setupVCRReplay(testName);
    if (!hasRecording) return;

    const { engine } = await createCLI();
    const result = await engine.processQuery(`read the first 5 lines of ${testFilePath}`);

    expect(result.complete).toBe(true);
    expect(result.response).toContain('Hello World!');
    expect(result.toolsExecuted).toContain('internal:files');
    // Should not contain the later lines like "Line 5: Workspace"
    expect(result.response).not.toContain('Line 5: Workspace');

    await saveVCRRecording(testName);
  }, 30000);

  it('should handle non-existent file gracefully', async () => {
    const testName = 'cli_file_read_error';

    const hasRecording = await setupVCRReplay(testName);
    if (!hasRecording) return;

    const { engine } = await createCLI();
    const result = await engine.processQuery('show me nonexistent-file.txt');

    expect(result.complete).toBe(true); // Engine should complete even with errors
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);
    // The error message may vary depending on what the LLM calls
    expect(result.response).toMatch(/Cannot access path|not yet implemented|no such file/i);

    await saveVCRRecording(testName);
  }, 30000);

  it('should read package.json successfully', async () => {
    const testName = 'cli_read_package_json';

    const hasRecording = await setupVCRReplay(testName);
    if (!hasRecording) return;

    const { engine } = await createCLI();
    const result = await engine.processQuery('show me the package.json file');

    expect(result.complete).toBe(true);
    expect(result.response).toContain('"name": "qcode"');
    expect(result.toolsExecuted).toContain('internal:files');

    await saveVCRRecording(testName);
  }, 30000);

  // Test engine status and health (allow HTTP for this test)
  it('should provide engine status information', async () => {
    // Temporarily allow HTTP for this test
    if (process.env.NOCK_MODE !== 'record') {
      nock.enableNetConnect();
    }

    const { engine } = await createCLI();
    const status = await engine.getStatus();

    expect(status.toolsRegistered).toBeGreaterThan(0);
    expect(status.model).toBe('llama3.1:8b');
    // Don't test healthy in replay mode since Ollama may not be available
    if (process.env.NOCK_MODE === 'record') {
      expect(status.healthy).toBe(true);
    }

    // Restore HTTP blocking for other tests
    if (process.env.NOCK_MODE !== 'record') {
      nock.disableNetConnect();
    }
  });

  // Test available tools
  it('should list available tools correctly', async () => {
    const { engine } = await createCLI();
    const tools = engine.getAvailableTools();

    expect(tools.length).toBeGreaterThan(0);
    const filesTool = tools.find(t => t.name === 'files' && t.namespace === 'internal');
    expect(filesTool).toBeDefined();
    expect(filesTool?.description).toContain('file operations');
  });
});
