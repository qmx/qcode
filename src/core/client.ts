import { Ollama } from 'ollama';
import {
  OllamaConfig,
  QCodeError,
  ToolDefinition,
  OllamaChatResponse,
  OllamaGenerateResponse,
} from '../types.js';

/**
 * Standardized response format from Ollama
 */
export interface OllamaResponse {
  /** The generated response text */
  response: string;
  /** Model used for generation */
  model: string;
  /** Context for conversation continuity */
  context?: number[];
  /** Whether the response is complete */
  done: boolean;
  /** Token evaluation metrics */
  eval_count?: number;
  /** Duration metrics */
  total_duration?: number;
  /** Full message structure (for function calls) */
  message?: {
    role: string;
    content: string;
    tool_calls?: Array<{
      function: {
        name: string;
        arguments: Record<string, any>;
      };
    }>;
  };
}

/**
 * Function calling request format for Ollama
 */
export interface FunctionCallRequest {
  /** The model to use */
  model: string;
  /** The messages in the conversation */
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  /** Available tools/functions */
  tools?: Array<{
    type: 'function';
    function: ToolDefinition;
  }>;
  /** Whether to stream the response */
  stream?: boolean;
  /** Response format (e.g., 'json') */
  format?: string;
  /** Temperature for randomness */
  temperature?: number;
  /** Other Ollama options */
  options?: Record<string, any>;
}

/**
 * Streaming response chunk
 */
export interface StreamingChunk {
  /** Partial response text */
  response?: string;
  /** Whether this is the final chunk */
  done: boolean;
  /** Message content for chat responses */
  message?: {
    role: string;
    content: string;
  };
}

/**
 * QCode Ollama client that wraps the official Ollama library
 * Provides additional functionality needed for QCode including:
 * - Function calling support with JSON formatting
 * - Streaming response handling
 * - Error handling and retries
 * - Connection validation
 * - Model availability checking
 */
export class OllamaClient {
  private ollama: Ollama;
  private config: OllamaConfig;
  private retryDelays = [1000, 2000, 4000]; // Exponential backoff delays

  constructor(config: OllamaConfig) {
    this.config = config;
    this.ollama = new Ollama({
      host: config.url,
    });
  }

