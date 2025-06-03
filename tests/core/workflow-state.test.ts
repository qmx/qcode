import { WorkflowState, WorkflowContext, WorkflowError } from '../../src/core/workflow-state.js';
import { ToolResult, QCodeError } from '../../src/types.js';
import { QCodeEngine } from '../../src/core/engine.js';

describe('WorkflowState', () => {
  let workflowState: WorkflowState;
  let mockContext: WorkflowContext;

  beforeEach(() => {
    mockContext = {
      workingDirectory: '/test/workspace',
      security: {
        workspace: {
          allowedPaths: ['/test/workspace'],
          forbiddenPatterns: [],
          allowOutsideWorkspace: false,
        },
        commands: {
          allowedCommands: [],
          forbiddenPatterns: [],
          allowArbitraryCommands: false,
        },
      },
      registry: {},
      query: 'test query',
      requestId: 'test-request-id',
      // WorkflowContext specific properties
      workflowId: 'test-workflow-123',
      depth: 0,
      maxDepth: 10,
    };

    workflowState = new WorkflowState('test-workflow-123', mockContext);
  });

  describe('initialization', () => {
    it('should initialize with basic workflow state', () => {
      expect(workflowState.getId()).toBe('test-workflow-123');
      expect(workflowState.getStatus()).toBe('initialized');
      expect(workflowState.getSteps()).toEqual([]);
      expect(workflowState.getResults()).toEqual({});
      expect(workflowState.getErrors()).toEqual([]);
    });

    it('should track creation time', () => {
      const beforeTime = Date.now();
      const newWorkflow = new WorkflowState('time-test', mockContext);
      const afterTime = Date.now();

      const createdAt = newWorkflow.getCreatedAt().getTime();
      expect(createdAt).toBeGreaterThanOrEqual(beforeTime);
      expect(createdAt).toBeLessThanOrEqual(afterTime);
    });

    it('should accept optional parent workflow', () => {
      const parentWorkflow = new WorkflowState('parent-123', mockContext);
      const childContext = { ...mockContext, parentWorkflowId: 'parent-123', depth: 1 };
      const childWorkflow = new WorkflowState('child-456', childContext, parentWorkflow);

      expect(childWorkflow.getParent()).toBe(parentWorkflow);
      expect(childWorkflow.getDepth()).toBe(1);
    });
  });

  describe('step management', () => {
    it('should start a workflow step', async () => {
      const stepId = await workflowState.startStep('test-step', 'internal.files.read', {
        file: 'test.txt',
      });

      expect(stepId).toBeDefined();
      expect(typeof stepId).toBe('string');

      const steps = workflowState.getSteps();
      expect(steps).toHaveLength(1);

      const firstStep = steps[0];
      expect(firstStep).toBeDefined();
      expect(firstStep!.id).toBe(stepId);
      expect(firstStep!.name).toBe('test-step');
      expect(firstStep!.toolName).toBe('internal.files.read');
      expect(firstStep!.arguments).toEqual({ file: 'test.txt' });
      expect(firstStep!.status).toBe('running');
      expect(firstStep!.startTime).toBeDefined();
    });

    it('should complete a workflow step successfully', async () => {
      const stepId = await workflowState.startStep('test-step', 'internal.files.read', {
        file: 'test.txt',
      });

      const result: ToolResult = {
        success: true,
        data: 'file content',
        duration: 100,
        tool: 'internal.files.read',
        namespace: 'internal',
      };

      await workflowState.completeStep(stepId, result);

      const steps = workflowState.getSteps();
      const firstStep = steps[0];
      expect(firstStep).toBeDefined();
      expect(firstStep!.status).toBe('completed');
      expect(firstStep!.result).toBe(result);
      expect(firstStep!.endTime).toBeDefined();
      expect(firstStep!.duration).toBeGreaterThanOrEqual(0);

      // Result should be stored for context
      const results = workflowState.getResults();
      expect(results[stepId]).toBe(result);
    });

    it('should handle step failures', async () => {
      const stepId = await workflowState.startStep('failing-step', 'internal.files.read', {
        file: 'nonexistent.txt',
      });
      const error = new QCodeError('File not found', 'FILE_NOT_FOUND');

      await workflowState.failStep(stepId, error);

      const steps = workflowState.getSteps();
      const firstStep = steps[0];
      expect(firstStep).toBeDefined();
      expect(firstStep!.status).toBe('failed');
      expect(firstStep!.error).toBe(error);
      expect(firstStep!.endTime).toBeDefined();

      const errors = workflowState.getErrors();
      expect(errors).toContain(error);
    });

    it('should prevent operations on non-existent steps', async () => {
      const nonExistentStepId = 'fake-step-id';
      const result: ToolResult = {
        success: true,
        data: 'test',
        duration: 100,
        tool: 'test',
        namespace: 'test',
      };

      await expect(workflowState.completeStep(nonExistentStepId, result)).rejects.toThrow(
        WorkflowError
      );

      const error = new QCodeError('Test error', 'TEST_ERROR');
      await expect(workflowState.failStep(nonExistentStepId, error)).rejects.toThrow(WorkflowError);
    });
  });

  describe('context management', () => {
    it('should provide access to previous step results', async () => {
      // Execute first step
      const step1Id = await workflowState.startStep('read-file', 'internal.files.read', {
        file: 'package.json',
      });
      const step1Result: ToolResult = {
        success: true,
        data: '{"name": "test-project"}',
        duration: 50,
        tool: 'internal.files.read',
        namespace: 'internal',
      };
      await workflowState.completeStep(step1Id, step1Result);

      // Execute second step that depends on first
      const step2Id = await workflowState.startStep('parse-package', 'internal.analyze', {
        content: workflowState.getStepResult(step1Id)?.data,
      });

      const step2Args = workflowState.getStepById(step2Id)?.arguments;
      expect(step2Args?.content).toBe('{"name": "test-project"}');

      // Complete second step
      const step2Result: ToolResult = {
        success: true,
        data: { name: 'test-project' },
        duration: 25,
        tool: 'internal.analyze',
        namespace: 'internal',
      };
      await workflowState.completeStep(step2Id, step2Result);

      // Verify both results are accessible
      expect(workflowState.getStepResult(step1Id)).toBe(step1Result);
      expect(workflowState.getStepResult(step2Id)).toBe(step2Result);
    });

    it('should track workflow execution context', () => {
      const context = workflowState.getContext();
      expect(context.workflowId).toBe('test-workflow-123');
      expect(context.query).toBe('test query');
      expect(context.requestId).toBe('test-request-id');
      expect(context.depth).toBe(0);
    });

    it('should provide workflow summary', async () => {
      // Execute multiple steps
      const step1Id = await workflowState.startStep('step1', 'tool1', {});
      const step2Id = await workflowState.startStep('step2', 'tool2', {});

      await workflowState.completeStep(step1Id, {
        success: true,
        data: 'result1',
        duration: 100,
        tool: 'tool1',
        namespace: 'test',
      });

      const error = new QCodeError('Step 2 failed', 'STEP2_ERROR');
      await workflowState.failStep(step2Id, error);

      const summary = workflowState.getSummary();
      expect(summary.id).toBe('test-workflow-123');
      expect(summary.status).toBe('failed'); // Because one step failed
      expect(summary.totalSteps).toBe(2);
      expect(summary.completedSteps).toBe(1);
      expect(summary.failedSteps).toBe(1);
      expect(summary.duration).toBeGreaterThanOrEqual(0);
      expect(summary.errors).toHaveLength(1);
    });
  });

  describe('workflow interruption and resumption', () => {
    it('should support workflow interruption', async () => {
      const step1Id = await workflowState.startStep('long-running-step', 'tool1', {});

      // Interrupt workflow
      await workflowState.interrupt('User requested cancellation');

      expect(workflowState.getStatus()).toBe('interrupted');
      expect(workflowState.getInterruptReason()).toBe('User requested cancellation');

      // Running steps should be marked as interrupted
      const step = workflowState.getStepById(step1Id);
      expect(step?.status).toBe('interrupted');
    });

    it('should support workflow resumption from checkpoint', async () => {
      // Execute first step
      const step1Id = await workflowState.startStep('step1', 'tool1', {});
      await workflowState.completeStep(step1Id, {
        success: true,
        data: 'result1',
        duration: 100,
        tool: 'tool1',
        namespace: 'test',
      });

      // Create checkpoint
      const checkpoint = workflowState.createCheckpoint();
      expect(checkpoint.workflowId).toBe('test-workflow-123');
      expect(checkpoint.completedSteps).toHaveLength(1);

      // Simulate interruption and restoration
      const newWorkflow = WorkflowState.fromCheckpoint(checkpoint, mockContext);
      expect(newWorkflow.getId()).toBe('test-workflow-123');
      expect(newWorkflow.getSteps()).toHaveLength(1);
      expect(newWorkflow.getStepResult(step1Id)?.data).toBe('result1');
    });

    it('should handle resume with context updates', async () => {
      const step1Id = await workflowState.startStep('step1', 'tool1', {});
      await workflowState.completeStep(step1Id, {
        success: true,
        data: 'result1',
        duration: 100,
        tool: 'tool1',
        namespace: 'test',
      });

      const checkpoint = workflowState.createCheckpoint();

      // Resume with updated context
      const updatedContext = { ...mockContext, query: 'updated query' };
      const resumedWorkflow = WorkflowState.fromCheckpoint(checkpoint, updatedContext);

      expect(resumedWorkflow.getContext().query).toBe('updated query');
      expect(resumedWorkflow.getSteps()).toHaveLength(1); // Previous step preserved
    });
  });

  describe('error recovery and rollback', () => {
    it('should support rollback to previous checkpoint', async () => {
      // Execute and checkpoint after first step
      const step1Id = await workflowState.startStep('step1', 'tool1', {});
      await workflowState.completeStep(step1Id, {
        success: true,
        data: 'result1',
        duration: 100,
        tool: 'tool1',
        namespace: 'test',
      });

      const checkpoint = workflowState.createCheckpoint();

      // Execute second step and fail
      const step2Id = await workflowState.startStep('step2', 'tool2', {});
      const error = new QCodeError('Critical error', 'CRITICAL_ERROR');
      await workflowState.failStep(step2Id, error);

      // Rollback to checkpoint
      await workflowState.rollbackToCheckpoint(checkpoint);

      expect(workflowState.getSteps()).toHaveLength(1);
      expect(workflowState.getStepById(step2Id)).toBeUndefined();
      expect(workflowState.getErrors()).toHaveLength(0); // Errors cleared after rollback
    });

    it('should track rollback history', async () => {
      const step1Id = await workflowState.startStep('step1', 'tool1', {});
      await workflowState.completeStep(step1Id, {
        success: true,
        data: 'result1',
        duration: 100,
        tool: 'tool1',
        namespace: 'test',
      });

      const checkpoint = workflowState.createCheckpoint();

      const step2Id = await workflowState.startStep('step2', 'tool2', {});
      const error = new QCodeError('Error requiring rollback', 'ROLLBACK_ERROR');
      await workflowState.failStep(step2Id, error);

      await workflowState.rollbackToCheckpoint(checkpoint);

      const rollbackHistory = workflowState.getRollbackHistory();
      expect(rollbackHistory).toHaveLength(1);

      const firstRollback = rollbackHistory[0];
      expect(firstRollback).toBeDefined();
      expect(firstRollback!.reason).toContain('Rollback'); // Updated to match actual string with capital R
      expect(firstRollback!.stepsRolledBack).toBe(1);
    });
  });

  describe('memory management and cleanup', () => {
    it('should cleanup workflow resources', async () => {
      // Execute multiple steps with large data
      const largeData = 'x'.repeat(10000); // 10KB of data

      const step1Id = await workflowState.startStep('step1', 'tool1', {});
      await workflowState.completeStep(step1Id, {
        success: true,
        data: largeData,
        duration: 100,
        tool: 'tool1',
        namespace: 'test',
      });

      const step2Id = await workflowState.startStep('step2', 'tool2', {});
      await workflowState.completeStep(step2Id, {
        success: true,
        data: largeData,
        duration: 100,
        tool: 'tool2',
        namespace: 'test',
      });

      expect(workflowState.getSteps()).toHaveLength(2);
      expect(Object.keys(workflowState.getResults())).toHaveLength(2);

      // Cleanup should clear intermediate results but preserve essential data
      await workflowState.cleanup();

      expect(workflowState.getStatus()).toBe('completed');
      // Steps structure should remain but large data might be cleaned
      expect(workflowState.getSteps()).toHaveLength(2);
    });

    it('should track memory usage', async () => {
      const initialMemory = workflowState.getMemoryUsage();
      expect(initialMemory.stepsCount).toBe(0);
      expect(initialMemory.resultsSize).toBe(0);

      const largeData = { content: 'x'.repeat(5000) };
      const stepId = await workflowState.startStep('memory-test', 'tool1', {});
      await workflowState.completeStep(stepId, {
        success: true,
        data: largeData,
        duration: 100,
        tool: 'tool1',
        namespace: 'test',
      });

      const updatedMemory = workflowState.getMemoryUsage();
      expect(updatedMemory.stepsCount).toBe(1);
      expect(updatedMemory.resultsSize).toBeGreaterThan(initialMemory.resultsSize);
    });

    it('should support partial cleanup of old results', async () => {
      // Execute multiple steps
      const steps: string[] = [];
      for (let i = 0; i < 5; i++) {
        const stepId = await workflowState.startStep(`step${i}`, 'tool1', {});
        await workflowState.completeStep(stepId, {
          success: true,
          data: `result${i}`,
          duration: 100,
          tool: 'tool1',
          namespace: 'test',
        });
        steps.push(stepId);
      }

      expect(workflowState.getSteps()).toHaveLength(5);

      // Cleanup keeping only last 2 results
      await workflowState.cleanupOldResults(2);

      const results = workflowState.getResults();
      expect(Object.keys(results)).toHaveLength(2);

      // Most recent results should be preserved
      expect(results[steps[3]!]).toBeDefined();
      expect(results[steps[4]!]).toBeDefined();
      expect(results[steps[0]!]).toBeUndefined();
    });
  });

  describe('nested workflows', () => {
    it('should support child workflows', async () => {
      const parentStep = await workflowState.startStep('parent-step', 'complex-tool', {});

      // Create child workflow
      const childContext = {
        ...mockContext,
        parentWorkflowId: 'test-workflow-123',
        workflowId: 'child-workflow-456',
        depth: 1,
      };
      const childWorkflow = workflowState.createChildWorkflow('child-workflow-456', childContext);

      expect(childWorkflow.getParent()).toBe(workflowState);
      expect(childWorkflow.getDepth()).toBe(1);
      expect(childWorkflow.getId()).toBe('child-workflow-456');

      // Execute child workflow steps
      const childStepId = await childWorkflow.startStep('child-step', 'child-tool', {});
      await childWorkflow.completeStep(childStepId, {
        success: true,
        data: 'child-result',
        duration: 50,
        tool: 'child-tool',
        namespace: 'test',
      });

      // Complete parent step with child result
      await workflowState.completeStep(parentStep, {
        success: true,
        data: childWorkflow.getSummary(),
        duration: 200,
        tool: 'complex-tool',
        namespace: 'test',
      });

      expect(workflowState.getStatus()).toBe('completed');
      expect(childWorkflow.getStatus()).toBe('completed');
    });

    it('should enforce maximum workflow depth', () => {
      const deepContext = { ...mockContext, depth: 10, maxDepth: 10 };
      const deepWorkflow = new WorkflowState('deep-workflow', deepContext);

      expect(() => {
        deepWorkflow.createChildWorkflow('too-deep', { ...deepContext, depth: 11 });
      }).toThrow(WorkflowError);
    });
  });
});

