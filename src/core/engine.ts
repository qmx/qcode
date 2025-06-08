import { OllamaClient, OllamaResponse } from './client.js';
import { ToolRegistry } from './registry.js';
import { Config, QCodeError, ToolContext, ToolResult } from '../types.js';
import { logger } from '../utils/logger.js';

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
  /** Progress callback for tool execution updates */
  onToolExecution?: (toolName: string, args: Record<string, any>) => void;
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
  private readonly workingDirectory: string;

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
      // Validate query
      this.validateQuery(query);

      if (this.options.debug) {
        logger.debug(`🔍 [DEBUG ENGINE] Query validated successfully`);
      }

      // Route all queries directly to LLM function calling
      // The LLM is smart enough to decide if it needs tools or can answer directly
      if (this.options.debug) {
        logger.debug(`🔍 [DEBUG ENGINE] Processing with LLM function calling`);
      }

      const llmResponse = await this.processWithLLMFunctionCalling(query, context);
      const response = llmResponse.response;
      toolsExecuted.push(...llmResponse.toolsExecuted);
      toolResults.push(...llmResponse.toolResults);
      errors.push(...(llmResponse.errors || []));

      if (this.options.debug) {
        logger.debug(
          `🔍 [DEBUG ENGINE] LLM function calling response: ${JSON.stringify(llmResponse, null, 2)}`
        );
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
   * Process with LLM function calling using proper orchestration loop
   */
  private async processWithLLMFunctionCalling(
    query: string,
    context: ToolContext
  ): Promise<{
    response: string;
    toolsExecuted: string[];
    toolResults: ToolResult[];
    errors?: QCodeError[];
  }> {
    const maxIterations = this.options.maxToolExecutions || 10;
    const toolsExecuted: string[] = [];
    const toolResults: ToolResult[] = [];
    const errors: QCodeError[] = [];

    try {
      // Get available tools
      const availableTools = this.toolRegistry.getToolsForOllama();

      if (this.options.debug) {
        logger.debug(
          `🔍 [DEBUG LLM] Available tools: ${JSON.stringify(availableTools.map((t: any) => t.function.name))}`
        );
      }

      // Initialize conversation with system prompt and user query
      const conversationHistory: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> =
        [
          {
            role: 'system',
            content: `You are QCode, a helpful AI coding assistant with access to tools.

Available tools:
- internal.files: Read files, list directories, search within files
- internal.project: Analyze project structure, technologies, frameworks, and architecture

Instructions:
1. Use tools to gather the information needed to answer the user's question
2. After getting tool results, provide a clear, direct answer to what was asked
3. If you need more information, call additional tools
4. When you have enough information, provide your final answer

Be specific and focused in your answers. If asked about technologies, list them clearly. If asked about files, show the relevant content.`,
          },
          {
            role: 'user',
            content: query,
          },
        ];

      if (this.options.debug) {
        logger.debug(`🔍 [DEBUG LLM] Starting orchestration loop for query: "${query}"`);
      }

      // Phase 1: Let LLM call tools to gather information
      let iterationCount = 0;
      let toolPhaseComplete = false;

      while (!toolPhaseComplete && iterationCount < maxIterations) {
        iterationCount++;

        if (this.options.debug) {
          logger.debug(`🔍 [DEBUG LLM] Tool calling iteration ${iterationCount}/${maxIterations}`);
        }

        // Call LLM with tools available
        const llmResponse = await this.ollamaClient.functionCall({
          model: this.config.ollama.model,
          messages: conversationHistory,
          tools: availableTools,
          format: 'json',
          temperature: this.config.ollama.temperature,
        });

        if (this.options.debug) {
          logger.debug(`🔍 [DEBUG LLM] LLM response: ${JSON.stringify(llmResponse, null, 2)}`);
        }

        // Parse any tool calls from the response
        const functionCalls = this.parseFunctionCalls(llmResponse);

        if (functionCalls.length === 0) {
          // No tool calls - LLM provided a direct answer
          if (this.options.debug) {
            logger.debug(`🔍 [DEBUG LLM] No tool calls - LLM provided direct answer`);
          }
          toolPhaseComplete = true;

          // Add the LLM's final response
          const finalAnswer =
            llmResponse.message?.content || llmResponse.response || 'No response provided.';
          return {
            response: finalAnswer,
            toolsExecuted,
            toolResults,
            ...(errors.length > 0 && { errors }),
          };
        }

        // Execute tool calls
        if (this.options.debug) {
          logger.debug(`🔍 [DEBUG LLM] LLM made ${functionCalls.length} tool calls`);
        }

        // Add the LLM's message with tool calls to conversation
        conversationHistory.push({
          role: 'assistant',
          content:
            llmResponse.message?.content ||
            JSON.stringify(functionCalls.map(fc => ({ name: fc.toolName, args: fc.arguments }))),
        });

        // Execute all tool calls and collect results
        const toolCallResults: string[] = [];

        for (const functionCall of functionCalls) {
          // Notify CLI about tool execution
          if (this.options.onToolExecution) {
            this.options.onToolExecution(functionCall.toolName, functionCall.arguments);
          }

          if (this.options.debug) {
            logger.debug(`🔍 [DEBUG LLM] Executing: ${functionCall.toolName}`);
          }

          try {
            const toolResult = await this.toolRegistry.executeTool(
              functionCall.toolName,
              functionCall.arguments,
              context
            );

            toolsExecuted.push(functionCall.toolName);
            toolResults.push(toolResult);

            if (toolResult.success) {
              // Format tool result in a simple, readable way
              const resultSummary = this.formatToolResultSimple(functionCall.toolName, toolResult);
              toolCallResults.push(`Tool: ${functionCall.toolName}\nResult: ${resultSummary}`);
            } else {
              const errorMsg = `Tool ${functionCall.toolName} failed: ${toolResult.error}`;
              toolCallResults.push(`Tool: ${functionCall.toolName}\nError: ${errorMsg}`);
              errors.push(new QCodeError(errorMsg, 'TOOL_EXECUTION_ERROR'));
            }
          } catch (error) {
            const errorMsg = `Tool ${functionCall.toolName} error: ${error instanceof Error ? error.message : 'Unknown error'}`;
            toolCallResults.push(`Tool: ${functionCall.toolName}\nError: ${errorMsg}`);
            errors.push(new QCodeError(errorMsg, 'TOOL_EXECUTION_ERROR'));
          }
        }

        // Add tool results to conversation
        conversationHistory.push({
          role: 'user',
          content: `Tool results:\n\n${toolCallResults.join('\n\n')}`,
        });

        // Check if we should continue - improved logic to prevent infinite loops
        // Stop if:
        // 1. We've made significant progress (multiple successful tools OR one very successful result)
        // 2. We're getting repeated tool failures 
        // 3. We've reached a reasonable number of iterations
        
        const successfulResults = toolResults.filter(r => r.success);
        const recentFailures = toolResults.slice(-3).filter(r => !r.success);
        
        if (
          // Stop if we have multiple successful tool calls
          successfulResults.length >= 2 ||
          // Stop if we have 3 recent failures in a row (tool errors)
          recentFailures.length >= 3 ||
          // Stop if we've reached 5+ iterations (reasonable limit)
          iterationCount >= 5 ||
          // Stop if we have at least one successful result and this iteration had issues
          (successfulResults.length > 0 && 
            toolResults.slice(-functionCalls.length).some(tr => !tr.success)
          )
        ) {
          toolPhaseComplete = true;
        }
      }

      // Phase 2: Force final answer by calling LLM without tools
      if (this.options.debug) {
        logger.debug(`🔍 [DEBUG LLM] Tool phase complete, requesting final answer`);
      }

      // Add explicit instruction for final answer
      conversationHistory.push({
        role: 'user',
        content: `Based on the tool results above, please provide a direct and complete answer to the original question: "${query}"

Do not call any more tools. Just analyze the information you've gathered and give a clear, comprehensive answer.`,
      });

      // Call LLM without tools to get final answer
      const finalLlmResponse = await this.ollamaClient.functionCall({
        model: this.config.ollama.model,
        messages: conversationHistory,
        tools: [], // No tools - force text response
        format: 'json',
        temperature: this.config.ollama.temperature,
      });

      const finalAnswer =
        finalLlmResponse.message?.content ||
        finalLlmResponse.response ||
        'Unable to provide a complete answer.';

      if (this.options.debug) {
        logger.debug(`🔍 [DEBUG LLM] Got final answer: ${finalAnswer}`);
      }

      return {
        response: finalAnswer,
        toolsExecuted,
        toolResults,
        ...(errors.length > 0 && { errors }),
      };
    } catch (error) {
      const qcodeError =
        error instanceof QCodeError
          ? error
          : new QCodeError(
              `LLM orchestration failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
              'ORCHESTRATION_ERROR'
            );

      return {
        response: `I encountered an error: ${qcodeError.message}`,
        toolsExecuted,
        toolResults,
        errors: [qcodeError],
      };
    }
  }

  /**
   * Format tool result in a simple, readable way
   */
  private formatToolResultSimple(toolName: string, result: ToolResult): string {
    if (!result.success) {
      return `Error: ${result.error}`;
    }

    // Special handling for project analysis
    if (toolName.includes('project') && result.data?.overview) {
      const data = result.data;
      let output = `Project Analysis:\n`;

      if (data.overview?.name) {
        output += `- Name: ${data.overview.name}\n`;
      }
      if (data.overview?.type) {
        output += `- Type: ${data.overview.type}\n`;
      }
      if (data.overview?.primaryLanguage) {
        output += `- Primary Language: ${data.overview.primaryLanguage}\n`;
      }
      if (data.overview?.languages?.length > 0) {
        output += `- Languages: ${data.overview.languages.join(', ')}\n`;
      }
      if (data.overview?.frameworks?.length > 0) {
        output += `- Frameworks: ${data.overview.frameworks.join(', ')}\n`;
      }
      if (data.overview?.technologies?.length > 0) {
        output += `- Technologies: ${data.overview.technologies.join(', ')}\n`;
      }

      return output;
    }

    // For other tools, provide a simple summary
    return (
      JSON.stringify(result.data, null, 2).slice(0, 500) +
      (JSON.stringify(result.data).length > 500 ? '...' : '')
    );
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
