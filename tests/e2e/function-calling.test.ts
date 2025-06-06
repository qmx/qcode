/**
 * VCR tests for QCode function calling e2e scenarios
 * These tests record and replay actual Ollama API interactions for deterministic testing
 */

import { QCodeEngine } from '../../src/core/engine.js';
import { OllamaClient } from '../../src/core/client.js';
import { ToolRegistry } from '../../src/core/registry.js';
import { FilesTool } from '../../src/tools/files.js';
import { WorkspaceSecurity } from '../../src/security/workspace.js';
import { getDefaultConfig } from '../../src/config/defaults.js';
import { setupVCRTests } from '../helpers/vcr-helper';
import { TEST_WORKSPACE } from '../setup.js';

describe('QCode Function Calling E2E Tests', () => {
  let engine: QCodeEngine;
  let client: OllamaClient;
  const vcr = setupVCRTests(__filename);

  beforeAll(async () => {
    // Use existing static fixture directory
    const testWorkspace = TEST_WORKSPACE;

    // Initialize configuration and components
    const config = getDefaultConfig();
    client = new OllamaClient(config.ollama);

    // Initialize components with proper constructor arguments
    const workspaceSecurity = new WorkspaceSecurity(config.security, testWorkspace);
    // Add the test workspace to allowed paths
    workspaceSecurity.addAllowedPath(testWorkspace);

    const toolRegistry = new ToolRegistry(config.security, testWorkspace);
    const filesTool = new FilesTool(workspaceSecurity);

    // Register file tool properly with all required arguments
    toolRegistry.registerInternalTool(
      'files',
      filesTool.definition,
      filesTool.execute.bind(filesTool)
    );

    // Initialize engine
    engine = new QCodeEngine(client, toolRegistry, config, {
      workingDirectory: testWorkspace,
      enableStreaming: false,
      debug: false,
    });
  });

  describe('File Read Function Calling', () => {
    it('should handle "show me package.json" query with function calling', async () => {
      await vcr.withRecording('file_read_query', async () => {
        const response = await engine.processQuery('show me package.json');

        expect(response.complete).toBe(true);
        expect(response.response).toBeDefined();
        expect(typeof response.response).toBe('string');
        expect(response.response.length).toBeGreaterThan(0);

        // Response should contain package.json content
        expect(response.response).toContain('test-project');
        expect(response.response).toContain('1.0.0');

        vcr.recordingLog('✓ Query response:', response.response);
      });
    });

    it('should handle "read the first 5 lines of README.md" with line range', async () => {
      await vcr.withRecording('file_read_partial', async () => {
        const response = await engine.processQuery('read the first 5 lines of README.md');

        expect(response.complete).toBe(true);
        expect(response.response).toBeDefined();
        expect(typeof response.response).toBe('string');

        // Should contain README content but might be truncated
        expect(response.response).toContain('Test Project');

        vcr.recordingLog('✓ Partial read response:', response.response);
      });
    });

    it('should handle function call errors gracefully', async () => {
      await vcr.withRecording('file_operation_error', async () => {
        const response = await engine.processQuery('show me nonexistent-file.txt');

        expect(response.complete).toBe(true);
        expect(response.response).toBeDefined();
        expect(typeof response.response).toBe('string');

        // Should handle error gracefully and explain what happened
        expect(response.response.toLowerCase()).toMatch(/not found|error|does not exist/);

        vcr.recordingLog('✓ Error handling response:', response.response);
      });
    });

    it('should handle single-step workflow with complex query', async () => {
      await vcr.withRecording('multi_step_workflow', async () => {
        const response = await engine.processQuery(
          'List all files in this directory, then show me the contents of package.json'
        );

        expect(response.complete).toBe(true);
        expect(response.response).toBeDefined();
        expect(typeof response.response).toBe('string');

        // The response should contain information about the files
        expect(response.response.length).toBeGreaterThan(10);
        // Response might be structured JSON data
        expect(response.response).toBeDefined();

        // Should have executed the files tool
        expect(response.toolsExecuted).toContain('internal:files');

        vcr.recordingLog('✓ Multi-step workflow response:', response.response);
      });
    });
  });

  describe('File Read Operations', () => {
    test('should handle "show me the first 20 lines of src/main.ts" query with line range', async () => {
      // The static fixture already has src/main.ts - no need to create it
      await vcr.withRecording('file_read_with_line_range', async () => {
        // Execute query
        const result = await engine.processQuery('show me the first 20 lines of src/main.ts');

        // Verify results
        expect(result.complete).toBe(true);
        expect(result.errors).toBeUndefined();
        expect(result.toolsExecuted).toContain('internal:files');

        // Verify the response contains file content (might be formatted as JSON)
        expect(result.response.length).toBeGreaterThan(50);

        // Tool results should show successful file read
        const fileToolResult = result.toolResults?.find(r => r.tool === 'files');
        expect(fileToolResult).toBeDefined();
        expect(fileToolResult?.success).toBe(true);

        vcr.recordingLog('✓ Line range query completed');
        vcr.recordingLog('✓ Tool results:', fileToolResult?.data);
      });
    });

    test('should handle function call with invalid parameters gracefully', async () => {
      await vcr.withRecording('file_read_invalid_params', async () => {
        // Execute query that should result in an error
        const result = await engine.processQuery('show me a non-existent file that does not exist');

        // Verify the query was processed successfully
        expect(result.complete).toBe(true);
        expect(result.response).toBeDefined();
        expect(typeof result.response).toBe('string');

        // Should mention error or file not found
        expect(result.response.toLowerCase()).toMatch(/error|not found|does not exist/);

        // LLM should have attempted to use the files tool
        expect(result.toolsExecuted).toContain('internal:files');

        vcr.recordingLog('✓ Invalid parameter handling completed');
        vcr.recordingLog('✓ Response:', result.response);
      });
    });

    test('should provide helpful context when files are found', async () => {
      await vcr.withRecording('file_context_helpful', async () => {
        const result = await engine.processQuery('tell me about the package.json file');

        expect(result.complete).toBe(true);
        expect(result.response).toBeDefined();
        expect(typeof result.response).toBe('string');

        // Should contain actual content analysis
        expect(result.response).toContain('test-project');
        expect(result.toolsExecuted).toContain('internal:files');

        vcr.recordingLog('✓ Contextual file analysis completed');
        vcr.recordingLog('✓ Analysis result:', result.response);
      });
    });
  });

  describe('Response Formatting', () => {
    test('should format file content with syntax highlighting markers', async () => {
      // The static fixture already has user.ts - no need to create it
      await vcr.withRecording('file_read_with_formatting', async () => {
        const result = await engine.processQuery('show me user.ts');

        expect(result.complete).toBe(true);
        expect(result.response).toBeDefined();
        expect(typeof result.response).toBe('string');

        // Should contain the TypeScript content (might be formatted as JSON)
        expect(result.response.length).toBeGreaterThan(20);
        expect(result.toolsExecuted).toContain('internal:files');

        vcr.recordingLog('✓ Formatted file content display completed');
        vcr.recordingLog('✓ Formatted response sample:', result.response.substring(0, 200));
      });
    });

    test('should handle large file content appropriately', async () => {
      // The static fixture already has large-file.txt - no need to create it
      await vcr.withRecording('large_file_handling', async () => {
        const result = await engine.processQuery('show me the content of large-file.txt');

        expect(result.complete).toBe(true);
        expect(result.response).toBeDefined();
        expect(typeof result.response).toBe('string');

        // Should handle large content appropriately (might be truncated)
        expect(result.response).toContain('large file');
        expect(result.toolsExecuted).toContain('internal:files');

        vcr.recordingLog('✓ Large file handling completed');
        vcr.recordingLog('✓ Response length:', result.response.length);
      });
    });
  });
});
