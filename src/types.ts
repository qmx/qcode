/**
 * Represents a tool with its namespace for organization and conflict resolution
 */
export interface NamespacedTool {
  /** The namespace this tool belongs to (e.g., "internal", "mcp-server-name") */
  namespace: string;
  /** The tool's name within its namespace */
  name: string;
  /** Full qualified name including namespace (namespace:name) */
  fullName: string;
  /** The tool's JSON schema definition for function calling */
  definition: ToolDefinition;
  /** Tool execution function - context is always optional */
  execute: (args: Record<string, any>, context?: ToolContext) => Promise<any>;
}

/**
 * Information about an MCP server connection
 */
export interface MCPServerInfo {
  /** Unique identifier for the server */
  id: string;
  /** Display name for the server */
  name: string;
  /** Transport type for connection */
  transport: 'stdio' | 'http';
  /** Connection configuration */
  config: MCPServerConfig;
  /** Current connection status */
  status: 'connected' | 'disconnected' | 'error' | 'connecting';
  /** Available tools from this server */
  tools: ToolDefinition[];
  /** Last error message if status is 'error' */
  error?: string;
  /** Connection timestamp */
  connectedAt?: Date;
}

/**
 * Configuration for MCP server connections
 */
export interface MCPServerConfig {
  /** For stdio transport: command to execute */
  command?: string | undefined;
  /** For stdio transport: command arguments */
  args?: string[] | undefined;
  /** For stdio transport: working directory */
  cwd?: string | undefined;
  /** For stdio transport: environment variables */
  env?: Record<string, string> | undefined;
  /** For http transport: server URL */
  url?: string | undefined;
  /** For http transport: API key or token */
  apiKey?: string | undefined;
  /** Connection timeout in milliseconds */
  timeout?: number | undefined;
  /** Number of retry attempts */
  retries?: number | undefined;
}

/**
 * Generic validation result wrapper
 */
export interface ValidationResult<T> {
  /** Whether validation was successful */
  success: boolean;
  /** The validated data if successful */
  data?: T;
  /** Error message if validation failed */
  error?: string;
  /** Detailed error information */
  details?: string[];
}

/**
 * Tool definition for function calling
 */
export interface ToolDefinition {
  /** Tool name */
  name: string;
  /** Tool description */
  description: string;
  /** JSON schema for the tool's parameters */
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
    additionalProperties?: boolean;
  };
}

/**
 * Custom error class for QCode-specific errors
 */
export class QCodeError extends Error {
  /** Error code for categorization */
  public readonly code: string;
  /** Additional context information */
  public readonly context?: Record<string, any>;
  /** Whether this error should be retried */
  public readonly retryable: boolean;

  constructor(
    message: string,
    code: string,
    context?: Record<string, any>,
    retryable: boolean = false
  ) {
    super(message);
    this.name = 'QCodeError';
    this.code = code;
    if (context !== undefined) {
      this.context = context;
    }
    this.retryable = retryable;

    // Maintains proper stack trace for where error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, QCodeError);
    }
  }

  /**
   * Convert error to JSON for serialization
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      retryable: this.retryable,
      stack: this.stack,
    };
  }
}

/**
 * Security configuration
 */
export interface SecurityConfig {
  /** Workspace directory path restrictions */
  workspace: {
    /** Allowed workspace directories */
    allowedPaths: string[];
    /** Forbidden file patterns */
    forbiddenPatterns: string[];
    /** Whether to allow reading outside workspace */
    allowOutsideWorkspace: boolean;
  };
  /** Command execution restrictions */
  commands: {
    /** Allowed commands whitelist */
    allowedCommands: string[];
    /** Forbidden command patterns */
    forbiddenPatterns: string[];
    /** Whether to allow arbitrary command execution */
    allowArbitraryCommands: boolean;
  };
}

/**
 * Ollama client configuration
 */
export interface OllamaConfig {
  /** Ollama server URL */
  url: string;
  /** Default model to use */
  model: string;
  /** Request timeout in milliseconds */
  timeout: number;
  /** Maximum number of retries */
  retries: number;
  /** Temperature for response generation */
  temperature: number;
  /** Whether to stream responses */
  stream: boolean;
}

