import { Ollama } from 'ollama';
import { OllamaConfig, QCodeError, ToolDefinition } from '../types.js';

/**
 * Response from Ollama generate/chat operations
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
  /** Additional response metadata */
  [key: string]: any;
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
  /** Any additional metadata */
  [key: string]: any;
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

    const requestOptions: any = {
      model,
      prompt,
      stream: false, // Force non-streaming for this method
      options: {
        temperature: this.config.temperature,
        ...options.options,
      },
    };

    // Only add optional properties if they have defined values
    if (options.system !== undefined) {
      requestOptions.system = options.system;
    }
    if (options.template !== undefined) {
      requestOptions.template = options.template;
    }
    if (options.context !== undefined) {
      requestOptions.context = options.context;
    }
    if (options.format !== undefined) {
      requestOptions.format = options.format;
    }
    if (options.keepAlive !== undefined) {
      requestOptions.keep_alive = options.keepAlive;
    }

    return this.executeWithRetry(async () => {
      const response = await this.ollama.generate(requestOptions);
      // For non-streaming generate, response is a GenerateResponse object
      return {
        response: (response as any).response || '',
        model: (response as any).model,
        context: (response as any).context,
        done: (response as any).done || true,
        eval_count: (response as any).eval_count,
        total_duration: (response as any).total_duration,
      } as OllamaResponse;
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

    const requestOptions: any = {
      model,
      prompt,
      stream: true,
      options: {
        temperature: this.config.temperature,
        ...options.options,
      },
    };

    // Only add optional properties if they have defined values
    if (options.system !== undefined) {
      requestOptions.system = options.system;
    }
    if (options.template !== undefined) {
      requestOptions.template = options.template;
    }
    if (options.context !== undefined) {
      requestOptions.context = options.context;
    }
    if (options.format !== undefined) {
      requestOptions.format = options.format;
    }
    if (options.keepAlive !== undefined) {
      requestOptions.keep_alive = options.keepAlive;
    }

    return this.executeWithRetry(async () => {
      const stream = await this.ollama.generate(requestOptions);
      let finalResponse: OllamaResponse | null = null;

      for await (const chunk of stream as AsyncIterable<any>) {
        onChunk(chunk);

        if (chunk.done) {
          finalResponse = {
            response: chunk.response || '',
            model: chunk.model,
            context: chunk.context,
            done: chunk.done,
            eval_count: chunk.eval_count,
            total_duration: chunk.total_duration,
          } as OllamaResponse;
        }
      }

      if (!finalResponse) {
        throw new Error('Stream ended without final response');
      }

      return finalResponse;
    }, 'GENERATE_STREAM_ERROR');
  }

  /**
   * Performs function calling using Ollama's chat API with tool support
   */
  async functionCall(request: FunctionCallRequest): Promise<OllamaResponse> {
    const requestOptions: any = {
      model: request.model || this.config.model,
      messages: request.messages,
      stream: false,
      format: request.format || 'json',
      options: {
        temperature: request.temperature ?? this.config.temperature,
        ...request.options,
      },
    };

    // Only add tools if they are defined
    if (request.tools !== undefined) {
      requestOptions.tools = request.tools;
    }

    return this.executeWithRetry(async () => {
      const response = await this.ollama.chat(requestOptions);
      // For non-streaming chat, response is a ChatResponse object
      return {
        response: (response as any).message?.content || '',
        model: (response as any).model,
        done: (response as any).done || true,
        eval_count: (response as any).eval_count,
        total_duration: (response as any).total_duration,
      } as OllamaResponse;
    }, 'FUNCTION_CALL_ERROR');
  }

  /**
   * Performs streaming function calling using Ollama's chat API
   */
  async functionCallStream(
    request: FunctionCallRequest,
    onChunk: (chunk: StreamingChunk) => void
  ): Promise<OllamaResponse> {
    const requestOptions: any = {
      model: request.model || this.config.model,
      messages: request.messages,
      stream: true,
      format: request.format || 'json',
      options: {
        temperature: request.temperature ?? this.config.temperature,
        ...request.options,
      },
    };

    // Only add tools if they are defined
    if (request.tools !== undefined) {
      requestOptions.tools = request.tools;
    }

    return this.executeWithRetry(async () => {
      const stream = await this.ollama.chat(requestOptions);
      let finalResponse: OllamaResponse | null = null;
      let accumulatedContent = '';

      for await (const chunk of stream as AsyncIterable<any>) {
        const streamChunk: StreamingChunk = {
          response: chunk.message?.content || '',
          done: chunk.done,
          message: chunk.message,
          ...chunk,
        };

        if (chunk.message?.content) {
          accumulatedContent += chunk.message.content;
        }

        onChunk(streamChunk);

        if (chunk.done) {
          finalResponse = {
            response: accumulatedContent,
            model: chunk.model,
            done: chunk.done,
            eval_count: chunk.eval_count,
            total_duration: chunk.total_duration,
          } as OllamaResponse;
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
    const requestOptions: any = {
      model: options.model || this.config.model,
      messages,
      stream: false,
      options: {
        temperature: this.config.temperature,
        ...options.options,
      },
    };

    // Only add optional properties if they have defined values
    if (options.format !== undefined) {
      requestOptions.format = options.format;
    }
    if (options.keepAlive !== undefined) {
      requestOptions.keep_alive = options.keepAlive;
    }

    return this.executeWithRetry(async () => {
      const response = await this.ollama.chat(requestOptions);
      // For non-streaming chat, response is a ChatResponse object
      return {
        response: (response as any).message?.content || '',
        model: (response as any).model,
        done: (response as any).done || true,
        eval_count: (response as any).eval_count,
        total_duration: (response as any).total_duration,
      } as OllamaResponse;
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
    const requestOptions: any = {
      model: options.model || this.config.model,
      messages,
      stream: true,
      options: {
        temperature: this.config.temperature,
        ...options.options,
      },
    };

    // Only add optional properties if they have defined values
    if (options.format !== undefined) {
      requestOptions.format = options.format;
    }
    if (options.keepAlive !== undefined) {
      requestOptions.keep_alive = options.keepAlive;
    }

    return this.executeWithRetry(async () => {
      const stream = await this.ollama.chat(requestOptions);
      let finalResponse: OllamaResponse | null = null;
      let accumulatedContent = '';

      for await (const chunk of stream as AsyncIterable<any>) {
        const streamChunk: StreamingChunk = {
          response: chunk.message?.content || '',
          done: chunk.done,
          message: chunk.message,
          ...chunk,
        };

        if (chunk.message?.content) {
          accumulatedContent += chunk.message.content;
        }

        onChunk(streamChunk);

        if (chunk.done) {
          finalResponse = {
            response: accumulatedContent,
            model: chunk.model,
            done: chunk.done,
            eval_count: chunk.eval_count,
            total_duration: chunk.total_duration,
          } as OllamaResponse;
        }
      }

      if (!finalResponse) {
        throw new Error('Stream ended without final response');
      }

      return finalResponse;
    }, 'CHAT_STREAM_ERROR');
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
}

/**
 * Factory function to create an OllamaClient instance
 */
export function createOllamaClient(config: OllamaConfig): OllamaClient {
  return new OllamaClient(config);
}
