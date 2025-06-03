/**
 * VCR tests for workflow error recovery scenarios
 * Tests the engine's ability to handle errors gracefully in multi-step workflows
 */

import { QCodeEngine } from '../../src/core/engine.js';
import { OllamaClient } from '../../src/core/client.js';
import { ToolRegistry } from '../../src/core/registry.js';
import { FilesTool } from '../../src/tools/files.js';
import { WorkspaceSecurity } from '../../src/security/workspace.js';
import { getDefaultConfig } from '../../src/config/defaults.js';
import { setupVCRTests } from '../helpers/vcr-helper.js';
import { TEST_WORKSPACE } from '../setup.js';
import { promises as fs } from 'fs';
import { join } from 'path';

describe('Workflow Error Recovery E2E', () => {
  let engine: QCodeEngine;
  let client: OllamaClient;
  const vcr = setupVCRTests(__filename);

  beforeAll(async () => {
    // Create test workspace directory and basic files
    await fs.mkdir(TEST_WORKSPACE, { recursive: true });

    // Create test files for error scenarios
    await fs.writeFile(join(TEST_WORKSPACE, 'test.txt'), 'Test content for error scenarios');
    await fs.writeFile(join(TEST_WORKSPACE, 'valid.json'), '{"name": "test", "version": "1.0.0"}');

    // Initialize configuration and components before changing directory
    const config = getDefaultConfig(TEST_WORKSPACE);
    client = new OllamaClient(config.ollama);

    // Initialize components
    const workspaceSecurity = new WorkspaceSecurity(config.security, TEST_WORKSPACE);
    // Add the test workspace to allowed paths
    workspaceSecurity.addAllowedPath(TEST_WORKSPACE);

    const toolRegistry = new ToolRegistry(config.security, TEST_WORKSPACE);
    const filesTool = new FilesTool(workspaceSecurity);

    // Register file tool
    toolRegistry.registerInternalTool(
      'files',
      filesTool.definition,
      filesTool.execute.bind(filesTool)
    );

    // Initialize engine with workflow support
    engine = new QCodeEngine(client, toolRegistry, config, {
      workingDirectory: TEST_WORKSPACE,
      enableWorkflowState: true,
      maxToolExecutions: 5,
    });

    // No need to change process working directory since we pass it explicitly
  });

  it('should handle workflow failures gracefully with error recovery', async () => {
    await vcr.withRecording('workflow_error_recovery', async () => {
      // Test workflow that encounters an error but continues gracefully
      const query = 'List files in this directory and then read non-existent-file.txt';

      const response = await engine.processQuery(query);

      // Should attempt multiple tool executions
      expect(response.toolsExecuted.length).toBeGreaterThan(0);

      // Should complete the workflow even with errors
      expect(response.complete).toBe(true);
      expect(response.response).toBeDefined();
      expect(typeof response.response).toBe('string');

      // Should have meaningful error information
      const responseText = response.response.toLowerCase();
      expect(
        responseText.includes('error') ||
          responseText.includes('not found') ||
          responseText.includes('does not exist')
      ).toBe(true);

      vcr.recordingLog('✓ Workflow error recovery completed');
      vcr.recordingLog('Tools executed:', response.toolsExecuted.length);
      vcr.recordingLog('Response includes error info:', response.response.includes('error'));
    });
  });

  it('should support workflow interruption and graceful recovery', async () => {
    await vcr.withRecording('workflow_interruption_recovery', async () => {
      // Test workflow interruption with file access issues
      const query = 'List all files and then read each one in detail';

      const response = await engine.processQuery(query);

      // Should handle the workflow appropriately
      expect(response.toolsExecuted.length).toBeGreaterThan(0);
      expect(response.complete).toBe(true);
      expect(response.response).toBeDefined();

      // Should provide meaningful output even with potential interruptions
      expect(response.response.length).toBeGreaterThan(50);
      expect(response.processingTime).toBeGreaterThan(0);

      vcr.recordingLog('✓ Workflow interruption handling completed');
      vcr.recordingLog('Processing time:', response.processingTime, 'ms');
    });
  });

  it('should maintain workflow context across tool execution failures', async () => {
    await vcr.withRecording('workflow_context_preservation', async () => {
      // Test context preservation when some operations fail
      const query = 'List files, then read valid.json, then read invalid-file.txt';

      const response = await engine.processQuery(query);

      // Should execute multiple operations
      expect(response.toolsExecuted.length).toBeGreaterThan(0);

      // Should maintain context and complete
      expect(response.complete).toBe(true);
      expect(Array.isArray(response.toolResults)).toBe(true);

      // Should have some successful operations
      if (response.toolResults.length > 0) {
        const hasSuccess = response.toolResults.some(result => result.success);
        expect(hasSuccess).toBe(true);
      }

      vcr.recordingLog('✓ Context preservation across failures completed');
      vcr.recordingLog('Tool results:', response.toolResults.length);
    });
  });

  it('should demonstrate workflow state recovery after errors', async () => {
    await vcr.withRecording('workflow_state_recovery', async () => {
      // Test state recovery with partial workflow completion
      const query = 'Show me the content of valid.json and then also show missing-file.txt';

      const response = await engine.processQuery(query);

      // Should attempt the workflow
      expect(response.toolsExecuted.length).toBeGreaterThan(0);
      expect(response.complete).toBe(true);

      // Should have results for successful parts
      expect(response.toolResults.length).toBeGreaterThan(0);

      // Should handle both success and failure cases
      expect(response.response).toBeDefined();
      expect(response.response.length).toBeGreaterThan(50);

      vcr.recordingLog('✓ Workflow state recovery completed');
      vcr.recordingLog('Response length:', response.response.length);
    });
  });

  it('should handle complex multi-step workflow with mixed success/failure', async () => {
    await vcr.withRecording('workflow_mixed_results', async () => {
      // Test complex workflow with expected mix of success and failure
      const query = 'List all files, read the valid ones, and summarize what you found';

      const response = await engine.processQuery(query);

      // Should complete the workflow
      expect(response.complete).toBe(true);
      expect(response.toolsExecuted.length).toBeGreaterThan(0);

      // Should provide comprehensive response
      expect(response.response).toBeDefined();
      expect(response.response.length).toBeGreaterThan(150);

      // Should track execution properly
      expect(typeof response.processingTime).toBe('number');
      expect(response.processingTime).toBeGreaterThan(0);

      vcr.recordingLog('✓ Complex mixed workflow completed');
      vcr.recordingLog('Tools executed:', response.toolsExecuted.length);
      vcr.recordingLog('Processing time:', response.processingTime, 'ms');
    });
  });
});
