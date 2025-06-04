import { OllamaClient, OllamaResponse } from './client.js';
import { ToolRegistry } from './registry.js';
import { Config, QCodeError, ToolContext, ToolResult } from '../types.js';
import { WorkflowState, WorkflowContext } from './workflow-state.js';
import { logger } from '../utils/logger.js';
import { ContextManager } from './context-manager.js';
import { StructuredToolResult } from '../types.js';

/**
 * Query processing intent detected from user input
 */
export interface QueryIntent {
  /** Primary intent type */
  type: 'file_operation' | 'code_analysis' | 'help' | 'unknown';
  /** Confidence level (0-1) */
  confidence: number;
  /** Extracted parameters */
  parameters: Record<string, any>;
  /** Tools that might be needed */
  suggestedTools?: string[];
}

/**
 * Engine execution context for a query
 */
export interface QueryContext extends ToolContext {
  /** The original user query */
  query: string;
  /** Detected intent */
  intent?: QueryIntent;
  /** Execution start time */
  startTime: number;
  /** Unique execution ID */
  executionId: string;
  /** Debug flag */
  debug?: boolean;
}

/**
 * Engine response to a user query
 */
export interface EngineResponse {
  /** The final response text */
  response: string;
  /** Tools that were executed */
  toolsExecuted: string[];
  /** Tool execution results */
  toolResults: ToolResult[];
  /** Processing time in milliseconds */
  processingTime: number;
  /** Whether the response is complete */
  complete: boolean;
  /** Any errors that occurred */
  errors?: QCodeError[];
  /** Workflow summary if workflow was used */
  workflowSummary?: any;
}

/**
 * Function call parsed from LLM response
 */
export interface ParsedFunctionCall {
  /** Tool name (full namespaced name) */
  toolName: string;
  /** Arguments to pass to the tool */
  arguments: Record<string, any>;
  /** Raw function call text from LLM */
  rawCall?: string;
}

/**
 * Engine configuration options
 */
export interface EngineOptions {
  /** Working directory for the engine - REQUIRED */
  workingDirectory: string;
  /** Whether to enable streaming responses */
  enableStreaming?: boolean;
  /** Maximum number of tool executions per query */
  maxToolExecutions?: number;
  /** Timeout for query processing (ms) */
  queryTimeout?: number;
  /** Whether to include debug information */
  debug?: boolean;
  /** Whether to enable workflow state management */
  enableWorkflowState?: boolean;
  /** Maximum workflow depth */
  maxWorkflowDepth?: number;
}

/**
 * QCode Core Engine
 *
 * Orchestrates query processing, tool execution, and response generation.
 * This is the main processing engine that coordinates between:
 * - User queries and intent detection
 * - LLM communication and function calling
 * - Tool registry and execution
 * - Workflow state management
 * - Response formatting and streaming
 */
export class QCodeEngine {
  private ollamaClient: OllamaClient;
  private toolRegistry: ToolRegistry;
  private config: Config;
  private options: EngineOptions;
  private executionCounter = 0;
  private activeWorkflows: Map<string, WorkflowState> = new Map();
  private readonly workingDirectory: string;
  private contextManager: ContextManager;

  constructor(
    ollamaClient: OllamaClient,
    toolRegistry: ToolRegistry,
    config: Config,
    options: EngineOptions
  ) {
    this.ollamaClient = ollamaClient;
    this.toolRegistry = toolRegistry;
    this.config = config;

    // Working directory is now required
    this.workingDirectory = options.workingDirectory;

    this.options = {
      enableStreaming: false,
      maxToolExecutions: 10,
      queryTimeout: 60000, // 60 seconds
      debug: false,
      enableWorkflowState: true, // Enable by default
      maxWorkflowDepth: 5,
      ...options,
    };

    this.contextManager = new ContextManager();
  }

