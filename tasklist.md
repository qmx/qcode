# QCode Implementation Task List

## 📋 Overview

This task list implements the QCode TypeScript-based AI coding assistant as outlined in the implementation plan. The project is organized into 4 weekly phases with clear deliverables.

**Target**: Enterprise-grade QCode with zero API costs, full privacy control, and Claude Coder-level user experience.

---

## 🏗️ Phase 1: Core Foundation + Security (Week 1)

**Goal**: Build secure foundation with Ollama + namespaced internal tools  
**Deliverable**: `qcode "list files"` works with proper security

### 1.1 Project Setup & Dependencies

- [x] Initialize TypeScript project with proper tsconfig.json
- [x] Set up package.json with required dependencies:
  - [x] @types/node, typescript, commander, chalk
  - [x] fast-glob, zod, node-diff3, zod-to-json-schema
  - [x] normalize-path, is-path-inside
  - [x] @modelcontextprotocol/sdk
- [x] Configure build scripts and development environment
- [x] Set up ESLint and Prettier for code quality
- [x] Create initial directory structure as per architecture

### 1.2 Core Type Definitions

- [x] Create `src/types.ts` with core interfaces:
  - [x] `NamespacedTool` interface
  - [x] `MCPServerInfo` interface
  - [x] `ValidationResult<T>` interface
  - [x] `ToolDefinition` interface
  - [x] `QCodeError` class
  - [x] `Config` and related configuration types

### 1.3 Security Framework

- [x] Implement `src/security/workspace.ts`:
  - [x] `WorkspaceSecurity` class with path validation
  - [x] Workspace boundary enforcement with `isPathInside`
  - [x] Path traversal prevention
  - [x] Forbidden pattern checking
  - [x] Normalized path handling
- [x] Implement `src/security/paths.ts`:
  - [x] Path validation utilities
  - [x] Safe path resolution functions
  - [x] **IMPROVED**: Now uses `micromatch` for proper glob pattern matching
  - [x] **IMPROVED**: Now uses `sanitize-filename` for safe filename sanitization
- [x] Implement `src/security/commands.ts`:
  - [x] Command injection prevention
  - [x] Allowed command whitelist
  - [x] Argument sanitization
  - [x] **IMPROVED**: Now uses `shell-escape` for proper argument escaping
  - [x] **CHANGED**: Now uses native Node.js `spawn` instead of `execa` for simpler, more secure execution
  - [x] **NEW**: Added comprehensive `CommandResult` interface with execution metrics
  - [x] **NEW**: Added `CommandOptions` interface for flexible execution configuration
  - [x] **NEW**: Added pattern-based forbidden command detection

### 1.4 Configuration System

- [x] Implement `src/config/defaults.ts`:
  - [x] Default configuration object
  - [x] Security default settings
  - [x] Ollama default settings
- [x] Implement `src/config/validation.ts`:
  - [x] Zod schemas for configuration validation
  - [x] Configuration parsing and validation
  - [x] **FIXED**: TypeScript compatibility with `exactOptionalPropertyTypes`
- [x] Implement `src/config/manager.ts`:
  - [x] Hierarchical config loading (defaults → global → project → env → CLI)
  - [x] Configuration merging and validation
  - [x] Config file discovery and parsing

### 1.5 Ollama Client

- [x] Implement `src/core/client.ts`:
  - [x] HTTP client for Ollama API using official Ollama library
  - [x] Function calling support with JSON formatting
  - [x] Streaming response handling
  - [x] Error handling and retries with exponential backoff
  - [x] Connection validation
  - [x] Model availability checking
  - [x] Chat API integration
  - [x] Generate API integration
  - [x] Configuration management and updates

### 1.6 Tool Registry System

- [x] Implement `src/core/registry.ts`:
  - [x] `ToolRegistry` class with namespacing
  - [x] Internal tool registration with "internal" namespace
  - [x] MCP server registration and tool discovery
  - [x] Tool execution with security validation
  - [x] Namespaced tool name resolution
  - [x] Tool definition formatting for Ollama

### 1.7 Internal File Operations Tool

#### 1.7.1 Basic FilesTool Class Structure

- [x] Create `src/tools/files.ts` foundation:
  - [x] Basic `FilesTool` class structure
  - [x] Zod schema definitions for all operations
  - [x] Tool interface and registration structure
  - [x] Security integration setup with `WorkspaceSecurity`
  - [x] Basic error handling framework

