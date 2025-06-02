import { WorkspaceSecurity } from '../security/workspace.js';
import {
  NamespacedTool,
  ToolDefinition,
  QCodeError,
  SecurityConfig,
  ToolContext,
  ToolResult,
  MCPServerInfo,
  ValidationResult,
} from '../types.js';

/**
 * Tool execution context with additional registry information
 */
export interface ToolExecutionContext extends ToolContext {
  /** The tool being executed */
  tool: NamespacedTool;
  /** Execution start time */
  startTime: number;
}

/**
 * Tool registration options
 */
export interface ToolRegistrationOptions {
  /** Override namespace (defaults to internal for direct registration) */
  namespace?: string;
  /** Whether to allow overriding existing tools */
  allowOverride?: boolean;
  /** Additional metadata for the tool */
  metadata?: Record<string, any>;
}

/**
 * Registry statistics
 */
export interface RegistryStats {
  /** Total number of registered tools */
  totalTools: number;
  /** Number of tools by namespace */
  toolsByNamespace: Record<string, number>;
  /** Number of active MCP servers */
  activeMCPServers: number;
  /** Tool execution metrics */
  executionStats: {
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    averageExecutionTime: number;
  };
}

/**
 * Tool search options
 */
export interface ToolSearchOptions {
  /** Specific namespace to search in */
  namespace?: string;
  /** Pattern to match tool names */
  namePattern?: string | RegExp;
  /** Whether to include tool definitions in results */
  includeDefinitions?: boolean;
}

/**
 * Tool Registry manages all available tools with proper namespacing and security
 */
export class ToolRegistry {
  private tools: Map<string, NamespacedTool> = new Map();
  private mcpServers: Map<string, MCPServerInfo> = new Map();
  // Security framework for future validation features
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private _security: WorkspaceSecurity;
  private executionStats = {
    totalExecutions: 0,
    successfulExecutions: 0,
    failedExecutions: 0,
    totalExecutionTime: 0,
  };

  constructor(securityConfig: SecurityConfig) {
    this._security = new WorkspaceSecurity(securityConfig);
  }

  /**
   * Registers a new tool with the specified namespace
   */
  registerTool(
    name: string,
    definition: ToolDefinition,
    execute: (args: Record<string, any>) => Promise<any>,
    options: ToolRegistrationOptions = {}
  ): NamespacedTool {
    const namespace = options.namespace || 'internal';
    const fullName = this.buildFullName(namespace, name);

    // Check if tool already exists
    if (this.tools.has(fullName) && !options.allowOverride) {
      throw new QCodeError(`Tool ${fullName} already registered`, 'TOOL_ALREADY_EXISTS', {
        namespace,
        name,
        fullName,
      });
    }

    // Create the namespaced tool
    const namespacedTool: NamespacedTool = {
      namespace,
      name,
      fullName,
      definition: { ...definition },
      execute,
    };

    this.tools.set(fullName, namespacedTool);

    return namespacedTool;
  }

  /**
   * Registers an internal tool (shorthand for namespace: 'internal')
   */
  registerInternalTool(
    name: string,
    definition: ToolDefinition,
    execute: (args: Record<string, any>) => Promise<any>,
    allowOverride: boolean = false
  ): NamespacedTool {
    return this.registerTool(name, definition, execute, {
      namespace: 'internal',
      allowOverride,
    });
  }

  /**
   * Registers tools from an MCP server
   */
  registerMCPServer(serverInfo: MCPServerInfo): void {
    // Validate server info
    if (!serverInfo.id || !serverInfo.name) {
      throw new QCodeError('Invalid MCP server info: missing id or name', 'INVALID_MCP_SERVER', {
        serverInfo,
      });
    }

    // eslint-disable-next-line no-console
    console.log(`Registering MCP server: ${serverInfo.name} (${serverInfo.id})`);

    // Store server info
    this.mcpServers.set(serverInfo.id, serverInfo);

    // Register all tools from the server
    for (const toolDef of serverInfo.tools) {
      try {
        this.registerTool(
          toolDef.name,
          toolDef,
          this.createMCPToolExecutor(serverInfo.id, toolDef.name),
          {
            namespace: serverInfo.id,
            allowOverride: true, // MCP tools can override each other
            metadata: { mcpServer: serverInfo.id },
          }
        );
      } catch (error) {
        // Log the error but continue registering other tools
        // eslint-disable-next-line no-console
        console.warn(
          `Failed to register MCP tool ${toolDef.name} from server ${serverInfo.id}:`,
          error
        );
      }
    }
  }

  /**
   * Unregisters an MCP server and all its tools
   */
  unregisterMCPServer(serverId: string): boolean {
    const serverInfo = this.mcpServers.get(serverId);
    if (!serverInfo) {
      return false;
    }

    // Remove all tools from this server
    const toolsToRemove: string[] = [];
    for (const [fullName, tool] of this.tools.entries()) {
      if (tool.namespace === serverId) {
        toolsToRemove.push(fullName);
      }
    }

    for (const toolName of toolsToRemove) {
      this.tools.delete(toolName);
    }

    // Remove server info
    this.mcpServers.delete(serverId);

    return true;
  }