/**
 * Logging configuration
 */
export interface LoggingConfig {
  /** Log level */
  level: 'error' | 'warn' | 'info' | 'debug';
  /** Whether to log to console */
  console: boolean;
  /** Log file path (if logging to file) */
  file?: string | undefined;
  /** Whether to include timestamps */
  timestamp: boolean;
  /** Whether to use colors in console output */
  colors: boolean;
}

/**
 * Main application configuration
 */
export interface Config {
  /** Security settings */
  security: SecurityConfig;
  /** Ollama client configuration */
  ollama: OllamaConfig;
  /** MCP server configurations */
  mcpServers: Record<string, MCPServerConfig>;
  /** Logging configuration */
  logging: LoggingConfig;
  /** Working directory */
  workingDirectory: string;
  /** Configuration file paths that were loaded */
  configFiles: string[];
}

/**
 * Partial configuration for merging
 */
export type PartialConfig = {
  /** Security settings */
  security?:
    | {
        workspace?:
          | {
              allowedPaths?: string[] | undefined;
              forbiddenPatterns?: string[] | undefined;
              allowOutsideWorkspace?: boolean | undefined;
            }
          | undefined;
        commands?:
          | {
              allowedCommands?: string[] | undefined;
              forbiddenPatterns?: string[] | undefined;
              allowArbitraryCommands?: boolean | undefined;
            }
          | undefined;
      }
    | undefined;
  /** Ollama client configuration */
  ollama?:
    | {
        url?: string | undefined;
        model?: string | undefined;
        timeout?: number | undefined;
        retries?: number | undefined;
        temperature?: number | undefined;
        stream?: boolean | undefined;
      }
    | undefined;
  /** MCP server configurations */
  mcpServers?: Record<string, Partial<MCPServerConfig>> | undefined;
  /** Logging configuration */
  logging?:
    | {
        level?: 'error' | 'warn' | 'info' | 'debug' | undefined;
        console?: boolean | undefined;
        file?: string | undefined;
        timestamp?: boolean | undefined;
        colors?: boolean | undefined;
      }
    | undefined;
  /** Working directory */
  workingDirectory?: string | undefined;
};

/**
 * CLI command configuration
 */
export interface CLIConfig {
  /** Command to execute */
  command: string;
  /** Whether to use interactive mode */
  interactive: boolean;
  /** Whether to use verbose output */
  verbose: boolean;
  /** Configuration file path override */
  config?: string;
  /** Working directory override */
  cwd?: string;
  /** Additional arguments */
  args: string[];
}

/**
 * Tool execution context
 */
export interface ToolContext {
  /** Current working directory */
  workingDirectory: string;
  /** Security configuration */
  security: SecurityConfig;
  /** Available tools registry */
  registry: any; // Will be properly typed when registry is implemented
  /** User query that triggered this execution */
  query: string;
  /** Request ID for tracking */
  requestId: string;
}

/**
 * Tool execution result
 */
export interface ToolResult {
  /** Whether execution was successful */
  success: boolean;
  /** Result data */
  data?: any;
  /** Error message if failed */
  error?: string;
  /** Execution time in milliseconds */
  duration: number;
  /** Tool that was executed */
  tool: string;
  /** Namespace of the tool */
  namespace: string;
}

/**
 * Query processing result
 */