  /**
   * Process a user query and return a response
   */
  async processQuery(query: string): Promise<EngineResponse> {
    const startTime = Date.now();
    const executionId = `qcode_${Date.now()}_${++this.executionCounter}`;

    if (this.options.debug) {
      logger.debug(`🔍 [DEBUG ENGINE] Starting processQuery: "${query}"`);
      logger.debug(`🔍 [DEBUG ENGINE] Execution ID: ${executionId}`);
      logger.debug(`🔍 [DEBUG ENGINE] Working directory: ${this.workingDirectory}`);
      logger.debug(`🔍 [DEBUG ENGINE] Engine options: ${JSON.stringify(this.options, null, 2)}`);
    }

    const context: QueryContext = {
      workingDirectory: this.workingDirectory,
      security: this.config.security,
      registry: this.toolRegistry,
      query,
      requestId: executionId,
      // Additional QueryContext properties
      startTime,
      executionId,
      // Add debug flag to context
      debug: this.options.debug || false,
    };

    const toolsExecuted: string[] = [];
    const toolResults: ToolResult[] = [];
    const errors: QCodeError[] = [];

    try {
      // Phase 1: Basic query processing
      this.validateQuery(query);

      if (this.options.debug) {
        logger.debug(`🔍 [DEBUG ENGINE] Query validated successfully`);
      }

      // Phase 2: Intent detection (simple for now)
      const intent = await this.detectIntent(query);
      context.intent = intent;

      if (this.options.debug) {
        logger.debug(`🔍 [DEBUG ENGINE] Intent detected: ${JSON.stringify(intent, null, 2)}`);
      }

      // Phase 3: Process with LLM function calling for file operations
      let response: string;

      if (intent.type === 'file_operation') {
        if (this.options.debug) {
          logger.debug(`🔍 [DEBUG ENGINE] Processing as file operation with LLM function calling`);
        }

        const llmResponse = await this.processWithLLMFunctionCalling(query, context);
        response = llmResponse.response;
        toolsExecuted.push(...llmResponse.toolsExecuted);
        toolResults.push(...llmResponse.toolResults);
        errors.push(...(llmResponse.errors || []));

        if (this.options.debug) {
          logger.debug(
            `🔍 [DEBUG ENGINE] LLM function calling response: ${JSON.stringify(llmResponse, null, 2)}`
          );
        }
      } else {
        if (this.options.debug) {
          logger.debug(`🔍 [DEBUG ENGINE] Processing with simple intent-based response`);
        }

        // Fallback to simple responses for non-file operations
        const ollamaResponse = await this.processWithIntent(query, context);
        response = ollamaResponse.response;

        if (this.options.debug) {
          logger.debug(
            `🔍 [DEBUG ENGINE] Intent-based response: ${JSON.stringify(ollamaResponse, null, 2)}`
          );
        }
      }

      const result = {
        response,
        toolsExecuted,
        toolResults,
        processingTime: Date.now() - startTime,
        complete: true,
        ...(errors.length > 0 && { errors }),
      };

      if (this.options.debug) {
        logger.debug(`🔍 [DEBUG ENGINE] Final result: ${JSON.stringify(result, null, 2)}`);
      }

      return result;
    } catch (error) {
      if (this.options.debug) {
        logger.debug(
          `🔍 [DEBUG ENGINE] Error in processQuery: ${error instanceof Error ? error.stack : JSON.stringify(error)}`
        );
      }

      const qcodeError =
        error instanceof QCodeError
          ? error
          : new QCodeError('Engine processing failed', 'ENGINE_ERROR', {
              originalError: error instanceof Error ? error.message : 'Unknown error',
              query,
              executionId,
            });

      return {
        response: `Error processing query: ${qcodeError.message}`,
        toolsExecuted,
        toolResults,
        processingTime: Date.now() - startTime,
        complete: false,
        errors: [qcodeError],
      };
    }
  }

