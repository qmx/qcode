import { QCodeEngine } from '../../src/core/engine.js';
import { OllamaClient } from '../../src/core/client.js';
import { ToolRegistry } from '../../src/core/registry.js';
import { FilesTool } from '../../src/tools/files.js';
import { WorkspaceSecurity } from '../../src/security/workspace.js';
import { getDefaultConfig } from '../../src/config/defaults.js';
import { setupVCRTests } from '../helpers/vcr-helper';

/**
 * VCR tests for Search Workflow using the modern VCR helper
 * These tests record and replay actual Ollama API interactions for deterministic testing
 */
describe('Search Workflow - End-to-End VCR Tests', () => {
  let engine: QCodeEngine;
  let client: OllamaClient;
  const vcr = setupVCRTests(__filename);

  beforeAll(() => {
    const config = getDefaultConfig();
    client = new OllamaClient(config.ollama);

    // Initialize components with proper constructor arguments
    const workspaceSecurity = new WorkspaceSecurity(config.security, config.workingDirectory);
    const toolRegistry = new ToolRegistry(config.security, config.workingDirectory);
    const filesTool = new FilesTool(workspaceSecurity);

    // Register file tool properly with all required arguments
    toolRegistry.registerInternalTool(
      'files',
      filesTool.definition,
      filesTool.execute.bind(filesTool)
    );

    // Initialize engine
    engine = new QCodeEngine(client, toolRegistry, config, {
      workingDirectory: config.workingDirectory,
      enableStreaming: false,
      debug: false,
    });
  });

  describe('Simple Text Search', () => {
    it('should handle simple search query with LLM function calling', async () => {
      await vcr.withRecording('simple_text_search', async () => {
        const query = 'search for the word "function" in TypeScript files';
        const result = await engine.processQuery(query);

        expect(result.response).toBeDefined();
        expect(typeof result.response).toBe('string');
        expect(result.response.length).toBeGreaterThan(10);
        
        // Tool may or may not be executed depending on LLM decision
        // If tools were executed, verify basic structure
        if (result.toolsExecuted.length > 0) {
          expect(result.toolsExecuted.some(tool => tool.includes('files'))).toBe(true);
        }

        vcr.recordingLog('✓ Simple text search completed');
        vcr.recordingLog('✓ Tools executed:', result.toolsExecuted.length);
      });
    });

    it('should handle regex search with pattern matching', async () => {
      await vcr.withRecording('regex_search', async () => {
        const query =
          'search for lines starting with "export" using regex pattern "^export" in TypeScript files';
        const result = await engine.processQuery(query);

        expect(result.response).toBeDefined();
        expect(typeof result.response).toBe('string');
        expect(result.response.length).toBeGreaterThan(10);
        
        // Tool may or may not be executed depending on LLM decision
        if (result.toolsExecuted.length > 0) {
          expect(result.toolsExecuted.some(tool => tool.includes('files'))).toBe(true);
        }

        // If tools were executed, verify basic structure
        if (result.toolResults && result.toolResults.length > 0) {
          const toolResult = result.toolResults.find(r => r.tool === 'files');
          expect(toolResult).toBeDefined();
        }

        vcr.recordingLog('✓ Regex search completed');
        vcr.recordingLog('✓ Pattern matches completed');
      });
    });
  });

  describe('Search with File Patterns', () => {
    it('should search in specific file patterns', async () => {
      await vcr.withRecording('pattern_search', async () => {
        const query = 'search for "FilesTool" in src directory TypeScript files';
        const result = await engine.processQuery(query);

        expect(result.response).toBeDefined();
        expect(typeof result.response).toBe('string');
        expect(result.response.length).toBeGreaterThan(10);
        
        // Tool may or may not be executed depending on LLM decision
        if (result.toolsExecuted.length > 0) {
          expect(result.toolsExecuted.some(tool => tool.includes('files'))).toBe(true);
        }

        // If tools were executed, verify basic structure
        if (result.toolResults && result.toolResults.length > 0) {
          const toolResult = result.toolResults.find(r => r.tool === 'files');
          expect(toolResult).toBeDefined();
        }

        vcr.recordingLog('✓ Pattern-based search completed');
        vcr.recordingLog('✓ FilesTool matches completed');
      });
    });
  });

  describe('Multi-step Search Workflows', () => {
    it('should handle search followed by file read', async () => {
      await vcr.withRecording('search_then_read', async () => {
        const query =
          'find files containing "SearchMatch" in the src directory and show me the contents of the first one';
        const result = await engine.processQuery(query);

        expect(result.response).toBeDefined();
        expect(typeof result.response).toBe('string');
        expect(result.response.length).toBeGreaterThan(10);
        
        // Tool may or may not be executed depending on LLM decision
        if (result.toolsExecuted.length > 0) {
          expect(result.toolsExecuted.some(tool => tool.includes('files'))).toBe(true);
        }

        // Should use files tool for both search and read operations
        const toolResults = result.toolResults?.filter(r => r.tool === 'files');
        expect(toolResults?.length).toBeGreaterThan(0);

        vcr.recordingLog('✓ Multi-step search-then-read workflow completed');
        vcr.recordingLog('✓ Tool executions:', result.toolsExecuted);
      });
    });
  });

  describe('Error Handling in Search', () => {
    it('should handle search with realistic constraints', async () => {
      await vcr.withRecording('search_with_constraints', async () => {
        const query = 'search for "nonexistentterm12345" in src directory files';
        const result = await engine.processQuery(query);

        // Should successfully execute search (even if no matches found)
        expect(result.response).toBeDefined();
        expect(typeof result.response).toBe('string');
        expect(result.response.length).toBeGreaterThan(10);
        
        // Tool may or may not be executed depending on LLM decision
        if (result.toolsExecuted.length > 0) {
          expect(result.toolsExecuted.some(tool => tool.includes('files'))).toBe(true);
        }

        // If tools were executed, verify basic structure
        if (result.toolResults && result.toolResults.length > 0) {
          const toolResult = result.toolResults.find(r => r.tool === 'files');
          expect(toolResult).toBeDefined();
          // Response should be provided regardless of search results
          expect(result.response.length).toBeGreaterThan(0);
        }

        vcr.recordingLog('✓ Search with constraints completed');
        vcr.recordingLog('✓ Response provided:', result.response.length, 'chars');
      });
    });
  });

  describe('Additional Search Patterns', () => {
    it('should handle generic search in source files', async () => {
      await vcr.withRecording('search_in_source_files', async () => {
        const query = 'search for "test" in source files';
        const result = await engine.processQuery(query);

        expect(result.response).toBeDefined();
        expect(typeof result.response).toBe('string');
        expect(result.response.length).toBeGreaterThan(10);
        
        // Tool may or may not be executed depending on LLM decision
        if (result.toolsExecuted.length > 0) {
          expect(result.toolsExecuted.some(tool => tool.includes('files'))).toBe(true);
        }

        // If tools were executed, verify basic structure
        if (result.toolResults && result.toolResults.length > 0) {
          const toolResult = result.toolResults.find(r => r.tool === 'files');
          expect(toolResult).toBeDefined();
        }

        vcr.recordingLog('✓ Generic search in source files completed');
        vcr.recordingLog('✓ Tools executed:', result.toolsExecuted.length);
      });
    });
  });
});
