import { OllamaClient, OllamaResponse } from './client.js';
import { ToolRegistry } from './registry.js';
import { Config, QCodeError, ToolContext, ToolResult } from '../types.js';

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
  /** Whether to enable streaming responses */
  enableStreaming?: boolean;
  /** Maximum number of tool executions per query */
  maxToolExecutions?: number;
  /** Timeout for query processing (ms) */
  queryTimeout?: number;
  /** Whether to include debug information */
  debug?: boolean;
}

/**
 * QCode Core Engine
 *
 * Orchestrates query processing, tool execution, and response generation.
 * This is the main processing engine that coordinates between:
 * - User queries and intent detection
 * - LLM communication and function calling
 * - Tool registry and execution
 * - Response formatting and streaming
 */
export class QCodeEngine {
  private ollamaClient: OllamaClient;
  private toolRegistry: ToolRegistry;
  private config: Config;
  private options: EngineOptions;
  private executionCounter = 0;

  constructor(
    ollamaClient: OllamaClient,
    toolRegistry: ToolRegistry,
    config: Config,
    options: EngineOptions = {}
  ) {
    this.ollamaClient = ollamaClient;
    this.toolRegistry = toolRegistry;
    this.config = config;
    this.options = {
      enableStreaming: false,
      maxToolExecutions: 10,
      queryTimeout: 60000, // 60 seconds
      debug: false,
      ...options,
    };
  }

