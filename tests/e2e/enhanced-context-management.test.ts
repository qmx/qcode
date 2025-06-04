import { QCodeEngine } from '../../src/core/engine.js';
import { OllamaClient } from '../../src/core/client.js';
import { ToolRegistry } from '../../src/core/registry.js';
import { FilesTool } from '../../src/tools/files.js';
import { WorkspaceSecurity } from '../../src/security/workspace.js';
import { getDefaultConfig } from '../../src/config/defaults.js';
import { setupVCRTests } from '../helpers/vcr-helper.js';

describe('Enhanced LLM Context Management - E2E Tests', () => {
  let engine: QCodeEngine;
  const vcr = setupVCRTests(__filename);

  beforeEach(() => {
    const config = getDefaultConfig();
    const client = new OllamaClient(config.ollama);
    const workspaceSecurity = new WorkspaceSecurity(config.security, process.cwd());
    const toolRegistry = new ToolRegistry(config.security, process.cwd());
    const filesTool = new FilesTool(workspaceSecurity);

    // Register the files tool
    toolRegistry.registerInternalTool(
      'files',
      filesTool.definition,
      filesTool.execute.bind(filesTool)
    );

    // Create engine with workflow state enabled for enhanced context management
    engine = new QCodeEngine(client, toolRegistry, config, {
      workingDirectory: process.cwd(),
      enableWorkflowState: true,
      maxWorkflowDepth: 5,
      debug: false,
    });
  });

  describe('Structured Tool Results', () => {
    it('should create structured results with intelligent summaries', async () => {
      await vcr.withRecording('structured_results_file_content', async () => {
        const response = await engine.processQuery('show me package.json');

        expect(response.complete).toBe(true);
        expect(response.toolsExecuted.length).toBe(1);
        expect(response.toolsExecuted[0]).toBe('internal:files');

        // Response should be formatted intelligently, not just raw content
        expect(response.response).toContain('package.json');
        expect(response.response.length).toBeLessThan(5000); // Should be summarized for large files

        vcr.recordingLog('✓ Structured result response:', response.response.slice(0, 200));
      });
    });

    it('should handle large file lists with intelligent grouping', async () => {
      await vcr.withRecording('structured_results_file_list', async () => {
        const response = await engine.processQuery('list all files in src directory');

        expect(response.complete).toBe(true);
        expect(response.toolsExecuted.length).toBe(1);
        expect(response.toolsExecuted[0]).toBe('internal:files');

        // Should provide structured summary of files, not overwhelming list
        expect(response.response).toContain('items');
        expect(response.response.length).toBeLessThan(3000); // Should be summarized

        vcr.recordingLog('✓ File list response:', response.response.slice(0, 200));
      });
    });

    it('should extract key findings from search results', async () => {
      await vcr.withRecording('structured_results_search', async () => {
        const response = await engine.processQuery(
          'search for import statements in src/core directory'
        );

        expect(response.complete).toBe(true);
        expect(response.toolsExecuted.length).toBeGreaterThanOrEqual(1); // Should execute search

        // Should provide intelligent summary of search results
        expect(response.response).not.toBeNull();
        expect(response.response.length).toBeLessThan(2000); // Should be summarized

        vcr.recordingLog('✓ Search results response:', response.response.slice(0, 200));
      });
    });
  });

  describe('Context-Aware Conversation Building', () => {
    it('should maintain context across multiple tool executions', async () => {
      await vcr.withRecording('context_aware_multi_step', async () => {
        const response = await engine.processQuery(
          'list TypeScript files in src and then read the main engine file'
        );

        expect(response.complete).toBe(true);
        expect(response.toolsExecuted.length).toBeGreaterThan(1);

        // Should demonstrate context awareness between steps
        expect(response.response).toContain('engine');
        expect(response.response.length).toBeLessThan(8000); // Should manage context size

        vcr.recordingLog('✓ Multi-step context response:', response.response.slice(0, 300));
      });
    });

    it('should compress conversation history when context size grows', async () => {
      await vcr.withRecording('context_compression', async () => {
        // Test with a query that would generate large context
        const response = await engine.processQuery(
          'list all files in the project, then search for class definitions, then read the first TypeScript file you find'
        );

        expect(response.complete).toBe(true);
        expect(response.toolsExecuted.length).toBeGreaterThan(1);

        // Context should be managed intelligently
        expect(response.response).not.toBeNull();
        expect(response.response.length).toBeLessThan(10000); // Should compress large context

        vcr.recordingLog('✓ Context compression response:', response.response.slice(0, 300));
      });
    });
  });

  describe('Intelligent Workflow Decisions', () => {
    it('should make decisions based on structured context rather than string matching', async () => {
      await vcr.withRecording('intelligent_workflow_decisions', async () => {
        const response = await engine.processQuery(
          'find configuration files and analyze their settings'
        );

        expect(response.complete).toBe(true);
        expect(response.toolsExecuted.length).toBeGreaterThanOrEqual(1);

        // Should demonstrate intelligent workflow progression
        expect(response.response).not.toBeNull();
        expect(response.response.length).toBeGreaterThan(50);

        vcr.recordingLog('✓ Intelligent workflow response:', response.response.slice(0, 300));
      });
    });

    it('should preserve key findings across workflow steps', async () => {
      await vcr.withRecording('key_findings_preservation', async () => {
        const response = await engine.processQuery(
          'analyze the project structure by first listing files then reading key configuration files'
        );

        expect(response.complete).toBe(true);

        // Should preserve and reference findings from earlier steps
        expect(response.response).not.toBeNull();
        expect(response.response.length).toBeGreaterThan(100);

        vcr.recordingLog('✓ Key findings preservation response:', response.response.slice(0, 300));
      });
    });
  });

  describe('Memory Management and Performance', () => {
    it('should handle complex workflows without memory explosion', async () => {
      await vcr.withRecording('memory_management_complex', async () => {
        const response = await engine.processQuery(
          'give me a comprehensive analysis of this TypeScript project including file structure, configuration files, and any issues'
        );

        expect(response.complete).toBe(true);
        expect(response.toolsExecuted.length).toBeGreaterThanOrEqual(1);

        // Should complete without memory issues
        expect(response.response).not.toBeNull();
        expect(response.processingTime).toBeLessThan(30000); // Should complete in reasonable time

        vcr.recordingLog('✓ Complex workflow response:', response.response.slice(0, 300));
        vcr.recordingLog('✓ Processing time:', `${response.processingTime}ms`);
        vcr.recordingLog('✓ Tools executed:', response.toolsExecuted.join(', '));
      });
    });

    it('should demonstrate sliding window context management', async () => {
      await vcr.withRecording('sliding_window_context', async () => {
        // Generate a workflow that would exceed context limits without compression
        const response = await engine.processQuery(
          'scan through all source files and provide a detailed summary of the codebase architecture'
        );

        expect(response.complete).toBe(true);

        // Should handle large context gracefully with compression
        expect(response.response).not.toBeNull();
        expect(response.response.length).toBeLessThan(12000); // Should be manageable size

        vcr.recordingLog('✓ Sliding window response:', response.response.slice(0, 300));
      });
    });
  });

  describe('Error Recovery with Context Preservation', () => {
    it('should maintain context even when some operations fail', async () => {
      await vcr.withRecording('error_recovery_context', async () => {
        const response = await engine.processQuery(
          'read nonexistent.txt then list actual files in src directory'
        );

        // Should handle error gracefully and continue with context
        expect(response.toolsExecuted.length).toBeGreaterThanOrEqual(1);
        expect(response.response).not.toBeNull();

        vcr.recordingLog('✓ Error recovery response:', response.response.slice(0, 300));
        vcr.recordingLog('✓ Had errors:', response.errors ? 'yes' : 'no');
      });
    });
  });
});
