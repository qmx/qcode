/**
 * E2E tests for Workflow State Management using real Ollama interactions
 * These tests record and replay multi-step workflows with context preservation
 *
 * 📋 Follows VCR testing standards and uses the modern VCR helper pattern
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { QCodeEngine } from '../../src/core/engine.js';
import { OllamaClient } from '../../src/core/client.js';
import { ToolRegistry } from '../../src/core/registry.js';
import { WorkspaceSecurity } from '../../src/security/workspace.js';
import { FilesTool } from '../../src/tools/files.js';
import { getDefaultConfig } from '../../src/config/defaults.js';
import { setupVCRTests } from '../helpers/vcr-helper.js';

describe('Workflow State Management - E2E Tests', () => {
  let engine: QCodeEngine;
  const vcr = setupVCRTests(__filename);

  beforeEach(() => {
    // Setup real engine with all components following canonical example
    const config = getDefaultConfig();
    const ollamaClient = new OllamaClient(config.ollama);
    const toolRegistry = new ToolRegistry(config.security, config.workingDirectory);
    const workspaceSecurity = new WorkspaceSecurity(config.security, config.workingDirectory);

    // Register internal file operations tool
    const filesTool = new FilesTool(workspaceSecurity);
    toolRegistry.registerInternalTool(
      'files',
      filesTool.definition,
      filesTool.execute.bind(filesTool)
    );

    // Create engine instance with real components
    engine = new QCodeEngine(ollamaClient, toolRegistry, config, {
      workingDirectory: config.workingDirectory,
      enableStreaming: false,
      debug: false,
    });
  });

  describe('Multi-Step Workflow Context', () => {
    it('should preserve context across sequential file operations', async () => {
      await vcr.withRecording('multi_step_file_operations', async () => {
        // Single query that requires multiple file operations with context preservation
        const multiStepQuery = `First list all TypeScript files in src/, then read the main engine file from those files and analyze its content for classes and methods`;

        const response = await engine.processQuery(multiStepQuery);

        expect(response.complete).toBe(true);
        expect(response.toolsExecuted).toContain('internal:files');
        expect(response.response.toLowerCase()).toContain('.ts');
        expect(response.response.toLowerCase()).toContain('engine');
        expect(response.response.toLowerCase()).toMatch(/class|method|function|export/);

        vcr.recordingLog('✓ Multi-step workflow response:', response.response);
      });
    });

    it('should handle workflow error recovery gracefully', async () => {
      await vcr.withRecording('workflow_error_recovery', async () => {
        // STEP 1: Try to read a non-existent file (should fail gracefully)
        const errorResponse = await engine.processQuery('read the file non-existent-file.txt');

        expect(errorResponse.complete).toBe(true); // Engine handles error gracefully
        expect(errorResponse.response.toLowerCase()).toContain('error');

        vcr.recordingLog('✓ Error handled gracefully:', errorResponse.response);

        // STEP 2: Recover by listing actual files (should not be affected by previous error)
        const recoveryResponse = await engine.processQuery(
          'list the actual files in the current directory'
        );

        expect(recoveryResponse.complete).toBe(true);
        expect(recoveryResponse.toolsExecuted).toContain('internal:files');
        expect(recoveryResponse.response.toLowerCase()).toMatch(/package\.json|files|found|items/);

        vcr.recordingLog('✓ Recovery successful:', recoveryResponse.response);

        // STEP 3: Successfully read an existing file (workflow should continue normally)
        const successResponse = await engine.processQuery('now read package.json');

        expect(successResponse.complete).toBe(true);
        expect(successResponse.toolsExecuted).toContain('internal:files');
        expect(successResponse.response.toLowerCase()).toMatch(
          /"name"|package|json|content|summary/
        );

        vcr.recordingLog('✓ Workflow continued successfully:', successResponse.response);
      });
    });
  });

  describe('Context-Aware Decision Making', () => {
    it('should make intelligent decisions based on previous tool results', async () => {
      await vcr.withRecording('context_aware_decisions', async () => {
        // Single query that requires intelligent decision making based on findings
        const intelligentQuery = `Analyze the project structure, find the configuration files like package.json or tsconfig.json, then read package.json and explain its purpose`;

        const response = await engine.processQuery(intelligentQuery);

        expect(response.complete).toBe(true);
        expect(response.toolsExecuted).toContain('internal:files');
        expect(response.response.toLowerCase()).toContain('package');

        vcr.recordingLog('✓ Context-aware decision made:', response.response);
      });
    });

    it('should handle complex project understanding workflow', async () => {
      await vcr.withRecording('complex_project_understanding', async () => {
        // Complex workflow: Find all dependencies and analyze project health
        const complexQuery = `
          I need you to analyze this TypeScript project:
          1. First, find and read package.json to understand dependencies
          2. Then look at the source code structure in src/
          3. Finally, give me a summary of the project architecture and any potential issues
        `;

        const complexResponse = await engine.processQuery(complexQuery);

        expect(complexResponse.complete).toBe(true);
        expect(complexResponse.toolsExecuted).toContain('internal:files');
        expect(complexResponse.response.toLowerCase()).toMatch(
          /dependencies|package|json|typescript|summary|findings/
        );
        expect(complexResponse.response.toLowerCase()).toContain('typescript');

        vcr.recordingLog('✓ Complex project analysis completed:', complexResponse.response);
      });
    });
  });

  describe('Workflow State Persistence', () => {
    it('should maintain context across tool execution boundaries', async () => {
      await vcr.withRecording('context_persistence', async () => {
        // Single query that tests context maintenance within a workflow
        const contextQuery = `List files in src/ and then tell me what you found`;

        const response = await engine.processQuery(contextQuery);

        expect(response.complete).toBe(true);
        expect(response.toolsExecuted).toContain('internal:files');
        expect(response.response.toLowerCase()).toContain('src');

        vcr.recordingLog('✓ Context maintained across boundaries:', response.response);
      });
    });
  });
});
