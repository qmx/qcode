# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

QCode is a TypeScript-based AI coding assistant that provides a local alternative to Claude Coder by integrating with Ollama instead of remote APIs. It's designed to be a terminal-based coding assistant that works alongside existing editors, offering zero API costs and complete privacy control.

**Key Features:**

- Local LLM integration via Ollama (llama3.1:8b default, configurable)
- Direct internal tools for file operations and code analysis
- MCP (Model Context Protocol) client support for external tools
- JSON-based function calling for structured tool execution
- Intelligent workflow orchestration and context management
- Professional CLI experience with streaming responses

## Development Commands

```bash
# Core development workflow
npm run build         # Compile TypeScript to dist/
npm run dev          # Development mode with auto-rebuild
npm start            # Run the compiled CLI tool
npm run dev:cli      # Run CLI directly with ts-node

# Code quality
npm run lint         # ESLint with max 0 warnings
npm run lint:fix     # Auto-fix linting issues
npm run format       # Format code with Prettier
npm run format:check # Check formatting
npm run tc           # TypeScript type checking
npm run validate     # Run all checks (typecheck + format + lint)

# Testing
npm test             # Run Jest tests
npm run test:watch   # Watch mode for tests
npm run test:coverage # Generate coverage report

# Cleanup
npm run clean        # Remove dist/ directory
```

## Architecture Overview

### Core Components

**Main Engine (`src/core/engine.ts`):**

- Central orchestrator for query processing and tool execution
- Handles LLM function calling with multi-step workflows
- Manages conversation context and streaming responses
- Supports both simple intent-based and complex workflow-driven processing

**Tool Registry (`src/core/registry.ts`):**

- Namespaced tool management (internal tools + MCP servers)
- Security validation and tool execution coordination
- Support for both direct TypeScript tools and external MCP tools

**Workflow Orchestrator (`src/core/workflow-orchestrator.ts`):**

- Intelligent pattern detection for complex queries
- LLM-enhanced workflow planning and execution
- Built-in patterns for project analysis, API discovery, and quality assessment

**Context Manager (`src/core/context-manager.ts`):**

- Intelligent conversation memory management
- Structured tool result formatting for optimal LLM context
- Smart context compression and size management

### Security Model

**Workspace-Confined Operations:**

- All file operations restricted to current working directory
- Path traversal prevention with normalized path validation
- Configurable forbidden patterns (secrets, system files)
- Command execution whitelist with argument sanitization

**Configuration Security:**

- Hierarchical config loading (defaults → global → project → env → CLI)
- Zod-based validation for all configuration
- Secure defaults with explicit security boundaries

### Tool Architecture

**Internal Tools (`src/tools/`):**

- Fast, native TypeScript implementations
- Direct file system operations with security validation
- Consistent Zod-based parameter validation
- Structured results for optimal context management

**MCP Integration (`src/mcp/`):**

- MCP client for external tool discovery and execution
- Support for stdio and HTTP transports
- Automatic tool registration with namespace collision resolution
- Robust error handling and connection management

## Code Conventions

### TypeScript Patterns

- Strict typing with comprehensive interfaces in `src/types.ts`
- Zod schemas for runtime validation and JSON Schema generation
- Error handling via custom `QCodeError` class with categorized error codes
- Async/await throughout with proper error propagation

### Tool Development

- All tools implement consistent `NamespacedTool` interface
- Use Zod for parameter validation and `zodToJsonSchema` for LLM integration
- Return structured results via `ToolResult` interface
- Include proper error handling and duration tracking

### Testing Strategy

- Jest with TypeScript support
- VCR-style testing using nock for HTTP mocking
- Comprehensive security testing for all validation functions
- E2E tests covering complete workflow scenarios
- Test fixtures in `tests/fixtures/` with realistic project structures

### Logging

- Winston-based structured logging
- Debug mode support throughout the application
- Context-aware log messages with execution IDs
- Configurable log levels and output formats

## Key Architectural Decisions

**Hybrid Tool Architecture:**

- Internal tools for performance-critical operations (file I/O, basic analysis)
- MCP integration for extensibility and external tool ecosystem
- Namespaced tool names prevent conflicts (`internal.files`, `mcp-server.tool`)

**Context-Aware Processing:**

- Structured tool results separate display content from LLM context
- Intelligent context compression maintains conversation flow
- Cross-step context propagation enables complex workflows

**LLM-Enhanced Pattern Detection:**

- Rule-based pattern matching as baseline
- LLM analysis for enhanced pattern confidence and parameter extraction
- Fallback to rule-based when LLM unavailable

**Security-First Design:**

- All operations workspace-confined by default
- Comprehensive input validation and sanitization
- Explicit security boundaries with configurable restrictions