  /**
   * Get engine status and health information
   */
  async getStatus(): Promise<{
    healthy: boolean;
    ollamaConnected: boolean;
    toolsRegistered: number;
    model: string;
    errors: string[];
  }> {
    const errors: string[] = [];
    let ollamaConnected = false;

    try {
      ollamaConnected = await this.ollamaClient.validateConnection();
      if (!ollamaConnected) {
        errors.push('Cannot connect to Ollama server');
      }

      // Check if the configured model is available
      const modelAvailable = await this.ollamaClient.isModelAvailable(this.config.ollama.model);
      if (!modelAvailable) {
        errors.push(`Model '${this.config.ollama.model}' is not available`);
      }
    } catch (error) {
      errors.push(
        `Ollama validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }

    const stats = this.toolRegistry.getStats();

    return {
      healthy: errors.length === 0,
      ollamaConnected,
      toolsRegistered: stats.totalTools,
      model: this.config.ollama.model,
      errors,
    };
  }

  /**
   * Update engine configuration
   */
  updateConfig(newConfig: Partial<Config>): void {
    this.config = { ...this.config, ...newConfig };

    // Update Ollama client if needed
    if (newConfig.ollama) {
      this.ollamaClient.updateConfig(newConfig.ollama);
    }
  }

  /**
   * Update engine options
   */
  updateOptions(newOptions: Partial<EngineOptions>): void {
    this.options = { ...this.options, ...newOptions };
  }

  /**
   * Get available tools formatted for display
   */
  getAvailableTools(): Array<{ namespace: string; name: string; description: string }> {
    return this.toolRegistry.listTools().map(tool => ({
      namespace: tool.namespace,
      name: tool.name,
      description: tool.definition.description || 'No description available',
    }));
  }

  // Private methods for internal processing

  /**
   * Validate the user query
   */
  private validateQuery(query: string): void {
    if (!query || typeof query !== 'string') {
      throw new QCodeError('Query must be a non-empty string', 'INVALID_QUERY', { query });
    }

    if (query.trim().length === 0) {
      throw new QCodeError('Query cannot be empty', 'EMPTY_QUERY', { query });
    }

    if (query.length > 10000) {
      // Reasonable limit
      throw new QCodeError('Query is too long', 'QUERY_TOO_LONG', {
        queryLength: query.length,
        maxLength: 10000,
      });
    }
  }

  /**
   * Detect intent from user query (simplified for Phase 1)
   */
  private async detectIntent(query: string): Promise<QueryIntent> {
    const lowerQuery = query.toLowerCase().trim();

    // Simple keyword-based intent detection for Phase 1
    // TODO: Replace with LLM-based intent detection in later phases

    // File operation patterns
    const fileOperationPatterns = [
      'file',
      'read',
      'list',
      'show me',
      'display',
      'open',
      'view',
      'package.json',
      'tsconfig.json',
      'readme',
      '.ts',
      '.js',
      '.json',
      '.md',
      'src/',
      'first',
      'lines',
      'content',
    ];

    const hasFilePattern = fileOperationPatterns.some(pattern => lowerQuery.includes(pattern));

    if (hasFilePattern) {
      return {
        type: 'file_operation',
        confidence: 0.8,
        parameters: { query },
        suggestedTools: ['internal.files'],
      };
    }

    if (lowerQuery.includes('help') || lowerQuery === '?') {
      return {
        type: 'help',
        confidence: 0.9,
        parameters: { query },
      };
    }

    return {
      type: 'unknown',
      confidence: 0.1,
      parameters: { query },
    };
  }

  /**
   * Process query based on detected intent (simplified for Phase 1)
   */
  private async processWithIntent(query: string, context: QueryContext): Promise<OllamaResponse> {
    if (!context.intent) {
      throw new QCodeError('No intent detected', 'NO_INTENT', { query });
    }

    // Phase 1: Simple intent-based responses
    // TODO: Replace with LLM orchestration in later phases

    switch (context.intent.type) {
      case 'help':
        return this.generateHelpResponse();

      case 'file_operation':
        return this.generateFileOperationResponse(query);

      default:
        return this.generateUnknownResponse(query);
    }
  }

  /**
   * Generate help response
   */
  private async generateHelpResponse(): Promise<OllamaResponse> {
    const tools = this.getAvailableTools();
    const helpText = `
QCode AI Coding Assistant

Available tools:
${tools.map(tool => `- ${tool.namespace}.${tool.name}: ${tool.description}`).join('\n')}

Example queries:
- "list files in src/"
- "read package.json"
- "help"

For more specific help, describe what you'd like to do with your code.
`.trim();

    return {
      response: helpText,
      model: this.config.ollama.model,
      done: true,
    };
  }

  /**
   * Generate response for file operations (placeholder for Phase 2)
   */
  private async generateFileOperationResponse(query: string): Promise<OllamaResponse> {
    return {
      response: `File operation detected: "${query}"\n\nTool orchestration will be implemented in Phase 2.`,
      model: this.config.ollama.model,
      done: true,
    };
  }

  /**
   * Generate response for unknown queries (placeholder for LLM integration)
   */
  private async generateUnknownResponse(query: string): Promise<OllamaResponse> {
    return {
      response: `I understand you asked: "${query}"\n\nLLM integration for general queries will be implemented in Phase 3.`,
      model: this.config.ollama.model,
      done: true,
    };
  }

  /**
   * Process with LLM function calling, supporting multi-step workflows
   */
  private async processWithLLMFunctionCalling(
    query: string,
    context: QueryContext
  ): Promise<{
    response: string;
    toolsExecuted: string[];
    toolResults: ToolResult[];
    errors?: QCodeError[];
  }> {
    const currentQuery = query;
    let iterationCount = 0;
    const maxIterations = this.options.maxToolExecutions || 10;
    const toolsExecuted: string[] = [];
    const toolResults: ToolResult[] = [];
    const errors: QCodeError[] = [];

    // Initialize conversation memory for context management
    const conversationMemory = this.contextManager.initializeConversationMemory(
      currentQuery,
      maxIterations
    );

    let workflowState: WorkflowState | undefined;

    try {
      // Create workflow if workflow management is enabled
      if (this.options.enableWorkflowState) {
        const workflowContext: WorkflowContext = {
          ...context,
          workflowId: `workflow-${this.executionCounter}`,
          depth: 0,
          maxDepth: this.options.maxWorkflowDepth || 5,
        };

        workflowState = new WorkflowState(workflowContext.workflowId, workflowContext);
        this.activeWorkflows.set(workflowState.getId(), workflowState);

        if (this.options.debug) {
          logger.debug(`🔍 [DEBUG LLM] Created workflow state: ${workflowState.getId()}`);
        }
      }

      // Get available tools from registry for function calling
      const availableTools = this.toolRegistry.getToolsForOllama();

      if (this.options.debug) {
        logger.debug(
          `🔍 [DEBUG LLM] Available tools: ${JSON.stringify(availableTools.map((t: any) => t.function.name))}`
        );
      }

      // Build initial conversation history with enhanced system prompt
      const conversationHistory: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> =
        [
          {
            role: 'system' as const,
            content: `You are QCode, a helpful AI coding assistant. You have access to tools to help with file operations and code analysis.

Available tools and their purposes:
- internal.files: Read files, list directory contents, search within files

When processing requests:
1. For simple file reads: use internal.files with "read" operation
2. For directory listings: use internal.files with "list" operation  
3. For finding files by pattern: use internal.files with "list" operation with glob patterns like:
   - TypeScript/JavaScript projects: "**/*.ts", "**/*.js"
   - Python projects: "**/*.py"
   - Other projects: list all files first
4. When looking for "main function", search for common entry points:
   - index.ts, index.js, main.ts, main.js, cli.ts, app.ts
   - Or search for "main" or "function main" in the codebase

For multi-step queries like "list files and then read the first one", break this down into steps:
1. First, call the list function to get files
2. Then, based on the results, call read function for a specific file

Continue calling functions until the user's request is fully satisfied.`,
          },
          {
            role: 'user' as const,
            content: currentQuery,
          },
        ];

      if (this.options.debug) {
        logger.debug(
          `🔍 [DEBUG LLM] Initial conversation history: ${JSON.stringify(conversationHistory, null, 2)}`
        );
      }

      // Multi-step workflow loop
      while (iterationCount < maxIterations) {
        iterationCount++;

        if (this.options.debug) {
          logger.debug(`🔍 [DEBUG LLM] Starting iteration ${iterationCount}/${maxIterations}`);
        }

        // Create function call request
        const functionCallRequest = {
          model: this.config.ollama.model,
          messages: conversationHistory,
          tools: availableTools,
          format: 'json',
          temperature: this.config.ollama.temperature,
        };

        if (this.options.debug) {
          logger.debug(
            `🔍 [DEBUG LLM] Function call request: ${JSON.stringify(functionCallRequest, null, 2)}`
          );
        }

        // Make function call to LLM
        const llmResponse = await this.ollamaClient.functionCall(functionCallRequest);

        if (this.options.debug) {
          logger.debug(`🔍 [DEBUG LLM] LLM response: ${JSON.stringify(llmResponse, null, 2)}`);
        }

        // Parse function calls from response
        const functionCalls = this.parseFunctionCalls(llmResponse);

        if (this.options.debug) {
          logger.debug(
            `🔍 [DEBUG LLM] Parsed function calls: ${JSON.stringify(functionCalls, null, 2)}`
          );
        }

        if (functionCalls.length === 0) {
          if (this.options.debug) {
            logger.debug(`🔍 [DEBUG LLM] No function calls found, breaking loop`);
          }
          // No more function calls, we're done
          break;
        }

        // Execute function calls and collect structured results
        const stepStructuredResults: StructuredToolResult[] = [];
        let stepHadErrors = false;

        for (const functionCall of functionCalls) {
          if (this.options.debug) {
            logger.debug(
              `🔍 [DEBUG LLM] Executing function call: ${JSON.stringify(functionCall, null, 2)}`
            );
          }

          try {
            // Start workflow step if tracking
            let stepId: string | undefined;
            if (workflowState) {
              stepId = await workflowState.startStep(
                `Execute ${functionCall.toolName}`,
                functionCall.toolName,
                functionCall.arguments
              );

              if (this.options.debug) {
                logger.debug(`🔍 [DEBUG LLM] Workflow step started: ${stepId}`);
              }
            }

            // Execute the tool
            const toolResult = await this.toolRegistry.executeTool(
              functionCall.toolName,
              functionCall.arguments,
              context
            );

            if (this.options.debug) {
              logger.debug(`🔍 [DEBUG LLM] Tool result: ${JSON.stringify(toolResult, null, 2)}`);
            }

            toolsExecuted.push(functionCall.toolName);
            toolResults.push(toolResult);

            // Complete workflow step if tracking
            if (workflowState && stepId) {
              await workflowState.completeStep(stepId, toolResult);
            }

            // Create structured result using context manager
            const structuredResult = this.contextManager.createStructuredResult(
              functionCall.toolName,
              toolResult
            );

            stepStructuredResults.push(structuredResult);

            if (!toolResult.success) {
              stepHadErrors = true;
              const errorMsg = `Tool execution failed: ${toolResult.error}`;
              errors.push(
                new QCodeError(errorMsg, 'TOOL_EXECUTION_ERROR', {
                  toolName: functionCall.toolName,
                  arguments: functionCall.arguments,
                })
              );

              if (this.options.debug) {
                logger.debug(`🔍 [DEBUG LLM] Tool execution failed: ${errorMsg}`);
              }

              // Fail workflow step if tracking
              if (workflowState && stepId) {
                await workflowState.failStep(
                  stepId,
                  new QCodeError(errorMsg, 'TOOL_EXECUTION_ERROR')
                );
              }
            }
          } catch (error) {
            stepHadErrors = true;
            const qcodeError =
              error instanceof QCodeError
                ? error
                : new QCodeError(
                    `Tool execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                    'TOOL_EXECUTION_ERROR',
                    { toolName: functionCall.toolName }
                  );

            if (this.options.debug) {
              logger.debug(
                `🔍 [DEBUG LLM] Tool execution exception: ${error instanceof Error ? error.stack : JSON.stringify(error)}`
              );
            }

            errors.push(qcodeError);

            // Create error structured result
            const errorResult: ToolResult = {
              success: false,
              error: qcodeError.message,
              duration: 0,
              tool: functionCall.toolName,
              namespace: 'unknown',
            };

            const structuredResult = this.contextManager.createStructuredResult(
              functionCall.toolName,
              errorResult
            );

            stepStructuredResults.push(structuredResult);
          }
        }

        // Update conversation memory with structured results and format for LLM context
        const stepFormattedResults: string[] = [];
        for (const structuredResult of stepStructuredResults) {
          // Update conversation memory
          const updatedMemory = this.contextManager.updateConversationMemory(
            conversationMemory,
            structuredResult
          );
          Object.assign(conversationMemory, updatedMemory);

          // Format result for conversation context
          const formattedResult = this.contextManager.formatResultForConversation(
            structuredResult,
            conversationMemory
          );

          stepFormattedResults.push(formattedResult);

          if (this.options.debug) {
            logger.debug(
              `🔍 [DEBUG LLM] Structured result: ${JSON.stringify(structuredResult, null, 2)}`
            );
            logger.debug(`🔍 [DEBUG LLM] Formatted result: ${formattedResult}`);
          }
        }

        // Add the results to conversation history for next iteration
        const stepResultsText = stepFormattedResults.join('\n');

        if (this.options.debug) {
          logger.debug(`🔍 [DEBUG LLM] Step results text: ${stepResultsText}`);
          logger.debug(
            `🔍 [DEBUG LLM] Conversation memory context size: ${conversationMemory.totalContextSize}`
          );
        }

        conversationHistory.push({
          role: 'assistant' as const,
          content: stepResultsText,
        });

        // Check if this looks like a multi-step query that needs continuation
        const needsContinuation = this.shouldContinueWorkflow(
          query,
          conversationHistory,
          stepHadErrors,
          iterationCount
        );

        if (this.options.debug) {
          logger.debug(`🔍 [DEBUG LLM] Needs continuation: ${needsContinuation}`);
        }

        if (!needsContinuation) {
          // We're done, return the final response
          break;
        }

        // Add a prompt to continue if needed
        conversationHistory.push({
          role: 'user' as const,
          content: 'Continue with the next step if needed to fully answer the original question.',
        });
      }

      // Generate final response by combining all step results
      const allResults = conversationHistory
        .filter(msg => msg.role === 'assistant')
        .map(msg => msg.content)
        .join('\n\n');

      const finalResponse = allResults.trim() || 'Tool execution completed.';

      if (this.options.debug) {
        logger.debug(`🔍 [DEBUG LLM] Final response: ${finalResponse}`);
        logger.debug(
          `🔍 [DEBUG LLM] Final conversation memory: ${JSON.stringify(conversationMemory, null, 2)}`
        );
      }

      return {
        response: finalResponse,
        toolsExecuted,
        toolResults,
        ...(errors.length > 0 && { errors }),
      };
    } catch (error) {
      if (this.options.debug) {
        logger.debug(
          `🔍 [DEBUG LLM] Exception in processWithLLMFunctionCalling: ${error instanceof Error ? error.stack : JSON.stringify(error)}`
        );
      }

      // Interrupt workflow if tracking
      if (workflowState) {
        await workflowState.interrupt(
          `Processing error: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }

      const qcodeError =
        error instanceof QCodeError
          ? error
          : new QCodeError(
              `Function calling failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
              'FUNCTION_CALLING_ERROR'
            );

      return {
        response: `I encountered an error while processing your request: ${qcodeError.message}`,
        toolsExecuted,
        toolResults,
        errors: [qcodeError],
      };
    } finally {
      // Cleanup workflow
      if (workflowState) {
        await workflowState.cleanup();
        this.activeWorkflows.delete(workflowState.getId());
      }
    }
  }

  /**
   * Determine if workflow should continue based on structured context and completion status
   */
  private shouldContinueWorkflow(
    originalQuery: string,
    conversationHistory: Array<{ role: string; content: string }>,
    hadErrors: boolean,
    iterationCount: number
  ): boolean {
    // Don't continue if we had errors in this iteration
    if (hadErrors) {
      return false;
    }

    // Don't continue if we've hit iteration limit
    if (iterationCount >= (this.options.maxToolExecutions || 10)) {
      return false;
    }

    const queryLower = originalQuery.toLowerCase();

    // Only continue for explicitly multi-step queries with clear indicators
    const isExplicitMultiStep =
      queryLower.includes(' and then ') ||
      queryLower.includes(' first ') ||
      (queryLower.includes('list') &&
        (queryLower.includes('read') || queryLower.includes('show'))) ||
      (queryLower.includes('find') && (queryLower.includes('read') || queryLower.includes('show')));

    // For multi-step queries, check if we have a list operation but no read operation yet
    if (isExplicitMultiStep) {
      const hasListOperation = conversationHistory.some(
        msg =>
          msg.role === 'assistant' &&
          (msg.content.includes('files found') ||
            msg.content.includes('📄') ||
            msg.content.includes('📂'))
      );

      const hasReadOperation = conversationHistory.some(
        msg =>
          msg.role === 'assistant' && (msg.content.includes('```') || msg.content.length > 1000)
      );

      // Continue if we have list but no read yet
      return hasListOperation && !hasReadOperation;
    }

    // For all other queries (including analysis), stop after first meaningful result
    // This prevents duplicate operations and relies on the LLM to make the right call initially
    const meaningfulResults = conversationHistory.filter(
      msg => msg.role === 'assistant' && msg.content.length > 100
    ).length;

    // Stop after 1 result for non-explicit multi-step queries
    return meaningfulResults < 1;
  }

  /**
   * Type guard for Ollama function call response
   */
  private isOllamaFunctionCallResponse(response: OllamaResponse): response is OllamaResponse & {
    message: {
      role: string;
      content: string;
      tool_calls: Array<{
        function: {
          name: string;
          arguments: Record<string, any>;
        };
      }>;
    };
  } {
    return Boolean(
      response.message?.tool_calls &&
        Array.isArray(response.message.tool_calls) &&
        response.message.tool_calls.length > 0
    );
  }

  /**
   * Type guard for JSON function call format
   */
  private isValidJsonResponse(obj: unknown): obj is Record<string, any> {
    return typeof obj === 'object' && obj !== null && !Array.isArray(obj);
  }

  /**
   * Parse function calls from LLM response
   */
  private parseFunctionCalls(response: OllamaResponse): ParsedFunctionCall[] {
    const functionCalls: ParsedFunctionCall[] = [];

    // First, check if this is an Ollama response with native tool calls
    if (this.isOllamaFunctionCallResponse(response)) {
      for (const call of response.message.tool_calls) {
        if (call.function?.name) {
          functionCalls.push({
            toolName: call.function.name,
            arguments: call.function.arguments || {},
            rawCall: JSON.stringify(call),
          });
        }
      }

      if (functionCalls.length > 0) {
        return functionCalls;
      }
    }

    // Try to parse as JSON for structured function calling responses
    if (response.response) {
      try {
        const parsed = JSON.parse(response.response);

        if (!this.isValidJsonResponse(parsed)) {
          // If JSON parsing succeeds but result isn't an object, skip JSON parsing
          return this.parseTextualFunctionCalls(response.response);
        }

        // Handle OpenAI-style function calling format
        if (parsed.function_call && typeof parsed.function_call === 'object') {
          const fc = parsed.function_call;
          if (fc.name && typeof fc.name === 'string') {
            const args = fc.arguments
              ? typeof fc.arguments === 'string'
                ? JSON.parse(fc.arguments)
                : fc.arguments
              : {};

            functionCalls.push({
              toolName: fc.name,
              arguments: args,
              rawCall: response.response,
            });
          }
        }

        // Handle tool calls array format
        if (parsed.tool_calls && Array.isArray(parsed.tool_calls)) {
          for (const call of parsed.tool_calls) {
            if (call.function && typeof call.function === 'object' && call.function.name) {
              const args = call.function.arguments
                ? typeof call.function.arguments === 'string'
                  ? JSON.parse(call.function.arguments)
                  : call.function.arguments
                : {};

              functionCalls.push({
                toolName: call.function.name,
                arguments: args,
                rawCall: JSON.stringify(call),
              });
            }
          }
        }

        // Handle simple function call format
        if (parsed.name && typeof parsed.name === 'string' && parsed.arguments) {
          functionCalls.push({
            toolName: parsed.name,
            arguments: parsed.arguments,
            rawCall: response.response,
          });
        }
      } catch {
        // JSON parsing failed, try textual parsing
        return this.parseTextualFunctionCalls(response.response);
      }
    }

    return functionCalls;
  }

  /**
   * Parse function calls from textual response using regex
   */
  private parseTextualFunctionCalls(responseText: string): ParsedFunctionCall[] {
    const functionCalls: ParsedFunctionCall[] = [];
    const functionCallRegex = /(\w+(?::\w+)?)\s*\(\s*({[^}]*}|\{[\s\S]*?\})\s*\)/g;
    let match;

    while ((match = functionCallRegex.exec(responseText)) !== null) {
      const toolName = match[1];
      const argsString = match[2];

      if (!toolName || !argsString) {
        continue;
      }

      try {
        const args = JSON.parse(argsString);

        functionCalls.push({
          toolName,
          arguments: args,
          rawCall: match[0],
        });
      } catch {
        // Skip invalid function calls
        continue;
      }
    }

    return functionCalls;
  }
}

/**
 * Factory function to create a QCodeEngine instance
 */
export function createQCodeEngine(
  ollamaClient: OllamaClient,
  toolRegistry: ToolRegistry,
  config: Config,
  options: EngineOptions
): QCodeEngine {
  return new QCodeEngine(ollamaClient, toolRegistry, config, options);
}