#### 1.7.2 Read File Operation

- [x] Implement read file functionality:

  - [x] Basic file reading with UTF-8 encoding
  - [x] Line range support (e.g., lines 10-50 of large file)
  - [x] Handle special characters and encoding issues
  - [x] Error handling for non-existent files
  - [x] Binary file detection and graceful handling
  - [x] Large file reading with memory management

- [x] **Read File Operation Tests**:
  - [x] Single file read (small text file)
  - [x] Large file read (>1MB) with chunking
  - [x] Line-range reading (lines 10-50 of large file)
  - [x] Binary file handling (should fail gracefully)
  - [x] Non-existent file error handling
  - [x] UTF-8 encoding with special characters
  - [x] Security validation (path traversal attempts)

#### 1.7.3 Write File Operation

- [ ] Implement write file functionality:

  - [ ] File writing with security validation
  - [ ] Atomic write operations to prevent corruption
  - [ ] Directory creation when needed
  - [ ] Backup functionality for existing files
  - [ ] Handle write permissions and read-only scenarios
  - [ ] File overwrite protection and confirmation

- [ ] **Write File Operation Tests**:
  - [ ] Create new file in existing directory
  - [ ] Overwrite existing file with backup
  - [ ] Write to read-only directory (should fail)
  - [ ] Atomic write operations
  - [ ] Directory creation during write
  - [ ] Large file write operations
  - [ ] Security validation (workspace boundary enforcement)
  - [ ] Concurrent write conflict handling

#### 1.7.4 List Files Operation

- [ ] Implement file listing functionality:

  - [ ] Basic directory listing
  - [ ] Glob pattern support (`**/*.ts`, `src/**/*.{js,ts}`)
  - [ ] Hidden file handling (`.env`, `.git/`)
  - [ ] Recursive directory traversal
  - [ ] File metadata inclusion (size, dates, permissions)

- [ ] **List Files Operation Tests**:
  - [ ] Simple directory listing
  - [ ] Glob pattern matching (`**/*.ts`, `src/**/*.{js,ts}`)
  - [ ] Hidden file handling (`.env`, `.git/`)
  - [ ] Nested directory recursion
  - [ ] File metadata accuracy
  - [ ] Security validation (workspace boundary enforcement)
  - [ ] Error handling for inaccessible directories

#### 1.7.5 Search Files Operation

- [ ] Implement file search functionality:

  - [ ] Simple text search across files
  - [ ] Regex pattern search with capture groups
  - [ ] Case-sensitive vs insensitive search options
  - [ ] Binary file exclusion during search
  - [ ] Search result ranking and context

- [ ] **Search Files Operation Tests**:
  - [ ] Simple text search across files
  - [ ] Regex pattern search with groups
  - [ ] Case-sensitive vs insensitive search
  - [ ] Binary file exclusion during search
  - [ ] Large codebase search performance
  - [ ] Search result accuracy and ranking
  - [ ] Security validation (workspace boundary enforcement)
  - [ ] Memory usage during large searches

#### 1.7.6 Error Handling & Integration

- [ ] Complete FilesTool integration:

  - [ ] Comprehensive error handling for all operations
  - [ ] Integration with `WorkspaceSecurity` validation
  - [ ] Tool registry integration and registration
  - [ ] Tool definition formatting for Ollama function calling
  - [ ] Result formatting and standardization
  - [ ] Performance monitoring and optimization

- [ ] **Test Fixtures for File Operations**:

  - [ ] Create `tests/fixtures/projects/ts-monorepo/`:
    - [ ] Multiple packages with tsconfig.json
    - [ ] Mix of small and large TypeScript files
    - [ ] Nested directory structure
  - [ ] Create `tests/fixtures/projects/react-app/`:
    - [ ] Standard CRA structure with components
    - [ ] JSX files with complex imports
    - [ ] Public assets and package.json
  - [ ] Create `tests/fixtures/projects/mixed-legacy/`:
    - [ ] JavaScript, Python, and config files
    - [ ] Inconsistent structure for edge case testing

- [ ] **File Operations Integration Tests**:
  - [ ] **Multi-Operation Workflows**:
    - [ ] List → Read → Write workflow
    - [ ] Search → Read → Edit workflow
    - [ ] Complex glob patterns across operations
  - [ ] **Cross-Operation Error Handling**:
    - [ ] Tool registry integration error handling
    - [ ] Security validation across all operations
    - [ ] Performance degradation under load
  - [ ] **End-to-End FilesTool Testing**:
    - [ ] Complete tool definition formatting for Ollama
    - [ ] Result formatting consistency across operations
    - [ ] Memory management during complex workflows