export interface QueryResult {
  /** The response text */
  response: string;
  /** Tools that were executed */
  toolsExecuted: ToolResult[];
  /** Total processing time */
  duration: number;
  /** Whether the query was successful */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

/**
 * Streaming response chunk
 */
export interface ResponseChunk {
  /** Chunk type */
  type: 'text' | 'tool_start' | 'tool_end' | 'error' | 'done';
  /** Text content (for text chunks) */
  content?: string;
  /** Tool information (for tool chunks) */
  tool?: {
    name: string;
    namespace: string;
    args?: Record<string, any>;
    result?: any;
  };
  /** Error information (for error chunks) */
  error?: {
    message: string;
    code: string;
    retryable: boolean;
  };
}

/**
 * Project context information
 */
export interface ProjectContext {
  /** Project root directory */
  root: string;
  /** Project type (detected) */
  type?: 'nodejs' | 'python' | 'web' | 'unknown';
  /** Package manager used */
  packageManager?: 'npm' | 'yarn' | 'pnpm' | 'pip' | 'poetry';
  /** Main configuration files found */
  configFiles: string[];
  /** Dependencies detected */
  dependencies: string[];
  /** Git repository information */
  git?: {
    branch: string;
    remote?: string;
    hasUncommittedChanges: boolean;
  };
}

/**
 * Native Ollama chat response format
 */
export interface OllamaChatResponse {
  message: {
    role: string;
    content: string;
    tool_calls?: Array<{
      function: {
        name: string;
        arguments: Record<string, any>;
      };
    }>;
  };
  model: string;
  done: boolean;
  eval_count?: number;
  total_duration?: number;
  [key: string]: any;
}

/**
 * Native Ollama generate response format
 */
export interface OllamaGenerateResponse {
  response: string;
  model: string;
  done: boolean;
  context?: number[];
  eval_count?: number;
  total_duration?: number;
  [key: string]: any;
}

/**
 * Workflow context extends ToolContext with workflow-specific information
 */
export interface WorkflowContext extends ToolContext {
  /** Unique workflow identifier */
  workflowId: string;
  /** Parent workflow ID if this is a child workflow */
  parentWorkflowId?: string;
  /** Workflow nesting depth */
  depth: number;
  /** Maximum allowed workflow depth */
  maxDepth: number;
}

/**
 * Status of a workflow step
 */
export type WorkflowStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'interrupted';

/**
 * Status of a workflow
 */
export type WorkflowStatus = 'initialized' | 'running' | 'completed' | 'failed' | 'interrupted';

/**
 * A single step in a workflow execution
 */
export interface WorkflowStep {
  /** Unique step identifier */
  id: string;
  /** Human-readable step name */
  name: string;
  /** Tool name that will be executed */
  toolName: string;
  /** Arguments passed to the tool */
  arguments: Record<string, any>;
  /** Current step status */
  status: WorkflowStepStatus;
  /** Step start time */
  startTime: Date;
  /** Step end time (if completed/failed) */
  endTime?: Date;
  /** Step execution duration in milliseconds */
  duration?: number;
  /** Tool execution result (if completed) */
  result?: ToolResult;
  /** Error information (if failed) */
  error?: QCodeError;
  /** Step metadata */
  metadata?: Record<string, any>;
}

/**
 * Workflow checkpoint for resumption
 */
export interface WorkflowCheckpoint {
  /** Workflow ID */
  workflowId: string;
  /** Checkpoint creation time */
  createdAt: Date;
  /** Workflow status at checkpoint */
  status: WorkflowStatus;
  /** Completed steps at checkpoint */
  completedSteps: WorkflowStep[];
  /** Step results at checkpoint */
  results: Record<string, ToolResult>;
  /** Workflow context at checkpoint */
  context: WorkflowContext;
  /** Checkpoint metadata */
  metadata?: Record<string, any>;
}

/**
 * Workflow rollback event
 */
export interface WorkflowRollback {
  /** Rollback timestamp */
  timestamp: Date;
  /** Reason for rollback */
  reason: string;
  /** Number of steps rolled back */
  stepsRolledBack: number;
  /** Checkpoint used for rollback */
  checkpointId?: string;
}

/**
 * Workflow execution summary
 */
export interface WorkflowSummary {
  /** Workflow ID */
  id: string;
  /** Current workflow status */
  status: WorkflowStatus;
  /** Total number of steps */
  totalSteps: number;
  /** Number of completed steps */
  completedSteps: number;
  /** Number of failed steps */
  failedSteps: number;
  /** Total execution duration */
  duration: number;
  /** Creation time */
  createdAt: Date;
  /** Completion time (if finished) */
  completedAt?: Date;
  /** All errors encountered */
  errors: QCodeError[];
  /** Workflow metadata */
  metadata?: Record<string, any>;
}

/**
 * Workflow memory usage information
 */
export interface WorkflowMemoryUsage {
  /** Number of steps in memory */
  stepsCount: number;
  /** Estimated size of stored results in bytes */
  resultsSize: number;
  /** Estimated total memory usage in bytes */
  totalSize: number;
}

// =============================================================================
// PHASE 1: INTELLIGENT CONTEXT MANAGEMENT INTERFACES
// =============================================================================

/**
 * Structured tool result for intelligent context management
 * Separates display content from LLM context to enable smart formatting
 */
export interface StructuredToolResult {
  // Tool execution metadata
  /** The tool that was executed */
  toolName: string;
  /** Whether the tool execution was successful */
  success: boolean;
  /** Tool execution duration in milliseconds */
  duration: number;

