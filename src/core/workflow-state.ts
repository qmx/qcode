/**
 * Workflow State Management for QCode
 * Tracks execution context across multiple tool calls and provides
 * intelligent workflow orchestration capabilities
 */

import { QCodeError, ToolResult } from '../types.js';

/**
 * Extended context interface for workflow execution
 */
export interface WorkflowContext {
  workingDirectory: string;
  security: {
    workspace: {
      allowedPaths: string[];
      forbiddenPatterns: string[];
      allowOutsideWorkspace: boolean;
    };
    commands: {
      allowedCommands: string[];
      forbiddenPatterns: string[];
      allowArbitraryCommands: boolean;
    };
  };
  registry: Record<string, any>;
  query: string;
  requestId: string;
  // Workflow-specific properties
  workflowId: string;
  depth: number;
  maxDepth: number;
  parentWorkflowId?: string;
}

/**
 * Workflow-specific error class
 */
export class WorkflowError extends QCodeError {
  constructor(message: string, code: string, context?: Record<string, any>) {
    super(message, code, context);
    this.name = 'WorkflowError';
  }
}

/**
 * Represents a single step in a workflow
 */
export interface WorkflowStep {
  id: string;
  name: string;
  toolName: string;
  arguments: Record<string, any>;
  status: 'running' | 'completed' | 'failed' | 'interrupted';
  startTime: Date;
  endTime?: Date;
  duration?: number;
  result?: ToolResult;
  error?: QCodeError;
}

/**
 * Checkpoint data for workflow resumption
 */
export interface WorkflowCheckpoint {
  workflowId: string;
  status: string;
  completedSteps: WorkflowStep[];
  results: Record<string, ToolResult>;
  context: WorkflowContext;
  createdAt: Date;
  checkpointTime: Date;
}

/**
 * Workflow summary information
 */
export interface WorkflowSummary {
  id: string;
  status: string;
  totalSteps: number;
  completedSteps: number;
  failedSteps: number;
  duration: number;
  errors: QCodeError[];
  createdAt: Date;
}

/**
 * Memory usage information
 */
export interface MemoryUsage {
  stepsCount: number;
  resultsSize: number;
  estimatedBytes: number;
}

/**
 * Rollback history entry
 */
export interface RollbackEntry {
  timestamp: Date;
  reason: string;
  stepsRolledBack: number;
  checkpointId: string;
}

/**
 * Main WorkflowState class for managing multi-step workflows
 */
export class WorkflowState {
  private id: string;
  private status: 'initialized' | 'running' | 'completed' | 'failed' | 'interrupted' =
    'initialized';
  private context: WorkflowContext;
  private steps: WorkflowStep[] = [];
  private results: Record<string, ToolResult> = {};
  private errors: QCodeError[] = [];
  private createdAt: Date;
  private parent: WorkflowState | undefined;
  private children: WorkflowState[] = [];
  private interruptReason?: string;
  private rollbackHistory: RollbackEntry[] = [];

  constructor(id: string, context: WorkflowContext, parent?: WorkflowState) {
    this.id = id;
    this.context = context;
    this.createdAt = new Date();
    this.parent = parent;

    if (parent) {
      parent.children.push(this);
    }
  }