### 1.8 Core Engine - End-to-End Function Calling

**GOAL**: Implement ONE complete function calling workflow that works end-to-end

- [x] **1.8.1 Basic Query Processing Engine (FOUNDATION - COMPLETED)**

  - [x] Create initial `src/core/engine.ts` structure
  - [x] Core interfaces and basic query validation
  - [x] Simple intent detection and configuration management

- [ ] **1.8.2 Single File Operation Function Calling (END-TO-END MVP - STARTED)**

  - [ ] **LLM Function Calling for Files Tool**:
    - [ ] Implement LLM-based function calling in engine
    - [ ] Format `internal.files` tool for Ollama function calling API
    - [ ] Parse LLM function call responses and execute tools
    - [ ] Handle "read file" query end-to-end with real LLM
  - [ ] **VCR Tests for Complete Workflow**:
    - [ ] `file_read_query.json`: User asks "show me package.json", LLM calls `internal.files.read`
    - [ ] `file_read_partial.json`: User asks "show me the first 20 lines of src/main.ts", LLM calls with line range
    - [ ] `file_operation_error.json`: LLM function call with invalid parameters, error handling
  - [ ] **Integration Requirements**:
    - [ ] Must work with existing `FilesTool.read` operation from 1.7.2
    - [ ] Must implement proper error handling and recovery
    - [ ] Must format tool results into readable responses

- [ ] **1.8.3 Add List Operation (EXTEND E2E WORKFLOW)**

  - [ ] **Implement List Operation in FilesTool**:
    - [ ] Complete the `listFiles` method in `src/tools/files.ts`
    - [ ] Support glob patterns, recursive listing, hidden files
    - [ ] Security validation and workspace boundary enforcement
    - [ ] Comprehensive error handling and metadata support
  - [ ] **Extend LLM Function Calling**:
    - [ ] LLM can now call both `read` and `list` operations
    - [ ] Handle "list files in src/" queries end-to-end
    - [ ] Support complex queries: "list TypeScript files and show me the main one"
  - [ ] **VCR Tests for List Workflow**:
    - [ ] `file_list_query.json`: User asks "list files in src/", LLM calls `internal.files.list`
    - [ ] `file_list_pattern.json`: User asks "show me all TypeScript files", LLM uses pattern matching
    - [ ] `file_list_then_read.json`: Multi-step workflow - list files, then read specific one
  - [ ] **Integration Requirements**:
    - [ ] Must work with existing read function calling from 1.8.2
    - [ ] Must handle both single operations and multi-step workflows
    - [ ] Must format list results in user-friendly way

- [ ] **1.8.4 CLI Integration (REAL USER EXPERIENCE)**

  - [ ] **Replace CLI Simulation** (from 1.9):
    - [ ] Remove `simulateQueryProcessing()`
    - [ ] Integrate real `QCodeEngine` with function calling
    - [ ] Display tool execution progress and results
  - [ ] **End-to-End CLI Testing**:
    - [ ] `qcode "show me package.json"` works completely
    - [ ] `qcode "list files in src/"` works completely
    - [ ] `qcode "show me all TypeScript files and read the main one"` works
    - [ ] Error handling and user-friendly messages

- [ ] **1.8.5 Advanced Workflows (MULTI-STEP ORCHESTRATION)**
  - [ ] **Sequential Tool Execution**:
    - [ ] Multi-step workflows: analyze → read → summarize
    - [ ] Context passing between tool executions
    - [ ] Workflow state management and error recovery
  - [ ] **Complex Query Examples**:
    - [ ] "Analyze the project structure and find potential issues"
    - [ ] "Find all React components and check their props usage"
    - [ ] "Review recent changes and suggest improvements"

**Phase 1.8 Acceptance Criteria**:

- [ ] **After 1.8.2**: `qcode "show me package.json"` works end-to-end with real LLM function calling
- [ ] **After 1.8.3**: `qcode "list files in src/"` and combined workflows work end-to-end
- [ ] **After 1.8.4**: CLI provides complete user experience with progress and formatting
- [ ] **After 1.8.5**: Complex multi-step workflows work reliably

### 1.9 Basic CLI Interface (Real Implementation)