  /**
   * Process a user query and return a response
   */
  async processQuery(query: string): Promise<EngineResponse> {
    const startTime = Date.now();
    const executionId = `qcode_${Date.now()}_${++this.executionCounter}`;

    const context: QueryContext = {
      workingDirectory: this.config.workingDirectory,
      security: this.config.security,
      registry: this.toolRegistry,
      query,
      requestId: executionId,
      // Additional QueryContext properties
      startTime,
      executionId,
    };

    const toolsExecuted: string[] = [];
    const toolResults: ToolResult[] = [];
    const errors: QCodeError[] = [];

    try {
      // Phase 1: Basic query processing
      this.validateQuery(query);

      // Phase 2: Intent detection (simple for now)
      const intent = await this.detectIntent(query);
      context.intent = intent;

      // Phase 3: Process with LLM function calling for file operations
      let response: string;

      if (intent.type === 'file_operation') {
        const llmResponse = await this.processWithLLMFunctionCalling(query, context);
        response = llmResponse.response;
        toolsExecuted.push(...llmResponse.toolsExecuted);
        toolResults.push(...llmResponse.toolResults);
        errors.push(...(llmResponse.errors || []));
      } else {
        // Fallback to simple responses for non-file operations
        const ollamaResponse = await this.processWithIntent(query, context);
        response = ollamaResponse.response;
      }

      return {
        response,
        toolsExecuted,
        toolResults,
        processingTime: Date.now() - startTime,
        complete: true,
        ...(errors.length > 0 && { errors }),
      };
    } catch (error) {
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
   * Process query using LLM function calling (Phase 1.8.2 implementation)
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
    const toolsExecuted: string[] = [];
    const toolResults: ToolResult[] = [];
    const errors: QCodeError[] = [];

    try {
      // Get available tools for function calling
      const availableTools = this.toolRegistry.getToolsForOllama('internal');

      if (availableTools.length === 0) {
        throw new QCodeError(
          'No internal tools available for function calling',
          'NO_TOOLS_AVAILABLE'
        );
      }

      // Create system message for function calling
      const systemMessage = `You are QCode, an AI coding assistant. You have access to file operation tools to help users with their coding tasks.

Available tools:
${availableTools.map(tool => `- ${tool.function.name}: ${tool.function.description}`).join('\n')}

When a user asks about files, use the appropriate tool to help them. Always use function calling when file operations are needed.

For file paths, assume they are relative to the current workspace unless otherwise specified.
`;

      // Create function call request
      const functionCallRequest = {
        model: this.config.ollama.model,
        messages: [
          { role: 'system' as const, content: systemMessage },
          { role: 'user' as const, content: query },
        ],
        tools: availableTools,
        format: 'json',
        temperature: this.config.ollama.temperature,
      };

      // Make function call to LLM
      const llmResponse = await this.ollamaClient.functionCall(functionCallRequest);

      // Parse function calls from response
      const functionCalls = this.parseFunctionCalls(llmResponse);

      if (functionCalls.length === 0) {
        // No function calls found, return LLM response as-is
        return {
          response:
            llmResponse.response ||
            "I understand your request, but I wasn't able to determine which file operation to perform. Could you be more specific?",
          toolsExecuted: [],
          toolResults: [],
        };
      }

      // Execute function calls and collect formatted responses
      const responseSegments: string[] = [];

      for (const functionCall of functionCalls) {
        try {
          // Execute the tool
          const toolResult = await this.toolRegistry.executeTool(
            functionCall.toolName,
            functionCall.arguments,
            context
          );

          toolsExecuted.push(functionCall.toolName);
          toolResults.push(toolResult);

          if (toolResult.success) {
            // Format successful result for user display
            const formattedResult = this.formatToolResult(functionCall.toolName, toolResult);
            responseSegments.push(formattedResult);
          } else {
            errors.push(
              new QCodeError(`Tool execution failed: ${toolResult.error}`, 'TOOL_EXECUTION_ERROR', {
                toolName: functionCall.toolName,
                arguments: functionCall.arguments,
              })
            );
            responseSegments.push(
              `\nError executing ${functionCall.toolName}: ${toolResult.error}`
            );
          }
        } catch (error) {
          const qcodeError =
            error instanceof QCodeError
              ? error
              : new QCodeError(
                  `Tool execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                  'TOOL_EXECUTION_ERROR',
                  { toolName: functionCall.toolName }
                );

          errors.push(qcodeError);
          responseSegments.push(
            `\nError executing ${functionCall.toolName}: ${qcodeError.message}`
          );
        }
      }

      // Join all response segments
      const finalResponse = responseSegments.join('\n').trim() || 'Tool execution completed.';

      return {
        response: finalResponse,
        toolsExecuted,
        toolResults,
        ...(errors.length > 0 && { errors }),
      };
    } catch (error) {
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
    }
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

  /**
   * Format tool execution result for user display
   */
  private formatToolResult(toolName: string, result: ToolResult): string {
    if (!result.success) {
      return `\nError in ${toolName}: ${result.error}`;
    }

    // Format based on tool type and result data
    if (toolName.includes('files')) {
      return this.formatFileToolResult(result);
    }

    // Default formatting
    return `\n${toolName} executed successfully.\n${JSON.stringify(result.data, null, 2)}`;
  }

  /**
   * Format file tool results for user-friendly display
   */
  private formatFileToolResult(result: ToolResult): string {
    if (!result.data) {
      return '\nFile operation completed successfully.';
    }

    const data = result.data;

    // Handle read file results
    if (data.content !== undefined) {
      const lines = data.lines ? ` (${data.lines} lines)` : '';
      const size = data.size ? ` (${data.size} bytes)` : '';
      const truncated = data.truncated ? ' [truncated]' : '';

      const formattedResult = `\n📄 **${data.path}**${lines}${size}${truncated}\n\`\`\`\n${data.content}\n\`\`\``;
      return formattedResult;
    }

    // Handle list files results
    if (data.files && Array.isArray(data.files)) {
      const fileList = data.files
        .map((file: any) => `${file.isDirectory ? '📁' : '📄'} ${file.relativePath}`)
        .join('\n');

      return `\n📂 **Files in ${data.path}** (${data.count} items)\n${fileList}`;
    }

    // Handle search results
    if (data.matches && Array.isArray(data.matches)) {
      const matchList = data.matches
        .slice(0, 10) // Limit to first 10 matches
        .map((match: any) => `📄 ${match.file}:${match.line} - ${match.match}`)
        .join('\n');

      const more =
        data.matches.length > 10 ? `\n... and ${data.matches.length - 10} more matches` : '';

      return `\n🔍 **Search results for "${data.query}"** (${data.totalMatches} matches in ${data.filesSearched} files)\n${matchList}${more}`;
    }

    // Default formatting for unknown data
    return `\nOperation completed successfully.\n${JSON.stringify(data, null, 2)}`;
  }
}

/**
 * Factory function to create a QCodeEngine instance
 */
export function createQCodeEngine(
  ollamaClient: OllamaClient,
  toolRegistry: ToolRegistry,
  config: Config,
  options?: EngineOptions
): QCodeEngine {
  return new QCodeEngine(ollamaClient, toolRegistry, config, options);
}
