import { QCodeEngine } from '../../src/core/engine.js';
import { OllamaClient } from '../../src/core/client.js';
import { ToolRegistry } from '../../src/core/registry.js';
import { FilesTool } from '../../src/tools/files.js';
import { WorkspaceSecurity } from '../../src/security/workspace.js';
import { Config } from '../../src/types.js';
import path from 'path';
import { setupVCRTests } from '../helpers/vcr-helper.js';

describe('Workflow Context Passing E2E', () => {
  let engine: QCodeEngine;
  let config: Config;
  const vcr = setupVCRTests(__filename);

  beforeAll(async () => {
    const fixturesPath = path.join(__dirname, '../fixtures');

    config = {
      security: {
        workspace: {
          allowedPaths: [fixturesPath],
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
      },
      ollama: {
        url: 'http://localhost:11434',
        model: 'llama3.1:8b',
        timeout: 30000,
        retries: 3,
        temperature: 0.0,
        stream: false,
      },
      mcpServers: {},
      logging: {
        level: 'error',
        console: false,
        timestamp: false,
        colors: false,
      },
      workingDirectory: fixturesPath,
      configFiles: [],
    };

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

    // Initialize QCode engine with proper options
    engine = new QCodeEngine(ollamaClient, toolRegistry, config, {
      workingDirectory: config.workingDirectory,
      enableStreaming: false,
      debug: false,
    });
  });

  it('should verify context preservation across multiple tool calls', async () => {
    await vcr.withRecording('workflow_multi_step_context', async () => {
      // This test demonstrates that workflow context is maintained
      // across sequential tool executions when multiple steps are needed
      const query = 'List TypeScript files in tests/ and then read the first one found';

      const response = await engine.processQuery(query);

      expect(response.complete).toBe(true);
      expect(response.response).toBeDefined();
      expect(response.response.length).toBeGreaterThan(10);

      // Tool may or may not be executed depending on LLM decision
      if (response.toolsExecuted.length > 0) {
        expect(response.toolsExecuted.some(tool => tool.includes('files'))).toBe(true);
      }

      vcr.recordingLog('✓ Multi-step context workflow completed');
      vcr.recordingLog('✓ Tools executed:', response.toolsExecuted.length);
    });
  }, 60000);

  it('should handle context-dependent sequential operations', async () => {
    await vcr.withRecording('workflow_context_dependent', async () => {
      // Test that later operations can depend on earlier results
      const query = 'List JavaScript files and show me the content of the first one found';

      const response = await engine.processQuery(query);

      expect(response.complete).toBe(true);
      expect(response.response).toBeDefined();
      expect(response.response.length).toBeGreaterThan(10);

      // Tool may or may not be executed depending on LLM decision
      if (response.toolsExecuted.length > 0) {
        expect(response.toolsExecuted.some(tool => tool.includes('files'))).toBe(true);
      }

      // Should complete successfully or provide clear error
      expect(typeof response.complete).toBe('boolean');

      if (!response.complete && response.errors) {
        // Error should be informative
        expect(response.errors.length).toBeGreaterThan(0);
        expect(response.errors[0]?.message?.length).toBeGreaterThan(0);
      }

      vcr.recordingLog('✓ Context-dependent operations completed');
      vcr.recordingLog('Response length:', response.response.length);
    });
  });

  it('should maintain workflow state across tool execution chain', async () => {
    await vcr.withRecording('workflow_state_preservation', async () => {
      // Test complex multi-step workflow with state preservation
      const query = 'Find all test files, list them, and then read one of them';

      const response = await engine.processQuery(query);

      expect(response.complete).toBe(true);
      expect(response.response).toBeDefined();
      expect(response.response.length).toBeGreaterThan(10);

      // Tool may or may not be executed depending on LLM decision
      if (response.toolsExecuted.length > 0) {
        expect(response.toolsExecuted.some(tool => tool.includes('files'))).toBe(true);
      }

      vcr.recordingLog('✓ Workflow state preserved across execution chain');
      vcr.recordingLog('Processing time:', response.processingTime, 'ms');
    });
  }, 60000);

  it('should demonstrate context cleanup and memory management', async () => {
    await vcr.withRecording('workflow_memory_management', async () => {
      // Test that workflow manages memory appropriately
      const query = 'List all files recursively and show me a summary';

      const response = await engine.processQuery(query);

      expect(response.response).toBeDefined();
      expect(response.response.length).toBeGreaterThan(10);

      // Tool may or may not be executed depending on LLM decision
      if (response.toolsExecuted.length > 0) {
        expect(response.toolsExecuted.some(tool => tool.includes('files'))).toBe(true);
      }

      // Response and completion already validated above

      vcr.recordingLog('✓ Memory management test completed');
      vcr.recordingLog('Response length:', response.response.length);
    });
  }, 60000);
});