- [x] **Hollow CLI Implementation** (Phase 1 Foundation):

  - [x] Command-line argument parsing with Commander
  - [x] Configuration loading and validation
  - [x] Output formatting with Chalk
  - [x] Error handling framework
  - [x] Spinner and progress indicators
  - [x] Version and help commands

- [ ] **Real Engine Integration** (Remove Simulation):

  - [ ] Replace `simulateQueryProcessing()` with real engine calls
  - [ ] Integrate `QCodeEngine` class from section 1.8
  - [ ] Implement tool registry initialization in CLI
  - [ ] Connect file operations tool to CLI workflow
  - [ ] Add proper streaming response handling
  - [ ] Implement real-time tool execution feedback

- [ ] **Enhanced CLI Functionality**:

  - [ ] **Tool Registration and Discovery**:
    - [ ] Initialize internal tools (files) on startup
    - [ ] Display available tools in help/debug mode
    - [ ] Handle tool registration errors gracefully
  - [ ] **Query Processing Pipeline**:
    - [ ] Parse user queries for intent detection
    - [ ] Route queries to appropriate engine methods
    - [ ] Handle multi-step tool execution workflows
    - [ ] Display tool execution progress in real-time
  - [ ] **Response Formatting**:
    - [ ] Format LLM responses with proper syntax highlighting
    - [ ] Display tool results in structured format
    - [ ] Show file paths with proper workspace-relative formatting
    - [ ] Handle large outputs with pagination/truncation
  - [ ] **Error Recovery and User Guidance**:
    - [ ] Detect common user intent errors
    - [ ] Suggest corrections for malformed queries
    - [ ] Provide contextual help based on current workspace
    - [ ] Handle tool failures with actionable suggestions

- [ ] **CLI Integration Tests** (Post-Engine):

  - [ ] End-to-end query processing with file operations
  - [ ] Tool execution error handling and recovery
  - [ ] Configuration loading with various CLI options
  - [ ] Output formatting verification
  - [ ] Performance testing with large project fixtures
  - [ ] Memory usage monitoring during complex queries

- [ ] **CLI UX Enhancements**:
  - [ ] **Progress Indicators**:
    - [ ] Tool-specific progress messages ("🔧 Using internal.files...")
    - [ ] Step-by-step workflow progress for complex queries
    - [ ] Time estimates for long-running operations
  - [ ] **Smart Defaults**:
    - [ ] Auto-detect project type and suggest relevant queries
    - [ ] Remember frequently used commands
    - [ ] Workspace-aware help suggestions
  - [ ] **Debug and Verbose Modes**:
    - [ ] Show detailed tool execution logs
    - [ ] Display LLM request/response in debug mode
    - [ ] Tool execution timing and performance metrics

### 1.10 Testing Setup

- [x] Set up Jest testing framework
- [x] Create test directory structure
- [x] Implement basic security tests
- [x] Create sample test workspace
- [x] Basic tool execution tests
- [x] **NEW**: VCR-style testing system implemented with `nock`
- [x] **NEW**: Real Ollama API response recording and playback
- [x] **NEW**: JSON fixtures for deterministic test behavior
- [x] **NEW**: Integration tests with comprehensive API coverage

- [ ] **Enhanced Test Infrastructure**:
  - [ ] `tests/helpers/project-builder.ts` - Dynamic test project creation
  - [ ] `tests/helpers/vcr-manager.ts` - VCR recording/playback management
  - [ ] `tests/helpers/assertion-helpers.ts` - Custom Jest matchers
  - [ ] `scripts/record-vcr.ts` - Script for capturing new LLM interactions

**Phase 1 Acceptance Criteria**:

- [x] **After 1.7.2 (Read File Operation - COMPLETED)**:

  - [x] Read file operation works in isolation (unit tests pass)
  - [x] Security validation prevents path traversal and unauthorized access
  - [x] Read file operation respects workspace boundaries
  - [x] Test fixtures provide comprehensive coverage for read operations
  - [x] Binary file detection and encoding support implemented
  - [x] Line range reading and large file management working
  - [x] Comprehensive error handling for read operations

- [ ] **After 1.7 (Complete File Operations Tool)**:

  - [x] ✅ Read file operations work (completed in 1.7.2)
  - [ ] Write, list, and search file operations implemented
  - [ ] Security validation prevents path traversal and unauthorized access
  - [ ] All file operations respect workspace boundaries
  - [ ] Test fixtures provide comprehensive coverage

