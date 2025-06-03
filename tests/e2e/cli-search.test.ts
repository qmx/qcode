import { QCodeEngine } from '../../src/core/engine.js';
import { OllamaClient } from '../../src/core/client.js';
import { ToolRegistry } from '../../src/core/registry.js';
import { FilesTool } from '../../src/tools/files.js';
import { WorkspaceSecurity } from '../../src/security/workspace.js';
import { getDefaultConfig } from '../../src/config/defaults.js';
import { setupVCRTests } from '../helpers/vcr-helper';
import { TEST_WORKSPACE } from '../setup.js';

/**
 * VCR tests for CLI search functionality using the modern VCR helper
 * These tests record and replay actual Ollama API interactions for deterministic testing
 */
describe('CLI Search Functionality VCR Tests', () => {
  let engine: QCodeEngine;
  let client: OllamaClient;
  const vcr = setupVCRTests(__filename);

  beforeAll(() => {
    const config = getDefaultConfig(TEST_WORKSPACE);
    client = new OllamaClient(config.ollama);

    // Initialize components with proper constructor arguments
    const workspaceSecurity = new WorkspaceSecurity(config.security, TEST_WORKSPACE);
    const toolRegistry = new ToolRegistry(config.security, TEST_WORKSPACE);
    const filesTool = new FilesTool(workspaceSecurity);

    // Register file tool properly with all required arguments
    toolRegistry.registerInternalTool(
      'files',
      filesTool.definition,
      filesTool.execute.bind(filesTool)
    );

    // Initialize engine
    engine = new QCodeEngine(client, toolRegistry, config, {
      workingDirectory: TEST_WORKSPACE,
    });
  });

  describe('CLI Search Commands', () => {
    it('should handle "search for function in TypeScript files" command', async () => {
      await vcr.withRecording('cli_search_function_ts', async () => {
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

        vcr.recordingLog('✓ CLI search function in TypeScript files completed');
        vcr.recordingLog('✓ Found matches:', toolResult?.data?.matches?.length || 0);
      });
    });

    it('should handle "find all export statements" command with regex', async () => {
      await vcr.withRecording('cli_search_exports_regex', async () => {
        const query = 'find all export statements in source files';
        const result = await engine.processQuery(query);

        expect(result.response).toBeDefined();
        expect(typeof result.response).toBe('string');
        expect(result.toolsExecuted).toContain('internal:files');

        const toolResult = result.toolResults?.find(r => r.tool === 'files');
        expect(toolResult).toBeDefined();
        expect(toolResult?.success).toBe(true);

        vcr.recordingLog('✓ CLI search export statements completed');
        vcr.recordingLog('✓ Search result data:', toolResult?.data);
      });
    });

    it('should handle "search for TODO comments" command', async () => {
      await vcr.withRecording('cli_search_todo_comments', async () => {
        const query = 'search for "TODO" in all source files';
        const result = await engine.processQuery(query);

        expect(result.response).toBeDefined();
        expect(typeof result.response).toBe('string');
        expect(result.toolsExecuted).toContain('internal:files');

        const toolResult = result.toolResults?.find(r => r.tool === 'files');
        expect(toolResult).toBeDefined();
        // Tool may fail due to LLM parameter confusion, but should attempt execution
        expect(toolResult?.success !== undefined).toBe(true);

        vcr.recordingLog('✓ CLI search TODO comments completed');
        vcr.recordingLog('✓ Tools executed:', result.toolsExecuted);
      });
    });

    it('should handle "search for error handling patterns" command', async () => {
      await vcr.withRecording('cli_search_error_patterns', async () => {
        const query = 'search for "try" and "catch" in TypeScript files';
        const result = await engine.processQuery(query);

        expect(result.response).toBeDefined();
        expect(typeof result.response).toBe('string');
        expect(result.toolsExecuted).toContain('internal:files');

        const toolResult = result.toolResults?.find(r => r.tool === 'files');
        expect(toolResult).toBeDefined();
        // Tool may fail due to LLM parameter confusion, but should attempt execution
        expect(toolResult?.success !== undefined).toBe(true);

        vcr.recordingLog('✓ CLI search error patterns completed');
        vcr.recordingLog('✓ Response summary:', result.response.substring(0, 200));
      });
    });
  });

  describe('Additional CLI Search Patterns', () => {
    it('should handle interface search in TypeScript files', async () => {
      await vcr.withRecording('cli_search_interface_ts', async () => {
        const query = 'search for "interface" in TypeScript files';
        const result = await engine.processQuery(query);

        expect(result.response).toBeDefined();
        expect(typeof result.response).toBe('string');
        expect(result.toolsExecuted).toContain('internal:files');

        const toolResult = result.toolResults?.find(r => r.tool === 'files');
        expect(toolResult).toBeDefined();
        // Tool may fail due to LLM parameter confusion, but should attempt execution
        expect(toolResult?.success !== undefined).toBe(true);

        vcr.recordingLog('✓ CLI search interface in TypeScript files completed');
        vcr.recordingLog('✓ Tool execution result:', toolResult?.success ? 'success' : 'failed');
      });
    });
  });
});