## Testing Notes

- Use `npm test` to run the full test suite
- Test files are organized by feature area in `tests/`
- VCR recordings in `tests/fixtures/recordings/` capture real LLM interactions
- Security tests validate all path traversal and command injection protections
- E2E tests cover realistic user workflows from CLI to tool execution

## Configuration

Default model is `llama3.1:8b` via Ollama at `http://localhost:11434`. Model can be overridden with `--model` CLI flag or configuration. Configuration hierarchy supports:

- Built-in defaults in `src/config/defaults.ts`
- Global config: `~/.qcode/config.json`
- Project config: `.qcode/config.json`
- Environment variables
- CLI arguments (highest priority)

## Development Guidelines (From Cursor Rules)

### Core Development Philosophy

- **End-to-End First**: Build small, complete slices that work end-to-end rather than isolated components
- **Working Functionality Over Complete Features**: Each increment should provide immediate user value
- **Test-Driven Development**: Write tests first or alongside implementation using VCR pattern
- **Security-First**: Always validate paths and inputs through security framework

### Task Implementation Workflow

- Follow structured task list in `tasklist.md` with specific deliverables
- `tasklist.md` is the single source of truth for implementation progress and planning
- Implement incrementally: read task → implement → test → validate → update task list
- **CRITICAL**: Run validation before marking any task complete:
  ```bash
  npm run tc          # TypeScript compilation (zero errors required)
  npm run format:check # Code formatting (zero issues required)
  npm run lint        # ESLint validation (zero warnings required)
  npm run validate    # All checks at once
  ```

### Code Standards

- Use underscore prefix for intentionally unused parameters (`_param`)
- Prefer `const` over `let`, never use `var`
- Add `// eslint-disable-next-line no-console` for intentional console usage
- All core types defined in `src/types.ts`
- Use Zod schemas for all tool inputs and validation
- Security validation pattern: always use `WorkspaceSecurity` before file operations

### Testing Rules

- **NEVER** add artificial delays (`setTimeout`, `sleep`) in tests
- Use VCR pattern for LLM integration tests (record real interactions, replay deterministically)
- Test behavior, not implementation details
- Security tests are critical - validate all path traversal and injection protections
- Use `toBeGreaterThanOrEqual(0)` for timing assertions that might be 0

### VCR Testing Pattern

```typescript
// Modern VCR pattern - clean and simple
const vcr = setupVCRTests(__filename);

it('should handle user workflow', async () => {
  await vcr.withRecording('descriptive_test_name', async () => {
    const response = await engine.processQuery('user query');
    expect(response.complete).toBe(true);
    vcr.recordingLog('✓ Response:', response.response);
  });
});
```

### VCR Recording Rules

**CRITICAL: When you encounter "Nock: No match for request" errors:**

1. **Always regenerate the VCR recording immediately** - this means the HTTP request changed or the recording is missing
2. **Use NOCK_MODE=record to capture the missing request:**
   ```bash
   NOCK_MODE=record npm test -- --testPathPattern=failing-test.ts --testNamePattern="specific test name"
   ```
3. **Verify the recording contains both `/api/chat` AND `/api/generate` requests** if the test uses ProjectIntelligenceTool
4. **Check that retry counts match between test config and recordings** - tests should use `retries: 0` to match VCR playback
5. **Never ignore or work around missing VCR recordings** - always fix by recording the actual HTTP interactions

**Root Causes of "Nock: No match" errors:**

- Missing VCR recording file
- HTTP request body/headers changed since recording
- Configuration mismatch (retries, model, URL)
- Tool making additional `/api/generate` calls not captured in original recording

### Tool Development Template

```typescript
export class ExampleTool {
  readonly name = 'example-tool';
  readonly description = 'Tool description';
  readonly schema = z.object({
    // Define required/optional parameters
  });

  async execute(args: z.infer<typeof this.schema>): Promise<ToolResult> {
    // 1. Security validation
    // 2. Core logic
    // 3. Error handling
    // 4. Return structured result
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

### Commit Workflow

- **CRITICAL**: Never commit without explicit user permission
- Wait for user to say "commit" or "commit the changes"
- Make atomic commits (one logical change per commit)
- Always run `npm run validate` before any commit
- Use descriptive commit messages starting with verbs (Add, Remove, Fix, Update)

## Development Environment

- Node.js ≥18.0.0 required
- TypeScript 5.3+ with strict mode enabled
- ESLint + Prettier for code quality
- Jest for testing with ts-jest transform
- Module resolution supports both `.ts` and `.js` extensions for flexibility

## Memories

- Stop trying to estimate effort in days, weeks, whatever, I don't care - also we have a numbering system for tasks and a natural sequence, stop using "phases", they are useless