  // Result categorization for smart formatting
  /** Type of result for context-aware formatting */
  type: 'file_content' | 'file_list' | 'search_results' | 'analysis' | 'error';

  // Human-readable summary for conversation context (max 500 chars)
  /** Brief summary of the result for LLM context */
  summary: string;

  // Key extracted information for workflow decisions
  /** Important findings extracted from the result */
  keyFindings: string[];

  // Full raw data for detailed analysis when needed
  /** Complete tool result data */
  fullData: any;

  // Size management flags
  /** Whether the result was truncated for context management */
  truncated: boolean;
  /** Original size of the data before truncation */
  originalSize?: number;

  // Context for next workflow step
  /** Data that should be preserved for subsequent workflow steps */
  contextForNextStep: Record<string, any>;

  // File-specific extracted metadata
  /** File paths mentioned in the result */
  filePaths?: string[];
  /** Patterns or keywords detected */
  patterns?: string[];
  /** Errors encountered during execution */
  errors?: string[];
}

/**
 * Enhanced conversation memory management
 * Tracks context and state across multiple tool executions
 */
export interface ConversationMemory {
  // Original user intent
  /** The user's original query */
  originalQuery: string;

  // Current workflow position
  /** Current step number in the workflow */
  stepNumber: number;
  /** Maximum steps allowed in this workflow */
  maxSteps: number;

  // Structured results from previous steps
  /** Results from all previous workflow steps */
  previousResults: StructuredToolResult[];

  // Extracted patterns and decisions
  /** Patterns extracted across all steps */
  extractedPatterns: Record<string, any>;

  // Working memory for cross-step context
  /** Persistent memory across workflow steps */
  workingMemory: Record<string, any>;

  // Conversation size management
  /** Current total size of conversation context in characters */
  totalContextSize: number;
  /** Maximum allowed context size in characters */
  maxContextSize: number;
}

/**
 * Context-aware message formatting
 * Enhanced message format with metadata for intelligent conversation management
 */
export interface ContextMessage {
  /** Message role in the conversation */
  role: 'system' | 'user' | 'assistant';
  /** Message content */
  content: string;
  /** Additional metadata for context management */
  metadata?: {
    /** Tool results associated with this message */
    toolResults?: StructuredToolResult[];
    /** Step number in the workflow */
    stepNumber?: number;
    /** Size of this message in characters */
    contextSize?: number;
    /** Whether this message was truncated */
    truncated?: boolean;
  };
}

/**
 * Tool result extraction strategy
 * Defines how to extract key information from different types of tool results
 */
export interface ResultExtractionStrategy {
  /** Result type this strategy applies to */
  type: StructuredToolResult['type'];
  /** Maximum summary length for this result type */
  maxSummaryLength: number;
  /** Key patterns to extract from the result */
  extractionPatterns: string[];
  /** Function to extract key findings */
  extractKeyFindings: (data: any) => string[];
  /** Function to create context for next step */
  createNextStepContext: (data: any) => Record<string, any>;
}

/**
 * Context size management configuration
 * Controls how conversation context is maintained within size limits
 */
export interface ContextSizeConfig {
  /** Maximum total context size in characters */
  maxTotalSize: number;
  /** Maximum size for individual tool results */
  maxResultSize: number;
  /** Number of recent steps to always preserve */
  alwaysPreserveSteps: number;
  /** Size threshold for triggering compression */
  compressionThreshold: number;
  /** Minimum context size to maintain */
  minContextSize: number;
}