  /**
   * Start a new workflow step
   */
  async startStep(name: string, toolName: string, args: Record<string, any>): Promise<string> {
    const stepId = `step-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const step: WorkflowStep = {
      id: stepId,
      name,
      toolName,
      arguments: args,
      status: 'running',
      startTime: new Date(),
    };

    this.steps.push(step);
    this.status = 'running';

    return stepId;
  }

  /**
   * Complete a workflow step successfully
   */
  async completeStep(stepId: string, result: ToolResult): Promise<void> {
    const step = this.steps.find(s => s.id === stepId);
    if (!step) {
      throw new WorkflowError(`Step ${stepId} not found`, 'STEP_NOT_FOUND', { stepId });
    }

    step.status = 'completed';
    step.endTime = new Date();
    step.duration = step.endTime.getTime() - step.startTime.getTime();
    step.result = result;

    // Store result for context
    this.results[stepId] = result;

    // Update workflow status if all steps are completed
    this.updateWorkflowStatus();
  }

  /**
   * Mark a workflow step as failed
   */
  async failStep(stepId: string, error: QCodeError): Promise<void> {
    const step = this.steps.find(s => s.id === stepId);
    if (!step) {
      throw new WorkflowError(`Step ${stepId} not found`, 'STEP_NOT_FOUND', { stepId });
    }

    step.status = 'failed';
    step.endTime = new Date();
    step.duration = step.endTime.getTime() - step.startTime.getTime();
    step.error = error;

    this.errors.push(error);
    this.status = 'failed';
  }

  /**
   * Get workflow ID
   */
  getId(): string {
    return this.id;
  }

  /**
   * Get workflow status
   */
  getStatus(): string {
    return this.status;
  }

  /**
   * Get all workflow steps
   */
  getSteps(): WorkflowStep[] {
    return [...this.steps];
  }

  /**
   * Get workflow results
   */
  getResults(): Record<string, ToolResult> {
    return { ...this.results };
  }

  /**
   * Get workflow errors
   */
  getErrors(): QCodeError[] {
    return [...this.errors];
  }

  /**
   * Get workflow creation time
   */
  getCreatedAt(): Date {
    return this.createdAt;
  }

  /**
   * Get parent workflow
   */
  getParent(): WorkflowState | undefined {
    return this.parent;
  }

  /**
   * Get workflow depth
   */
  getDepth(): number {
    return this.context.depth;
  }

  /**
   * Get step by ID
   */
  getStepById(stepId: string): WorkflowStep | undefined {
    return this.steps.find(s => s.id === stepId);
  }

  /**
   * Get result for a specific step
   */
  getStepResult(stepId: string): ToolResult | undefined {
    return this.results[stepId];
  }

  /**
   * Get workflow context
   */
  getContext(): WorkflowContext {
    return { ...this.context };
  }

  /**
   * Get workflow summary
   */
  getSummary(): WorkflowSummary {
    const now = new Date();
    const duration = now.getTime() - this.createdAt.getTime();

    const completedSteps = this.steps.filter(s => s.status === 'completed').length;
    const failedSteps = this.steps.filter(s => s.status === 'failed').length;

    // Determine overall status
    let status = this.status;
    if (status === 'running' && failedSteps > 0) {
      status = 'failed';
    } else if (status === 'running' && completedSteps === this.steps.length) {
      status = 'completed';
    }

    return {
      id: this.id,
      status,
      totalSteps: this.steps.length,
      completedSteps,
      failedSteps,
      duration,
      errors: [...this.errors],
      createdAt: this.createdAt,
    };
  }

  /**
   * Interrupt workflow execution
   */
  async interrupt(reason: string): Promise<void> {
    this.status = 'interrupted';
    this.interruptReason = reason;

    // Mark any running steps as interrupted
    this.steps.forEach(step => {
      if (step.status === 'running') {
        step.status = 'interrupted';
        step.endTime = new Date();
        step.duration = step.endTime.getTime() - step.startTime.getTime();
      }
    });
  }

  /**
   * Get interrupt reason
   */
  getInterruptReason(): string | undefined {
    return this.interruptReason;
  }

  /**
   * Create a checkpoint for resumption
   */
  createCheckpoint(): WorkflowCheckpoint {
    return {
      workflowId: this.id,
      status: this.status,
      completedSteps: this.steps.filter(s => s.status === 'completed'),
      results: { ...this.results },
      context: { ...this.context },
      createdAt: this.createdAt,
      checkpointTime: new Date(),
    };
  }

  /**
   * Create workflow from checkpoint
   */
  static fromCheckpoint(checkpoint: WorkflowCheckpoint, context: WorkflowContext): WorkflowState {
    const workflow = new WorkflowState(checkpoint.workflowId, context);
    workflow.status = checkpoint.status as any;
    workflow.steps = [...checkpoint.completedSteps];
    workflow.results = { ...checkpoint.results };
    workflow.createdAt = checkpoint.createdAt;
    return workflow;
  }

  /**
   * Rollback to a previous checkpoint
   */
  async rollbackToCheckpoint(checkpoint: WorkflowCheckpoint): Promise<void> {
    const stepsToRollback = this.steps.length - checkpoint.completedSteps.length;

    this.steps = [...checkpoint.completedSteps];
    this.results = { ...checkpoint.results };
    this.errors = [];
    this.status = checkpoint.status as any;

    // Record rollback history
    this.rollbackHistory.push({
      timestamp: new Date(),
      reason: 'Rollback to checkpoint',
      stepsRolledBack: stepsToRollback,
      checkpointId: `${checkpoint.workflowId}-${checkpoint.checkpointTime.getTime()}`,
    });
  }

  /**
   * Get rollback history
   */
  getRollbackHistory(): RollbackEntry[] {
    return [...this.rollbackHistory];
  }

  /**
   * Cleanup workflow resources
   */
  async cleanup(): Promise<void> {
    // Mark as completed if not already in a terminal state
    if (this.status === 'running') {
      this.status = 'completed';
    }

    // Could implement more sophisticated cleanup here
    // For now, we keep the step structure but could clear large data
  }

  /**
   * Get memory usage information
   */
  getMemoryUsage(): MemoryUsage {
    const resultsSize = Object.keys(this.results).length;
    const estimatedBytes = JSON.stringify(this.results).length + JSON.stringify(this.steps).length;

    return {
      stepsCount: this.steps.length,
      resultsSize,
      estimatedBytes,
    };
  }

  /**
   * Cleanup old results keeping only the most recent N
   */
  async cleanupOldResults(keepCount: number): Promise<void> {
    if (this.steps.length <= keepCount) {
      return;
    }

    // Keep only the most recent results
    const recentSteps = this.steps.slice(-keepCount);
    const keepStepIds = new Set(recentSteps.map(s => s.id));

    // Remove old results
    Object.keys(this.results).forEach(stepId => {
      if (!keepStepIds.has(stepId)) {
        delete this.results[stepId];
      }
    });
  }

  /**
   * Create a child workflow
   */
  createChildWorkflow(childId: string, childContext: WorkflowContext): WorkflowState {
    if (childContext.depth >= childContext.maxDepth) {
      throw new WorkflowError(
        `Maximum workflow depth ${childContext.maxDepth} exceeded`,
        'MAX_DEPTH_EXCEEDED',
        { depth: childContext.depth, maxDepth: childContext.maxDepth }
      );
    }

    return new WorkflowState(childId, childContext, this);
  }

  private updateWorkflowStatus(): void {
    if (this.steps.every(s => s.status === 'completed')) {
      this.status = 'completed';
    }
  }
}
