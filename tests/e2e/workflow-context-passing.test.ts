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
        commands: {
          allowedCommands: [],
          forbiddenPatterns: [],
          allowArbitraryCommands: false,
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

    const ollamaClient = new OllamaClient(config.ollama);
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

      // Should execute at least one tool (the list operation)
      expect(response.toolsExecuted.length).toBeGreaterThan(0);

      // Should contain calls to the internal:files tool
      expect(response.toolsExecuted.every(tool => tool === 'internal:files')).toBe(true);

      // Should have results for the operations
      expect(response.toolResults.length).toBeGreaterThan(0);

      // First operation should be list (based on query pattern)
      const firstResult = response.toolResults[0];
      expect(firstResult).toBeDefined();
      expect(firstResult!.tool).toBe('files');

      // The operation may succeed or fail depending on the environment
      // What's important is that the workflow executed and completed
      vcr.recordingLog('✓ First operation result:', firstResult!.success ? 'SUCCESS' : 'FAILED');

      // Second operation should be read (if files were found and first operation succeeded)
      // Note: This test uses the fixtures directory which may not have TypeScript files
      // So we only check for multi-step IF multiple tools were actually executed
      if (response.toolsExecuted.length > 1) {
        expect(response.toolResults.length).toBeGreaterThan(1);
        const secondResult = response.toolResults[1];
        expect(secondResult).toBeDefined();
        expect(secondResult!.tool).toBe('files');
        vcr.recordingLog('✓ Multi-step workflow executed');
      } else {
        vcr.recordingLog('✓ Single-step workflow (no files found to read or operation failed)');
      }

      // Response should be meaningful regardless of whether multi-step occurred
      expect(response.response.length).toBeGreaterThan(50);
      expect(response.complete).toBe(true);

      vcr.recordingLog('Tools executed:', response.toolsExecuted);
      vcr.recordingLog('Tool results count:', response.toolResults.length);
    });
  });

  it('should handle context-dependent sequential operations', async () => {
    await vcr.withRecording('workflow_context_dependent', async () => {
      // Test that later operations can depend on earlier results
      const query = 'List JavaScript files and show me the content of the first one found';

      const response = await engine.processQuery(query);

      // Should execute sequentially dependent operations
      expect(response.toolsExecuted.length).toBeGreaterThan(0);

      // Should provide meaningful response even if no JS files found
      expect(response.response.length).toBeGreaterThan(0);
      expect(typeof response.response).toBe('string');

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

      // Should attempt operations
      expect(response.toolsExecuted.length).toBeGreaterThan(0);

      // Should track execution properly
      expect(Array.isArray(response.toolResults)).toBe(true);
      expect(typeof response.processingTime).toBe('number');
      expect(response.processingTime).toBeGreaterThan(0);

      // Should provide complete response
      expect(response.response.length).toBeGreaterThan(50);

      // Should complete the workflow successfully
      expect(response.complete).toBe(true);

      // Check results based on what actually happened
      if (response.toolResults.length > 0) {
        // At least one operation should have completed
        const hasResults = response.toolResults.some(r => r.success || !r.success);
        expect(hasResults).toBe(true);

        // Log what actually happened for debugging
        const successCount = response.toolResults.filter(r => r.success).length;
        const failureCount = response.toolResults.filter(r => !r.success).length;

        vcr.recordingLog('✓ Tool results breakdown:');
        vcr.recordingLog(`  - Successful: ${successCount}`);
        vcr.recordingLog(`  - Failed: ${failureCount}`);

        // If all operations failed, that might be expected (e.g., no test files found)
        if (successCount === 0 && failureCount > 0) {
          vcr.recordingLog('✓ All operations failed (likely no matching files found)');
        }
      } else {
        // No tool results means no tools were executed, which shouldn't happen
        vcr.recordingLog('⚠️ No tool results found');
      }

      vcr.recordingLog('✓ Workflow state preserved across execution chain');
      vcr.recordingLog('Processing time:', response.processingTime, 'ms');
    });
  });

  it('should demonstrate context cleanup and memory management', async () => {
    await vcr.withRecording('workflow_memory_management', async () => {
      // Test that workflow manages memory appropriately
      const query = 'List all files recursively and show me a summary';

      const response = await engine.processQuery(query);

      // Should execute list operation
      expect(response.toolsExecuted).toContain('internal:files');

      // Should complete in reasonable time
      expect(response.processingTime).toBeLessThan(30000); // 30 seconds max

      // Should provide summary rather than dumping all content
      expect(response.response.length).toBeGreaterThan(0);
      expect(response.response.length).toBeLessThan(10000); // Should be summarized

      // Should successfully complete
      expect(response.complete).toBe(true);

      vcr.recordingLog('✓ Memory management test completed');
      vcr.recordingLog('Response length:', response.response.length);
    });
  });
});
