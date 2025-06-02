import { QCodeEngine } from '../../src/core/engine.js';
import { OllamaClient } from '../../src/core/client.js';
import { ToolRegistry } from '../../src/core/registry.js';
import { FilesTool } from '../../src/tools/files.js';
import { WorkspaceSecurity } from '../../src/security/workspace.js';
import { getDefaultConfig } from '../../src/config/defaults.js';
import path from 'path';
import nock from 'nock';
import { promises as fs } from 'fs';

/**
 * VCR tests for CLI search functionality using nock
 * These tests record and replay actual Ollama API interactions for deterministic testing
 */
describe('CLI Search Functionality VCR Tests', () => {
  let engine: QCodeEngine;
  let client: OllamaClient;
  let recordingsPath: string;

  beforeAll(async () => {
    recordingsPath = path.join(__dirname, '../fixtures/recordings/cli');
    await fs.mkdir(recordingsPath, { recursive: true });
  });

  beforeEach(() => {
    const config = getDefaultConfig();
    client = new OllamaClient(config.ollama);

    // Initialize components with proper constructor arguments
    const workspaceSecurity = new WorkspaceSecurity(config.security);
    const toolRegistry = new ToolRegistry(config.security);
    const filesTool = new FilesTool(workspaceSecurity);

    // Register file tool properly with all required arguments
    toolRegistry.registerInternalTool(
      'files',
      filesTool.definition,
      filesTool.execute.bind(filesTool)
    );

    // Initialize engine
    engine = new QCodeEngine(client, toolRegistry, config);

    // Configure nock for recording/replaying
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

  describe('CLI Search Commands', () => {
    it('should handle "search for function in TypeScript files" command', async () => {
      const testName = 'cli_search_function_ts';

      if (process.env.NOCK_MODE !== 'record') {
        // Load and apply recorded interactions
        const recordingFile = path.join(recordingsPath, `${testName}.json`);
        try {
          const recordings = JSON.parse(await fs.readFile(recordingFile, 'utf-8'));
          recordings.forEach((recording: any) => {
            const scope = nock(recording.scope);
            if (recording.method.toLowerCase() === 'get') {
              scope.get(recording.path).reply(recording.status, recording.response);
            } else if (recording.method.toLowerCase() === 'post') {
              scope.post(recording.path).reply(recording.status, recording.response);
            }
          });
        } catch (error) {
          console.log('No recording found, skipping test in replay mode');
          return;
        }
      }

      const query = 'search for function in TypeScript files';
      const result = await engine.processQuery(query);

      // Validate successful search execution
      expect(result.response).toBeDefined();
      expect(typeof result.response).toBe('string');
      expect(result.toolsExecuted).toContain('internal:files');

      // Validate search results
      const toolResult = result.toolResults?.find(r => r.tool === 'files');
      expect(toolResult).toBeDefined();
      expect(toolResult?.success).toBe(true);
      expect(toolResult?.data?.matches).toBeDefined();
      expect(Array.isArray(toolResult?.data?.matches)).toBe(true);

      // For CLI usage, verify the response contains useful information
      expect(result.response.toLowerCase()).toContain('search results');

      // Save recording with explicit name
      if (process.env.NOCK_MODE === 'record') {
        const recordings = nock.recorder.play();
        if (recordings.length > 0) {
          const recordingFile = path.join(recordingsPath, `${testName}.json`);
          await fs.writeFile(recordingFile, JSON.stringify(recordings, null, 2));
          console.log(`Recorded ${recordings.length} HTTP interactions to ${recordingFile}`);
        }
        nock.recorder.clear();
      }
    });

    it('should handle "find all export statements" command with regex', async () => {
      const testName = 'cli_search_exports_regex';

      if (process.env.NOCK_MODE !== 'record') {
        const recordingFile = path.join(recordingsPath, `${testName}.json`);
        try {
          const recordings = JSON.parse(await fs.readFile(recordingFile, 'utf-8'));
          recordings.forEach((recording: any) => {
            const scope = nock(recording.scope);
            if (recording.method.toLowerCase() === 'get') {
              scope.get(recording.path).reply(recording.status, recording.response);
            } else if (recording.method.toLowerCase() === 'post') {
              scope.post(recording.path).reply(recording.status, recording.response);
            }
          });
        } catch (error) {
          console.log('No recording found, skipping test in replay mode');
          return;
        }
      }

      const query = 'find all export statements in source files';
      const result = await engine.processQuery(query);

      expect(result.response).toBeDefined();
      expect(typeof result.response).toBe('string');
      expect(result.toolsExecuted).toContain('internal:files');

      const toolResult = result.toolResults?.find(r => r.tool === 'files');
      expect(toolResult).toBeDefined();
      expect(toolResult?.success).toBe(true);

      if (process.env.NOCK_MODE === 'record') {
        const recordings = nock.recorder.play();
        if (recordings.length > 0) {
          const recordingFile = path.join(recordingsPath, `${testName}.json`);
          await fs.writeFile(recordingFile, JSON.stringify(recordings, null, 2));
          console.log(`Recorded ${recordings.length} HTTP interactions to ${recordingFile}`);
        }
        nock.recorder.clear();
      }
    });

    it('should handle "search for TODO comments" command', async () => {
      const testName = 'cli_search_todo_comments';

      if (process.env.NOCK_MODE !== 'record') {
        const recordingFile = path.join(recordingsPath, `${testName}.json`);
        try {
          const recordings = JSON.parse(await fs.readFile(recordingFile, 'utf-8'));
          recordings.forEach((recording: any) => {
            const scope = nock(recording.scope);
            if (recording.method.toLowerCase() === 'get') {
              scope.get(recording.path).reply(recording.status, recording.response);
            } else if (recording.method.toLowerCase() === 'post') {
              scope.post(recording.path).reply(recording.status, recording.response);
            }
          });
        } catch (error) {
          console.log('No recording found, skipping test in replay mode');
          return;
        }
      }

      const query = 'search for TODO comments in the codebase';
      const result = await engine.processQuery(query);

      expect(result.response).toBeDefined();
      expect(typeof result.response).toBe('string');

      // If there are tool executions, they should be for files
      if (result.toolsExecuted.length > 0) {
        expect(result.toolsExecuted).toContain('internal:files');

        const toolResult = result.toolResults?.find(r => r.tool === 'files');
        expect(toolResult).toBeDefined();
        expect(toolResult?.success).toBe(true);
      }

      if (process.env.NOCK_MODE === 'record') {
        const recordings = nock.recorder.play();
        if (recordings.length > 0) {
          const recordingFile = path.join(recordingsPath, `${testName}.json`);
          await fs.writeFile(recordingFile, JSON.stringify(recordings, null, 2));
          console.log(`Recorded ${recordings.length} HTTP interactions to ${recordingFile}`);
        }
        nock.recorder.clear();
      }
    });

    it('should handle "search for error handling patterns" command', async () => {
      const testName = 'cli_search_error_patterns';

      if (process.env.NOCK_MODE !== 'record') {
        const recordingFile = path.join(recordingsPath, `${testName}.json`);
        try {
          const recordings = JSON.parse(await fs.readFile(recordingFile, 'utf-8'));
          recordings.forEach((recording: any) => {
            const scope = nock(recording.scope);
            if (recording.method.toLowerCase() === 'get') {
              scope.get(recording.path).reply(recording.status, recording.response);
            } else if (recording.method.toLowerCase() === 'post') {
              scope.post(recording.path).reply(recording.status, recording.response);
            }
          });
        } catch (error) {
          console.log('No recording found, skipping test in replay mode');
          return;
        }
      }

      const query = 'search for error handling patterns like try-catch blocks';
      const result = await engine.processQuery(query);

      expect(result.response).toBeDefined();
      expect(typeof result.response).toBe('string');

      // If there are tool executions, they should be for files
      if (result.toolsExecuted.length > 0) {
        expect(result.toolsExecuted).toContain('internal:files');

        const toolResult = result.toolResults?.find(r => r.tool === 'files');
        expect(toolResult).toBeDefined();
        expect(toolResult?.success).toBe(true);
      }

      if (process.env.NOCK_MODE === 'record') {
        const recordings = nock.recorder.play();
        if (recordings.length > 0) {
          const recordingFile = path.join(recordingsPath, `${testName}.json`);
          await fs.writeFile(recordingFile, JSON.stringify(recordings, null, 2));
          console.log(`Recorded ${recordings.length} HTTP interactions to ${recordingFile}`);
        }
        nock.recorder.clear();
      }
    });
  });

  describe('VCR Recording Mode for CLI Search', () => {
    it('should allow recording new CLI search interactions', async () => {
      if (process.env.NOCK_MODE === 'record') {
        console.log('🔴 VCR Recording Mode - recording CLI search interaction');

        const query = 'search for "interface" in TypeScript files';
        const result = await engine.processQuery(query);

        expect(result.response).toBeDefined();
        expect(typeof result.response).toBe('string');

        const recordings = nock.recorder.play();
        if (recordings.length > 0) {
          const recordingFile = path.join(recordingsPath, 'cli_search_recorded.json');
          await fs.writeFile(recordingFile, JSON.stringify(recordings, null, 2));
          console.log(`✅ Recorded ${recordings.length} HTTP interactions to ${recordingFile}`);
        }
        nock.recorder.clear();
      } else {
        console.log('ℹ️  Skipping CLI search recording test - not in record mode');
      }
    }, 15000); // Longer timeout for recording
  });
});
