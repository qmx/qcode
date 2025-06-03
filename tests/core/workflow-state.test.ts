import { WorkflowState, WorkflowContext, WorkflowError } from '../../src/core/workflow-state.js';
import { ToolResult, QCodeError } from '../../src/types.js';

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
