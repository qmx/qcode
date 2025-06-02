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
 * VCR tests for Search Workflow using nock
 * These tests record and replay actual Ollama API interactions for deterministic testing
 */
describe('Search Workflow - End-to-End VCR Tests', () => {
  let engine: QCodeEngine;
  let client: OllamaClient;
  let recordingsPath: string;

  beforeAll(async () => {
    recordingsPath = path.join(__dirname, '../fixtures/recordings/search');
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

  describe('Simple Text Search', () => {
    it('should handle simple search query with LLM function calling', async () => {
      const testName = 'simple_text_search';

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

      const query = 'search for the word "function" in TypeScript files';
      const result = await engine.processQuery(query);

      expect(result.response).toBeDefined();
      expect(typeof result.response).toBe('string');
      expect(result.toolsExecuted).toContain('internal:files');

      // Verify search results
      const toolResult = result.toolResults?.find(r => r.tool === 'files');
      expect(toolResult).toBeDefined();
      expect(toolResult?.success).toBe(true);
      expect(toolResult?.data?.matches).toBeDefined();
      expect(Array.isArray(toolResult?.data?.matches)).toBe(true);

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

    it('should handle regex search with pattern matching', async () => {
      const testName = 'regex_search';

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

      const query =
        'search for lines starting with "export" using regex pattern "^export" in TypeScript files';
      const result = await engine.processQuery(query);

      expect(result.response).toBeDefined();
      expect(typeof result.response).toBe('string');
      expect(result.toolsExecuted).toContain('internal:files');

      // Verify search results
      const toolResult = result.toolResults?.find(r => r.tool === 'files');
      expect(toolResult).toBeDefined();
      expect(toolResult?.success).toBe(true);
      expect(toolResult?.data?.matches).toBeDefined();

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

  describe('Search with File Patterns', () => {
    it('should search in specific file patterns', async () => {
      const testName = 'pattern_search';

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

      const query = 'search for "FilesTool" in src directory TypeScript files';
      const result = await engine.processQuery(query);

      expect(result.response).toBeDefined();
      expect(typeof result.response).toBe('string');
      expect(result.toolsExecuted).toContain('internal:files');

      const toolResult = result.toolResults?.find(r => r.tool === 'files');
      expect(toolResult).toBeDefined();
      expect(toolResult?.success).toBe(true);
      expect(toolResult?.data?.matches).toBeDefined();

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

  describe('Multi-step Search Workflows', () => {
    it('should handle search followed by file read', async () => {
      const testName = 'search_then_read';

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

      const query = 'find files containing "SearchMatch" and show me the contents of the first one';
      const result = await engine.processQuery(query);

      expect(result.response).toBeDefined();
      expect(typeof result.response).toBe('string');
      expect(result.toolsExecuted).toContain('internal:files');

      // Should use files tool for both search and read operations
      const toolResults = result.toolResults?.filter(r => r.tool === 'files');
      expect(toolResults?.length).toBeGreaterThan(0);

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

  describe('Error Handling in Search', () => {
    it('should handle search with realistic constraints', async () => {
      const testName = 'search_with_constraints';

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

      const query = 'search for "nonexistentterm12345" in all files';
      const result = await engine.processQuery(query);

      // Should successfully execute search but find no results
      expect(result.response).toBeDefined();
      expect(typeof result.response).toBe('string');
      expect(result.toolsExecuted).toContain('internal:files');

      const toolResult = result.toolResults?.find(r => r.tool === 'files');
      expect(toolResult).toBeDefined();
      expect(toolResult?.success).toBe(true);
      // Should find no matches for nonexistent term
      expect(toolResult?.data?.matches?.length).toBe(0);

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

  describe('VCR Recording Mode', () => {
    it('should allow recording new interactions', async () => {
      if (process.env.NOCK_MODE === 'record') {
        console.log('🔴 VCR Recording Mode - will record real Ollama interactions');

        const query = 'search for "test" in source files';
        const result = await engine.processQuery(query);

        expect(result.response).toBeDefined();
        expect(typeof result.response).toBe('string');

        const recordings = nock.recorder.play();
        if (recordings.length > 0) {
          const recordingFile = path.join(recordingsPath, 'recorded_interaction.json');
          await fs.writeFile(recordingFile, JSON.stringify(recordings, null, 2));
          console.log(`✅ Recorded ${recordings.length} HTTP interactions to ${recordingFile}`);
        }
        nock.recorder.clear();
      } else {
        console.log('ℹ️  Skipping recording test - not in record mode');
      }
    }, 15000); // Longer timeout for recording
  });
});