describe('WorkflowError', () => {
  it('should extend QCodeError with workflow-specific information', () => {
    const workflowError = new WorkflowError('Workflow step failed', 'WORKFLOW_STEP_FAILED', {
      stepId: 'step-123',
      workflowId: 'workflow-456',
    });

    expect(workflowError).toBeInstanceOf(QCodeError);
    expect(workflowError.code).toBe('WORKFLOW_STEP_FAILED');
    expect(workflowError.context?.stepId).toBe('step-123');
    expect(workflowError.context?.workflowId).toBe('workflow-456');
  });
});

/**
 * VCR tests for Workflow State Management using real Ollama interactions
 * These tests record and replay multi-step workflows with context preservation
 *
 * 📋 Follows canonical example: tests/integration/ollama-client.test.ts
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from '@jest/globals';
import { OllamaClient } from '../../src/core/client.js';
import { ToolRegistry } from '../../src/core/registry.js';
import { Config } from '../../src/types.js';
import { getDefaultConfig } from '../../src/config/defaults.js';
import { FilesTool } from '../../src/tools/files.js';
import nock from 'nock';
import fs from 'fs/promises';
import path from 'path';

describe('Workflow State Management - VCR Tests', () => {
  let engine: QCodeEngine;
  let ollamaClient: OllamaClient;
  let toolRegistry: ToolRegistry;
  let config: Config;
  let recordingsPath: string;

  beforeAll(async () => {
    recordingsPath = path.join(__dirname, '../fixtures/recordings/workflow');
    await fs.mkdir(recordingsPath, { recursive: true });
  });

  beforeEach(() => {
    // Configure nock for recording/replaying (following canonical example)
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

    // Setup real configuration and clients (following canonical example)
    config = getDefaultConfig();
    ollamaClient = new OllamaClient(config.ollama);
    toolRegistry = new ToolRegistry(config.security);

    // Register the FilesTool
    const filesTool = new FilesTool(toolRegistry['_security']);
    toolRegistry.registerInternalTool(
      'files',
      filesTool.definition,
      filesTool.execute.bind(filesTool)
    );

    // Create engine instance with real components
    engine = new QCodeEngine(ollamaClient, toolRegistry, config);
  });

  afterEach(async () => {
    if (process.env.NOCK_MODE === 'record') {
      nock.recorder.clear();
    } else {
      // Clean up any remaining mocks
      nock.cleanAll();
    }
  });

  // Helper function to handle recording with proper cleanup
  async function withRecording<T>(testName: string, testFn: () => Promise<T>): Promise<T> {
    if (process.env.NOCK_MODE !== 'record') {
      // REPLAY MODE: Load and apply recorded interactions
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
        throw new Error(
          `❌ VCR Recording missing for test "${testName}". Run: NOCK_MODE=record npm test -- ${__filename} to record it.`
        );
      }
    }

    try {
      const result = await testFn();
      return result;
    } finally {
      // Always save recording, even if test fails
      if (process.env.NOCK_MODE === 'record') {
        const recordings = nock.recorder.play();
        if (recordings.length > 0) {
          const recordingFile = path.join(recordingsPath, `${testName}.json`);
          await fs.writeFile(recordingFile, JSON.stringify(recordings, null, 2));
          console.log(`📼 Recorded ${recordings.length} HTTP interactions to ${recordingFile}`);
        }
      }
    }
  }

  describe('Multi-Step Workflow Context', () => {
    it('should preserve context across sequential file operations', async () => {
      const testName = 'multi_step_file_operations';

      await withRecording(testName, async () => {
        // Single query that requires multiple file operations with context preservation
        const multiStepQuery = `First list all TypeScript files in src/, then read the main engine file from those files and analyze its content for classes and methods`;

        const response = await engine.processQuery(multiStepQuery);

        expect(response.complete).toBe(true);
        expect(response.toolsExecuted).toContain('internal:files');
        expect(response.response.toLowerCase()).toContain('.ts');
        expect(response.response.toLowerCase()).toContain('engine');
        expect(response.response.toLowerCase()).toContain('class');
      });
    });

    it('should handle workflow error recovery gracefully', async () => {
      const testName = 'workflow_error_recovery';

      await withRecording(testName, async () => {
        // STEP 1: Try to read a non-existent file (should fail gracefully)
        const errorResponse = await engine.processQuery('read the file non-existent-file.txt');

        expect(errorResponse.complete).toBe(true); // Engine handles error gracefully
        expect(errorResponse.response.toLowerCase()).toContain('error');

        // STEP 2: Recover by listing actual files (should not be affected by previous error)
        const recoveryResponse = await engine.processQuery(
          'list the actual files in the current directory'
        );

        expect(recoveryResponse.complete).toBe(true);
        expect(recoveryResponse.toolsExecuted).toContain('internal:files');
        expect(recoveryResponse.response).toContain('package.json'); // Should find real files

        // STEP 3: Successfully read an existing file (workflow should continue normally)
        const successResponse = await engine.processQuery('now read package.json');

        expect(successResponse.complete).toBe(true);
        expect(successResponse.toolsExecuted).toContain('internal:files');
        expect(successResponse.response).toContain('"name"'); // Should contain package.json content
      });
    });
  });

  describe('Context-Aware Decision Making', () => {
    it('should make intelligent decisions based on previous tool results', async () => {
      const testName = 'context_aware_decisions';

      await withRecording(testName, async () => {
        // Single query that requires intelligent decision making based on findings
        const intelligentQuery = `Analyze the project structure, find the configuration files like package.json or tsconfig.json, then read package.json and explain its purpose`;

        const response = await engine.processQuery(intelligentQuery);

        expect(response.complete).toBe(true);
        expect(response.toolsExecuted).toContain('internal:files');
        expect(response.response.toLowerCase()).toContain('package');
      });
    });

    it('should handle complex project understanding workflow', async () => {
      const testName = 'complex_project_understanding';

      await withRecording(testName, async () => {
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
        expect(complexResponse.response.toLowerCase()).toContain('dependencies');
        expect(complexResponse.response.toLowerCase()).toContain('typescript');
      });
    });
  });

  describe('Workflow State Persistence', () => {
    it('should maintain context across tool execution boundaries', async () => {
      const testName = 'context_persistence';

      await withRecording(testName, async () => {
        // Single query that tests context maintenance within a workflow
        const contextQuery = `List files in src/ and then tell me what you found`;

        const response = await engine.processQuery(contextQuery);

        expect(response.complete).toBe(true);
        expect(response.toolsExecuted).toContain('internal:files');
        expect(response.response.toLowerCase()).toContain('src');
      });
    });
  });
});