  /**
   * Validates connection to Ollama server
   */
  async validateConnection(): Promise<boolean> {
    try {
      await this.ollama.list();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Checks if a specific model is available
   */
  async isModelAvailable(modelName: string): Promise<boolean> {
    try {
      const models = await this.ollama.list();
      return models.models.some(model => model.name === modelName);
    } catch (error) {
      throw new QCodeError('Failed to check model availability', 'MODEL_CHECK_ERROR', {
        model: modelName,
        originalError: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Lists all available models
   */
  async listModels(): Promise<string[]> {
    try {
      const models = await this.ollama.list();
      return models.models.map(model => model.name);
    } catch (error) {
      throw new QCodeError('Failed to list models', 'MODEL_LIST_ERROR', {
        originalError: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Generates a response using the Ollama generate API
   */
  async generate(
    prompt: string,
    options: {
      model?: string;
      system?: string;
      template?: string;
      context?: number[];
      stream?: boolean;
      format?: string;
      keepAlive?: string | number;
      options?: Record<string, any>;
    } = {}
  ): Promise<OllamaResponse> {
    const model = options.model || this.config.model;

    const requestOptions = {
      model,
      prompt,
      stream: false as const,
      options: {
        temperature: this.config.temperature,
        ...options.options,
      },
      ...(options.system !== undefined && { system: options.system }),
      ...(options.template !== undefined && { template: options.template }),
      ...(options.context !== undefined && { context: options.context }),
      ...(options.format !== undefined && { format: options.format }),
      ...(options.keepAlive !== undefined && { keep_alive: options.keepAlive }),
    };

    return this.executeWithRetry(async () => {
      const response = (await this.ollama.generate(requestOptions)) as OllamaGenerateResponse;
      return this.mapGenerateResponseToOllamaResponse(response);
    }, 'GENERATE_ERROR');
  }

  /**
   * Generates a streaming response using the Ollama generate API
   */
  async generateStream(
    prompt: string,
    onChunk: (chunk: StreamingChunk) => void,
    options: {
      model?: string;
      system?: string;
      template?: string;
      context?: number[];
      format?: string;
      keepAlive?: string | number;
      options?: Record<string, any>;
    } = {}
  ): Promise<OllamaResponse> {
    const model = options.model || this.config.model;

    const requestOptions = {
      model,
      prompt,
      stream: true as const,
      options: {
        temperature: this.config.temperature,
        ...options.options,
      },
      ...(options.system !== undefined && { system: options.system }),
      ...(options.template !== undefined && { template: options.template }),
      ...(options.context !== undefined && { context: options.context }),
      ...(options.format !== undefined && { format: options.format }),
      ...(options.keepAlive !== undefined && { keep_alive: options.keepAlive }),
    };

    return this.executeWithRetry(async () => {
      const stream = (await this.ollama.generate(
        requestOptions
      )) as AsyncIterable<OllamaGenerateResponse>;
      let finalResponse: OllamaResponse | null = null;

      for await (const chunk of stream) {
        onChunk(chunk);

        if (chunk.done) {
          finalResponse = this.mapGenerateResponseToOllamaResponse(chunk);
        }
      }

      if (!finalResponse) {
        throw new Error('Stream ended without final response');
      }

      return finalResponse;
    }, 'GENERATE_STREAM_ERROR');
  }

  /**
   * Performs function calling using Ollama's chat API
   */
  async functionCall(request: FunctionCallRequest): Promise<OllamaResponse> {
    const requestOptions = {
      model: request.model || this.config.model,
      messages: request.messages,
      stream: false as const,
      format: request.format || 'json',
      options: {
        temperature: request.temperature ?? this.config.temperature,
        ...request.options,
      },
      ...(request.tools && { tools: request.tools }),
    };

    return this.executeWithRetry(async () => {
      const response = (await this.ollama.chat(requestOptions)) as OllamaChatResponse;

      return this.mapChatResponseToOllamaResponse(response);
    }, 'FUNCTION_CALL_ERROR');
  }

  /**
   * Performs streaming function calling using Ollama's chat API
   */
  async functionCallStream(
    request: FunctionCallRequest,
    onChunk: (chunk: StreamingChunk) => void
  ): Promise<OllamaResponse> {
    const requestOptions = {
      model: request.model || this.config.model,
      messages: request.messages,
      stream: true as const,
      format: request.format || 'json',
      options: {
        temperature: request.temperature ?? this.config.temperature,
        ...request.options,
      },
      ...(request.tools && { tools: request.tools }),
    };

    return this.executeWithRetry(async () => {
      const stream = (await this.ollama.chat(requestOptions)) as AsyncIterable<OllamaChatResponse>;
      let finalResponse: OllamaResponse | null = null;
      let accumulatedContent = '';

      for await (const chunk of stream) {
        const streamChunk: StreamingChunk = {
          response: chunk.message?.content || '',
          done: chunk.done,
          message: chunk.message,
        };

        if (chunk.message?.content) {
          accumulatedContent += chunk.message.content;
        }

        onChunk(streamChunk);

        if (chunk.done) {
          finalResponse = this.mapChatResponseToOllamaResponse(chunk, accumulatedContent);
        }
      }

      if (!finalResponse) {
        throw new Error('Stream ended without final response');
      }

      return finalResponse;
    }, 'FUNCTION_CALL_STREAM_ERROR');
  }

  /**
   * Performs chat conversation using Ollama's chat API
   */
  async chat(
    messages: Array<{
      role: 'system' | 'user' | 'assistant';
      content: string;
    }>,
    options: {
      model?: string;
      stream?: boolean;
      format?: string;
      keepAlive?: string | number;
      options?: Record<string, any>;
    } = {}
  ): Promise<OllamaResponse> {
    const requestOptions = {
      model: options.model || this.config.model,
      messages,
      stream: false as const,
      options: {
        temperature: this.config.temperature,
        ...options.options,
      },
      ...(options.format && { format: options.format }),
      ...(options.keepAlive !== undefined && { keep_alive: options.keepAlive }),
    };

    return this.executeWithRetry(async () => {
      const response = (await this.ollama.chat(requestOptions)) as OllamaChatResponse;

      return this.mapChatResponseToOllamaResponse(response);
    }, 'CHAT_ERROR');
  }

  /**
   * Performs streaming chat conversation
   */
  async chatStream(
    messages: Array<{
      role: 'system' | 'user' | 'assistant';
      content: string;
    }>,
    onChunk: (chunk: StreamingChunk) => void,
    options: {
      model?: string;
      format?: string;
      keepAlive?: string | number;
      options?: Record<string, any>;
    } = {}
  ): Promise<OllamaResponse> {
    const requestOptions = {
      model: options.model || this.config.model,
      messages,
      stream: true as const,
      options: {
        temperature: this.config.temperature,
        ...options.options,
      },
      ...(options.format && { format: options.format }),
      ...(options.keepAlive !== undefined && { keep_alive: options.keepAlive }),
    };

    return this.executeWithRetry(async () => {
      const stream = (await this.ollama.chat(requestOptions)) as AsyncIterable<OllamaChatResponse>;
      let finalResponse: OllamaResponse | null = null;
      let accumulatedContent = '';

      for await (const chunk of stream) {
        const streamChunk: StreamingChunk = {
          response: chunk.message?.content || '',
          done: chunk.done,
          message: chunk.message,
        };

        if (chunk.message?.content) {
          accumulatedContent += chunk.message.content;
        }

        onChunk(streamChunk);

        if (chunk.done) {
          finalResponse = this.mapChatResponseToOllamaResponse(chunk, accumulatedContent);
        }
      }

      if (!finalResponse) {
        throw new Error('Stream ended without final response');
      }

      return finalResponse;
    }, 'FUNCTION_CALL_STREAM_ERROR');
  }

  /**
   * Pulls a model from the Ollama registry
   */
  async pullModel(modelName: string): Promise<void> {
    return this.executeWithRetry(async () => {
      await this.ollama.pull({ model: modelName, stream: false });
    }, 'PULL_MODEL_ERROR');
  }

  /**
   * Shows information about a model
   */
  async showModel(modelName: string): Promise<any> {
    return this.executeWithRetry(async () => {
      return await this.ollama.show({ model: modelName });
    }, 'SHOW_MODEL_ERROR');
  }

  /**
   * Executes a function with retry logic and proper error handling
   */
  private async executeWithRetry<T>(operation: () => Promise<T>, errorCode: string): Promise<T> {
    let lastError: Error | null = null;

    // First attempt without delay
    try {
      return await this.withTimeout(operation());
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
    }

    // Retry attempts with exponential backoff
    for (let attempt = 0; attempt < this.config.retries; attempt++) {
      try {
        const delayMs =
          this.retryDelays[attempt] ?? this.retryDelays[this.retryDelays.length - 1] ?? 1000;
        await this.delay(delayMs);
        return await this.withTimeout(operation());
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
      }
    }

    // All retries failed
    throw new QCodeError(
      `Operation failed after ${this.config.retries + 1} attempts: ${lastError?.message}`,
      errorCode,
      {
        originalError: lastError?.message,
        retries: this.config.retries,
        timeout: this.config.timeout,
      },
      false // Not retryable since we already retried
    );
  }

  /**
   * Wraps a promise with a timeout
   */
  private async withTimeout<T>(promise: Promise<T>): Promise<T> {
    const timeoutMs = typeof this.config.timeout === 'number' ? this.config.timeout : 30000;

    let timeoutId!: NodeJS.Timeout;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([promise, timeoutPromise]);
      clearTimeout(timeoutId);
      return result;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Delays execution for the specified number of milliseconds
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Gets the current configuration
   */
  getConfig(): OllamaConfig {
    return { ...this.config };
  }

  /**
   * Updates the configuration
   */
  updateConfig(newConfig: Partial<OllamaConfig>): void {
    this.config = { ...this.config, ...newConfig };

    // Update the underlying Ollama client if URL changed
    if (newConfig.url) {
      this.ollama = new Ollama({
        host: newConfig.url,
      });
    }
  }

  /**
   * Maps Ollama's native chat response to our standardized format
   */
  private mapChatResponseToOllamaResponse(
    response: OllamaChatResponse,
    overrideContent?: string
  ): OllamaResponse {
    return {
      response: overrideContent || response.message?.content || '',
      model: response.model,
      done: response.done,
      ...(response.eval_count !== undefined && { eval_count: response.eval_count }),
      ...(response.total_duration !== undefined && { total_duration: response.total_duration }),
      message: response.message,
    };
  }

  /**
   * Maps Ollama's native generate response to our standardized format
   */
  private mapGenerateResponseToOllamaResponse(response: OllamaGenerateResponse): OllamaResponse {
    return {
      response: response.response,
      model: response.model,
      done: response.done,
      ...(response.context !== undefined && { context: response.context }),
      ...(response.eval_count !== undefined && { eval_count: response.eval_count }),
      ...(response.total_duration !== undefined && { total_duration: response.total_duration }),
    };
  }
}

/**
 * Factory function to create an OllamaClient instance
 */
export function createOllamaClient(config: OllamaConfig): OllamaClient {
  return new OllamaClient(config);
}