  /**
   * Retrieves a tool by its full name (namespace:name) or simple name
   */
  getTool(toolIdentifier: string): NamespacedTool | null {
    // Try direct lookup first (full name)
    const directLookup = this.tools.get(toolIdentifier);
    if (directLookup !== undefined) {
      return directLookup;
    }

    // If no namespace specified, check for ambiguity first
    if (!toolIdentifier.includes(':')) {
      // Search in all namespaces for tools with this name
      const matchingTools = Array.from(this.tools.values()).filter(
        tool => tool.name === toolIdentifier
      );

      if (matchingTools.length === 0) {
        return null;
      } else if (matchingTools.length === 1) {
        const foundTool = matchingTools[0];
        return foundTool || null;
      } else if (matchingTools.length > 1) {
        // Multiple tools with same name - require namespace
        const namespaces = matchingTools.map(t => t.namespace).join(', ');
        throw new QCodeError(
          `Ambiguous tool name "${toolIdentifier}". Available in namespaces: ${namespaces}`,
          'AMBIGUOUS_TOOL_NAME',
          { toolIdentifier, availableNamespaces: namespaces }
        );
      }
    }

    return null;
  }

  /**
   * Execute a tool by its full name with security validation
   */
  async executeTool(
    toolIdentifier: string,
    args: Record<string, any>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _context: ToolContext
  ): Promise<ToolResult> {
    const startTime = Date.now();
    this.executionStats.totalExecutions++;

    try {
      // Get the tool
      const tool = this.getTool(toolIdentifier);
      if (!tool) {
        throw new QCodeError(`Tool "${toolIdentifier}" not found`, 'TOOL_NOT_FOUND', {
          toolIdentifier,
        });
      }

      // Validate arguments
      const validationResult = this.validateToolArguments(tool, args);
      if (!validationResult.success) {
        throw new QCodeError(
          `Tool validation failed: ${validationResult.error}`,
          'TOOL_VALIDATION_ERROR',
          {
            tool: tool.fullName,
            args,
            validationDetails: validationResult.details,
          }
        );
      }

      // Execute the tool
      let result;
      try {
        result = await tool.execute(validationResult.data!, _context);
      } catch (error) {
        // Wrap execution errors
        throw new QCodeError(
          `Tool execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'TOOL_EXECUTION_ERROR',
          {
            tool: tool.fullName,
            args: validationResult.data,
            originalError: error instanceof Error ? error.message : error,
          }
        );
      }

      if (result === undefined || result === null) {
        throw new QCodeError('Tool execution returned null or undefined', 'TOOL_EXECUTION_ERROR', {
          tool: tool.fullName,
        });
      }

      // Calculate execution time
      const duration = Date.now() - startTime;
      this.executionStats.successfulExecutions++;
      this.executionStats.totalExecutionTime += duration;

      // Check if the result is already a ToolResult (has success, duration, tool, namespace properties)
      if (
        result &&
        typeof result === 'object' &&
        'success' in result &&
        'duration' in result &&
        'tool' in result &&
        'namespace' in result
      ) {
        // Result is already a ToolResult, return it as-is but update stats
        return result;
      }

      // Result is raw data, wrap it in a ToolResult
      return {
        success: true,
        data: result,
        duration,
        tool: tool.name,
        namespace: tool.namespace,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.executionStats.failedExecutions++;
      this.executionStats.totalExecutionTime += duration;

      const qcodeError =
        error instanceof QCodeError
          ? error
          : new QCodeError(
              `Unexpected error during tool execution: ${error instanceof Error ? error.message : 'Unknown error'}`,
              'UNEXPECTED_TOOL_ERROR',
              { toolIdentifier, args, originalError: error }
            );

      return {
        success: false,
        error: qcodeError.message,
        duration,
        tool: toolIdentifier.split(':').pop() || toolIdentifier,
        namespace: toolIdentifier.includes(':')
          ? toolIdentifier.split(':')[0] || 'unknown'
          : 'unknown',
      };
    }
  }

  /**
   * Lists all available tools, optionally filtered
   */
  listTools(options: ToolSearchOptions = {}): NamespacedTool[] {
    let tools = Array.from(this.tools.values());

    // Filter by namespace
    if (options.namespace) {
      tools = tools.filter(tool => tool.namespace === options.namespace);
    }

    // Filter by name pattern
    if (options.namePattern) {
      const pattern =
        typeof options.namePattern === 'string'
          ? new RegExp(options.namePattern, 'i')
          : options.namePattern;
      tools = tools.filter(tool => pattern.test(tool.name));
    }

    // Create clean copies without execute function if definitions not requested
    if (!options.includeDefinitions) {
      return tools.map(tool => ({
        namespace: tool.namespace,
        name: tool.name,
        fullName: tool.fullName,
        definition: { ...tool.definition },
        execute: tool.execute, // Keep the function reference
      }));
    }

    return tools;
  }

  /**
   * Lists tool names in a format suitable for user display
   */
  listToolNames(namespace?: string): string[] {
    const options: ToolSearchOptions = {};
    if (namespace !== undefined) {
      options.namespace = namespace;
    }
    return this.listTools(options)
      .map(tool => tool.fullName)
      .sort();
  }

  /**
   * Gets tools formatted for Ollama function calling
   */
  getToolsForOllama(namespace?: string): Array<{ type: 'function'; function: ToolDefinition }> {
    const options: ToolSearchOptions = { includeDefinitions: true };
    if (namespace !== undefined) {
      options.namespace = namespace;
    }
    return this.listTools(options).map(tool => ({
      type: 'function' as const,
      function: {
        ...tool.definition,
        // Ensure we use the full namespaced name for Ollama
        name: tool.fullName,
      },
    }));
  }

  /**
   * Gets registry statistics
   */
  getStats(): RegistryStats {
    const toolsByNamespace: Record<string, number> = {};
    for (const tool of this.tools.values()) {
      toolsByNamespace[tool.namespace] = (toolsByNamespace[tool.namespace] || 0) + 1;
    }

    const averageExecutionTime =
      this.executionStats.totalExecutions > 0
        ? this.executionStats.totalExecutionTime / this.executionStats.totalExecutions
        : 0;

    return {
      totalTools: this.tools.size,
      toolsByNamespace,
      activeMCPServers: this.mcpServers.size,
      executionStats: {
        ...this.executionStats,
        averageExecutionTime,
      },
    };
  }

  /**
   * Gets information about registered MCP servers
   */
  getMCPServers(): MCPServerInfo[] {
    return Array.from(this.mcpServers.values());
  }

  /**
   * Gets a specific MCP server by ID
   */
  getMCPServer(serverId: string): MCPServerInfo | null {
    const server = this.mcpServers.get(serverId);
    return server !== undefined ? server : null;
  }

  /**
   * Clears all registered tools and servers
   */
  clear(): void {
    this.tools.clear();
    this.mcpServers.clear();
    this.executionStats = {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      totalExecutionTime: 0,
    };
  }

  /**
   * Updates the security configuration
   */
  updateSecurityConfig(securityConfig: SecurityConfig): void {
    this._security = new WorkspaceSecurity(securityConfig);
  }

  /**
   * Gets the current security configuration (for future use)
   */
  getSecurityConfig(): SecurityConfig {
    return this._security.getConfig();
  }

  /**
   * Builds a full namespaced tool name
   */
  private buildFullName(namespace: string, name: string): string {
    return `${namespace}:${name}`;
  }

  /**
   * Creates an executor function for MCP tools
   */
  private createMCPToolExecutor(serverId: string, toolName: string) {
    return async (args: Record<string, any>): Promise<any> => {
      // This is a placeholder - in Phase 2, this will call the actual MCP server
      throw new QCodeError('MCP tool execution not yet implemented', 'MCP_NOT_IMPLEMENTED', {
        serverId,
        toolName,
        args,
      });
    };
  }

  /**
   * Validates tool arguments against the tool's schema
   */
  private validateToolArguments(
    tool: NamespacedTool,
    args: Record<string, any>
  ): ValidationResult<Record<string, any>> {
    try {
      // Basic validation - check required parameters
      const schema = tool.definition.parameters;
      const required = schema.required || [];

      // Check for missing required parameters
      const missing = required.filter(param => !(param in args));
      if (missing.length > 0) {
        return {
          success: false,
          error: `Missing required parameters: ${missing.join(', ')}`,
          details: missing.map(param => `Missing required parameter: ${param}`),
        };
      }

      // Check for unknown parameters (if additionalProperties is false)
      if (schema.additionalProperties === false) {
        const allowed = Object.keys(schema.properties);
        const unknown = Object.keys(args).filter(param => !allowed.includes(param));
        if (unknown.length > 0) {
          return {
            success: false,
            error: `Unknown parameters: ${unknown.join(', ')}`,
            details: unknown.map(param => `Unknown parameter: ${param}`),
          };
        }
      }

      // For now, just return the args as-is
      // In a full implementation, we would validate types, formats, etc.
      return {
        success: true,
        data: args,
      };
    } catch (error) {
      return {
        success: false,
        error: `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: [error instanceof Error ? error.message : 'Unknown validation error'],
      };
    }
  }
}

/**
 * Creates a new tool registry instance
 */
export function createToolRegistry(securityConfig: SecurityConfig): ToolRegistry {
  return new ToolRegistry(securityConfig);
}

/**
 * Default tool registry instance (created when needed)
 */
let defaultRegistry: ToolRegistry | null = null;

/**
 * Gets or creates the default tool registry instance
 */
export function getDefaultRegistry(securityConfig?: SecurityConfig): ToolRegistry {
  if (!defaultRegistry) {
    if (!securityConfig) {
      throw new QCodeError(
        'Cannot create default registry without security config',
        'MISSING_SECURITY_CONFIG'
      );
    }
    defaultRegistry = new ToolRegistry(securityConfig);
  }
  return defaultRegistry;
}

/**
 * Resets the default registry (useful for testing)
 */
export function resetDefaultRegistry(): void {
  defaultRegistry = null;
}