- [ ] **After 1.8 (Core Engine)**:

  - [ ] Engine can process queries and orchestrate tool execution
  - [ ] LLM integration works with function calling
  - [ ] VCR tests demonstrate reliable tool calling behavior
  - [ ] Error handling provides graceful recovery

- [ ] **After 1.9 (Real CLI Implementation)**:
  - [ ] `qcode "list files in src/"` works securely end-to-end
  - [ ] CLI integrates engine and displays formatted results
  - [ ] Configuration loads from multiple sources correctly
  - [ ] User experience includes progress indicators and helpful errors
  - [ ] All Phase 1 components work together seamlessly

---

## 🔗 Phase 2: MCP Integration (Week 2)

**Goal**: Connect to external MCP tools via stdin/stdout and HTTP  
**Deliverable**: External MCP tools work with namespaced execution

### 2.1 MCP Core Infrastructure

- [ ] Implement `src/mcp/client.ts`:
  - [ ] Base MCP client interface
  - [ ] Common MCP protocol handling
  - [ ] Error handling and reconnection logic
  - [ ] Tool discovery and registration

### 2.2 MCP Stdio Transport

- [ ] Implement `src/mcp/stdio.ts`:
  - [ ] `MCPStdioClient` class
  - [ ] Process spawning and management
  - [ ] stdin/stdout communication protocol
  - [ ] Message parsing and formatting
  - [ ] Process lifecycle management
  - [ ] Error handling for process failures

### 2.3 MCP HTTP Transport

- [ ] Implement `src/mcp/http.ts`:
  - [ ] `MCPHttpClient` class
  - [ ] HTTP streaming protocol implementation
  - [ ] Connection management and pooling
  - [ ] Request/response handling
  - [ ] Timeout and retry logic

### 2.4 MCP Discovery System

- [ ] Implement `src/mcp/discovery.ts`:
  - [ ] Automatic MCP server discovery
  - [ ] Tool enumeration and registration
  - [ ] Server capability detection
  - [ ] Dynamic tool loading

### 2.5 Enhanced Tool Registry

- [ ] Extend `src/core/registry.ts`:
  - [ ] MCP server registration integration
  - [ ] Tool namespace conflict resolution
  - [ ] Dynamic tool loading/unloading
  - [ ] Server health monitoring
  - [ ] Graceful server failure handling

### 2.6 Configuration for MCP

- [ ] Extend configuration system:
  - [ ] MCP server configuration schema
  - [ ] Server connection parameters
  - [ ] Auto-discovery settings
  - [ ] Server-specific security policies

### 2.7 Enhanced CLI for MCP

- [ ] Add MCP-specific CLI commands:
  - [ ] Server status display
  - [ ] Tool listing by namespace
  - [ ] Server connection testing
  - [ ] Debug mode for MCP communication

### 2.8 MCP Testing

- [ ] Create MCP test infrastructure:

  - [ ] Mock MCP servers for testing
  - [ ] Integration tests with real MCP servers
  - [ ] Connection failure recovery tests
  - [ ] Tool execution tests across transports

- [ ] **MCP Integration Test Scenarios**:
  - [ ] **Stdio Transport Tests**:
    - [ ] Process spawning and lifecycle management
    - [ ] stdin/stdout communication protocol
    - [ ] Error handling for process failures
  - [ ] **HTTP Transport Tests**:
    - [ ] Connection management and pooling
    - [ ] Request/response handling
    - [ ] Timeout and retry logic
  - [ ] **Tool Discovery Tests**:
    - [ ] Automatic MCP server discovery
    - [ ] Tool enumeration and registration
    - [ ] Server capability detection
  - [ ] **Namespace Conflict Resolution**:
    - [ ] Tools with same name from different servers
    - [ ] Graceful server failure handling
    - [ ] Dynamic tool loading/unloading

**Phase 2 Acceptance Criteria**:

- [ ] Can connect to MCP servers via stdio and HTTP
- [ ] External tools execute with proper namespacing
- [ ] Graceful handling of MCP server failures
- [ ] Tools from different servers work together
- [ ] Clear feedback on MCP server status

---

## 🛠️ Phase 3: Enhanced Tools + Context (Week 3)

**Goal**: Advanced internal tools and project understanding  
**Deliverable**: Can edit files intelligently and understand project structure

### 3.1 Advanced File Editing Tool

- [ ] Implement `src/tools/edit.ts`:
  - [ ] `
