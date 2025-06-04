import { ToolRegistry, createToolRegistry } from '../../src/core/registry.js';
import { SecurityConfig, ToolDefinition, MCPServerInfo, ToolContext } from '../../src/types.js';
import { TEST_WORKSPACE } from '../setup.js';

describe('ToolRegistry', () => {
  let registry: ToolRegistry;
  let securityConfig: SecurityConfig;
  let testContext: ToolContext;

  beforeEach(() => {
    securityConfig = {
      workspace: {
        allowedPaths: ['/test'],
        forbiddenPatterns: ['*.secret'],
        allowOutsideWorkspace: false,
      },
      commands: {
        allowedCommands: ['echo', 'ls'],
        forbiddenPatterns: ['rm', 'del'],
        allowArbitraryCommands: false,
      },
    };
    registry = createToolRegistry(securityConfig, TEST_WORKSPACE);
    testContext = {
      workingDirectory: TEST_WORKSPACE,
      security: securityConfig,
      registry: null, // Will be set by actual usage
      query: 'test query',
      requestId: 'test-123',
    };
  });

  describe('Tool Registration', () => {
    it('should register a new tool in internal namespace by default', () => {
      const definition: ToolDefinition = {
        name: 'test_tool',
        description: 'A test tool',
        parameters: {
          type: 'object',
          properties: {
            input: { type: 'string' },
          },
          required: ['input'],
        },
      };

      const execute = jest.fn().mockResolvedValue('test result');
      const tool = registry.registerTool('test_tool', definition, execute);

      expect(tool.namespace).toBe('internal');
      expect(tool.name).toBe('test_tool');
      expect(tool.fullName).toBe('internal:test_tool');
      expect(tool.definition).toEqual(definition);
    });

    it('should register a tool with custom namespace', () => {
      const definition: ToolDefinition = {
        name: 'custom_tool',
        description: 'A custom tool',
        parameters: {
          type: 'object',
          properties: {},
        },
      };

      const execute = jest.fn();
      const tool = registry.registerTool('custom_tool', definition, execute, {
        namespace: 'custom',
      });

      expect(tool.namespace).toBe('custom');
      expect(tool.fullName).toBe('custom:custom_tool');
    });

    it('should register internal tool using convenience method', () => {
      const definition: ToolDefinition = {
        name: 'internal_tool',
        description: 'An internal tool',
        parameters: {
          type: 'object',
          properties: {},
        },
      };

      const execute = jest.fn();
      const tool = registry.registerInternalTool('internal_tool', definition, execute);

      expect(tool.namespace).toBe('internal');
      expect(tool.fullName).toBe('internal:internal_tool');
    });

    it('should prevent duplicate tool registration without override', () => {
      const definition: ToolDefinition = {
        name: 'duplicate',
        description: 'A duplicate tool',
        parameters: {
          type: 'object',
          properties: {},
        },
      };

      const execute = jest.fn();
      registry.registerTool('duplicate', definition, execute);

      expect(() => {
        registry.registerTool('duplicate', definition, execute);
      }).toThrow('Tool internal:duplicate already registered');
    });

    it('should allow duplicate tool registration with override', () => {
      const definition: ToolDefinition = {
        name: 'override',
        description: 'An override tool',
        parameters: {
          type: 'object',
          properties: {},
        },
      };

      const execute1 = jest.fn();
      const execute2 = jest.fn();

      registry.registerTool('override', definition, execute1);
      const tool = registry.registerTool('override', definition, execute2, {
        allowOverride: true,
      });

      expect(tool.execute).toBe(execute2);
    });
  });

  describe('MCP Server Registration', () => {
    it('should register MCP server and its tools', () => {
      const serverInfo: MCPServerInfo = {
        id: 'test-mcp',
        name: 'Test MCP Server',
        transport: 'stdio',
        config: {
          command: 'test-mcp',
          args: [],
        },
        status: 'connected',
        tools: [
          {
            name: 'mcp_tool',
            description: 'An MCP tool',
            parameters: {
              type: 'object',
              properties: {
                param: { type: 'string' },
              },
            },
          },
        ],
      };

      registry.registerMCPServer(serverInfo);

      const tool = registry.getTool('test-mcp:mcp_tool');
      expect(tool).toBeTruthy();
      expect(tool!.namespace).toBe('test-mcp');
      expect(tool!.name).toBe('mcp_tool');

      const servers = registry.getMCPServers();
      expect(servers).toHaveLength(1);
      expect(servers[0]?.id).toBe('test-mcp');
    });

    it('should unregister MCP server and remove its tools', () => {
      const serverInfo: MCPServerInfo = {
        id: 'remove-mcp',
        name: 'Remove MCP Server',
        transport: 'stdio',
        config: { command: 'remove-mcp' },
        status: 'connected',
        tools: [
          {
            name: 'remove_tool',
            description: 'A tool to remove',
            parameters: {
              type: 'object',
              properties: {},
            },
          },
        ],
      };

      registry.registerMCPServer(serverInfo);
      expect(registry.getTool('remove-mcp:remove_tool')).toBeTruthy();

      const removed = registry.unregisterMCPServer('remove-mcp');
      expect(removed).toBe(true);
      expect(registry.getTool('remove-mcp:remove_tool')).toBeNull();
      expect(registry.getMCPServer('remove-mcp')).toBeNull();
    });

    it('should handle invalid MCP server info', async () => {
      const invalidServerInfo = {
        // Missing required id and name
        transport: 'stdio',
        config: {},
        status: 'connected',
        tools: [],
      } as unknown as MCPServerInfo;

      await expect(async () => {
        await registry.registerMCPServer(invalidServerInfo);
      }).rejects.toThrow('MCP server must have id and name');
    });
  });

  describe('Tool Retrieval', () => {
    beforeEach(() => {
      // Register test tools
      const definition: ToolDefinition = {
        name: 'test',
        description: 'Test tool',
        parameters: {
          type: 'object',
          properties: {},
        },
      };

      registry.registerTool('test', definition, jest.fn(), { namespace: 'internal' });
      registry.registerTool('test', definition, jest.fn(), { namespace: 'external' });
      registry.registerTool('unique', definition, jest.fn(), { namespace: 'internal' });
    });

    it('should retrieve tool by full name', () => {
      const tool = registry.getTool('internal:test');
      expect(tool).toBeTruthy();
      expect(tool!.fullName).toBe('internal:test');
    });

    it('should retrieve tool from internal namespace when no namespace specified', () => {
      const tool = registry.getTool('unique');
      expect(tool).toBeTruthy();
      expect(tool!.namespace).toBe('internal');
    });

    it('should throw error for ambiguous tool name', () => {
      expect(() => {
        registry.getTool('test');
      }).toThrow('Ambiguous tool name "test". Available in namespaces: internal, external');
    });

    it('should return null for non-existent tool', () => {
      const tool = registry.getTool('nonexistent');
      expect(tool).toBeNull();
    });
  });

  describe('Tool Execution', () => {
    beforeEach(() => {
      const definition: ToolDefinition = {
        name: 'exec_test',
        description: 'Execution test tool',
        parameters: {
          type: 'object',
          properties: {
            input: { type: 'string' },
            optional: { type: 'number' },
          },
          required: ['input'],
        },
      };

      const execute = jest.fn().mockResolvedValue({ result: 'success' });
      registry.registerTool('exec_test', definition, execute);
    });

    it('should execute tool successfully with valid arguments', async () => {
      const result = await registry.executeTool('exec_test', { input: 'test' }, testContext);

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ result: 'success' });
      expect(result.tool).toBe('exec_test');
      expect(result.namespace).toBe('internal');
    });

    it('should fail execution with missing required arguments', async () => {
      const result = await registry.executeTool('exec_test', {}, testContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required parameters: input');
    });

    it('should fail execution for non-existent tool', async () => {
      const result = await registry.executeTool('nonexistent', {}, testContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Tool "nonexistent" not found');
    });

    it('should handle tool execution errors', async () => {
      const definition: ToolDefinition = {
        name: 'error_tool',
        description: 'Tool that throws errors',
        parameters: {
          type: 'object',
          properties: {},
        },
      };

      const execute = jest.fn().mockRejectedValue(new Error('Tool execution failed'));
      registry.registerTool('error_tool', definition, execute);

      const result = await registry.executeTool('error_tool', {}, testContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Tool execution failed: Tool execution failed');
    });

    it('should validate arguments against schema', async () => {
      const definition: ToolDefinition = {
        name: 'strict_tool',
        description: 'Tool with strict validation',
        parameters: {
          type: 'object',
          properties: {
            required_param: { type: 'string' },
          },
          required: ['required_param'],
          additionalProperties: false,
        },
      };

      registry.registerTool('strict_tool', definition, jest.fn());

      // Test unknown parameter rejection
      const result = await registry.executeTool(
        'strict_tool',
        { required_param: 'test', unknown_param: 'value' },
        testContext
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown parameters: unknown_param');
    });
  });

  describe('Tool Listing and Search', () => {
    beforeEach(() => {
      const definition: ToolDefinition = {
        name: 'list_test',
        description: 'List test tool',
        parameters: {
          type: 'object',
          properties: {},
        },
      };

      registry.registerTool('alpha', definition, jest.fn(), { namespace: 'ns1' });
      registry.registerTool('beta', definition, jest.fn(), { namespace: 'ns1' });
      registry.registerTool('gamma', definition, jest.fn(), { namespace: 'ns2' });
    });

    it('should list all tools', () => {
      const tools = registry.listTools();
      expect(tools).toHaveLength(3);
      expect(tools.map(t => t.fullName).sort()).toEqual(['ns1:alpha', 'ns1:beta', 'ns2:gamma']);
    });

    it('should list tools by namespace', () => {
      const tools = registry.listTools({ namespace: 'ns1' });
      expect(tools).toHaveLength(2);
      expect(tools.every(t => t.namespace === 'ns1')).toBe(true);
    });

    it('should list tools by name pattern', () => {
      const tools = registry.listTools({ namePattern: 'a' });
      expect(tools).toHaveLength(3); // alpha, beta, and gamma all contain 'a'
    });

    it('should list tool names', () => {
      const names = registry.listToolNames();
      expect(names).toEqual(['ns1:alpha', 'ns1:beta', 'ns2:gamma']);
    });

    it('should format tools for Ollama', () => {
      const ollamaTools = registry.getToolsForOllama('ns1');
      expect(ollamaTools).toHaveLength(2);
      expect(ollamaTools[0]).toEqual({
        type: 'function',
        function: {
          name: 'ns1:alpha',
          description: 'List test tool',
          parameters: {
            type: 'object',
            properties: {},
          },
        },
      });
    });
  });

  describe('Registry Statistics', () => {
    it('should provide accurate statistics', async () => {
      const definition: ToolDefinition = {
        name: 'stats_test',
        description: 'Stats test tool',
        parameters: {
          type: 'object',
          properties: {},
        },
      };

      registry.registerTool('tool1', definition, jest.fn().mockResolvedValue('ok'), {
        namespace: 'ns1',
      });
      registry.registerTool('tool2', definition, jest.fn().mockResolvedValue('ok'), {
        namespace: 'ns1',
      });
      registry.registerTool('tool3', definition, jest.fn().mockResolvedValue('ok'), {
        namespace: 'ns2',
      });

      // Execute some tools
      await registry.executeTool('ns1:tool1', {}, testContext);
      await registry.executeTool('ns1:tool2', {}, testContext);
      await registry.executeTool('nonexistent', {}, testContext); // This will fail

      const stats = registry.getStats();
      expect(stats.totalTools).toBe(3);
      expect(stats.toolsByNamespace).toEqual({ ns1: 2, ns2: 1 });
      expect(stats.executionStats.totalExecutions).toBe(3);
      expect(stats.executionStats.successfulExecutions).toBe(2);
      expect(stats.executionStats.failedExecutions).toBe(1);
    });
  });

  describe('Registry Management', () => {
    it('should clear all tools and servers', () => {
      const definition: ToolDefinition = {
        name: 'clear_test',
        description: 'Clear test tool',
        parameters: {
          type: 'object',
          properties: {},
        },
      };

      registry.registerTool('tool', definition, jest.fn());
      expect(registry.listTools()).toHaveLength(1);

      registry.clear();
      expect(registry.listTools()).toHaveLength(0);
      expect(registry.getMCPServers()).toHaveLength(0);
    });

    it('should update security configuration', () => {
      const newSecurityConfig: SecurityConfig = {
        workspace: {
          allowedPaths: ['/new'],
          forbiddenPatterns: ['*.new'],
          allowOutsideWorkspace: true,
        },
        commands: {
          allowedCommands: ['new'],
          forbiddenPatterns: ['old'],
          allowArbitraryCommands: true,
        },
      };

      expect(() => {
        registry.updateSecurityConfig(newSecurityConfig);
      }).not.toThrow();
    });
  });

  describe('MCP Tool Execution Placeholder', () => {
    it('should throw not implemented error for MCP tools', async () => {
      const serverInfo: MCPServerInfo = {
        id: 'mcp-test',
        name: 'MCP Test Server',
        transport: 'stdio',
        config: { command: 'test' },
        status: 'connected',
        tools: [
          {
            name: 'mcp_tool',
            description: 'MCP tool',
            parameters: {
              type: 'object',
              properties: {},
            },
          },
        ],
      };

      registry.registerMCPServer(serverInfo);

      const result = await registry.executeTool('mcp-test:mcp_tool', {}, testContext);
      expect(result.success).toBe(false);
      expect(result.error).toContain('MCP tool execution not yet implemented');
    });
  });
});
