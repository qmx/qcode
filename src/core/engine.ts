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

    try {
      // Phase 1: Basic query processing
      this.validateQuery(query);

      // Phase 2: Intent detection (simple for now)
      const intent = await this.detectIntent(query);
      context.intent = intent;

      // Phase 3: Process based on intent
      const response = await this.processWithIntent(query, context);

      return {
        response: response.response,
        toolsExecuted: [], // Will be populated as we add tool orchestration
        toolResults: [], // Will be populated as we add tool orchestration
        processingTime: Date.now() - startTime,
        complete: true,
        errors: [],
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
        toolsExecuted: [],
        toolResults: [],
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

    if (lowerQuery.includes('file') || lowerQuery.includes('read') || lowerQuery.includes('list')) {
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
