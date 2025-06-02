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

- [ ] Implement `src/tools/files.ts`:
  - [ ] `FilesTool` class with Zod schema validation
  - [ ] Read file operation (with line range support)
  - [ ] Write file operation
  - [ ] List files operation with glob patterns
  - [ ] Search files operation with regex
  - [ ] Integration with security validation
  - [ ] Error handling for file operations

### 1.8 Basic CLI Interface

- [ ] Implement `src/cli.ts`:
  - [ ] Command-line argument parsing with Commander
  - [ ] One-shot command execution
  - [ ] Basic query processing
  - [ ] Output formatting with Chalk
  - [ ] Error handling and user feedback

### 1.9 Core Engine

- [ ] Implement `src/core/engine.ts`:
  - [ ] Main query processing engine
  - [ ] Tool orchestration and execution
  - [ ] Response formatting and streaming
  - [ ] Error handling and recovery

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

**Phase 1 Acceptance Criteria**:

- [ ] `qcode "list files in src/"` works securely
- [ ] All file operations respect workspace boundaries
- [ ] Configuration loads from multiple sources
- [ ] Security prevents path traversal and command injection
- [ ] Basic error handling provides useful feedback

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
  - [ ] `EditTool` class with diff support
  - [ ] Line-based editing operations
  - [ ] Multi-file editing capabilities
  - [ ] Diff generation and preview
  - [ ] Backup and rollback functionality
  - [ ] Conflict detection and resolution

### 3.2 Shell Execution Tool

- [ ] Implement `src/tools/shell.ts`:
  - [ ] `ShellTool` class with security restrictions
  - [ ] Command whitelist enforcement
  - [ ] Argument sanitization
  - [ ] Output capture and streaming
  - [ ] Working directory management
  - [ ] Timeout and process control

### 3.3 Git Integration Tool

- [ ] Implement `src/tools/git.ts`:
  - [ ] `GitTool` class for repository operations
  - [ ] Status, diff, and log operations
  - [ ] Commit creation and management
  - [ ] Branch operations
  - [ ] Remote repository interaction
  - [ ] Security validation for git operations

### 3.4 Advanced Search Tool

- [ ] Implement `src/tools/search.ts`:
  - [ ] `SearchTool` class with multiple search types
  - [ ] Code search with syntax awareness
  - [ ] Regex and fuzzy search capabilities
  - [ ] File content indexing
  - [ ] Search result ranking and filtering
  - [ ] Performance optimization for large codebases

### 3.5 Project Context System

- [ ] Implement `src/core/context.ts`:
  - [ ] `ProjectContext` class for project understanding
  - [ ] Codebase structure analysis
  - [ ] Dependency detection and mapping
  - [ ] File relationship analysis
  - [ ] Project metadata extraction
  - [ ] Context memory management

### 3.6 Project Analysis Tool

- [ ] Implement `src/tools/project.ts`:
  - [ ] `ProjectTool` class for structure analysis
  - [ ] Package.json and dependency analysis
  - [ ] Framework and library detection
  - [ ] Code quality metrics
  - [ ] Architecture pattern recognition
  - [ ] Documentation generation

### 3.7 Enhanced Engine

- [ ] Extend `src/core/engine.ts`:
  - [ ] Context-aware query processing
  - [ ] Multi-step task planning
  - [ ] Tool chaining and workflow orchestration
  - [ ] Progress tracking for complex operations
  - [ ] Smart tool selection based on context

### 3.8 Diff and Merge Utilities

- [ ] Create diff utilities:
  - [ ] Three-way merge support
  - [ ] Conflict resolution strategies
  - [ ] Visual diff formatting
  - [ ] Patch generation and application

### 3.9 Enhanced Testing

- [ ] Add comprehensive tool tests:
  - [ ] Edit tool tests with real file scenarios
  - [ ] Git integration tests
  - [ ] Search performance tests
  - [ ] Context building tests
  - [ ] Multi-tool workflow tests

**Phase 3 Acceptance Criteria**:

- [ ] Can intelligently edit files with diff preview
- [ ] Understands project structure and dependencies
- [ ] Git operations work securely and correctly
- [ ] Search finds relevant code across large projects
- [ ] Context system improves query relevance

---

## 🎨 Phase 4: Professional Experience (Week 4)

**Goal**: Production-ready CLI with interactive mode and polish  
**Deliverable**: Enterprise-grade QCode ready for daily use

### 4.1 Interactive Chat Mode

- [ ] Implement interactive CLI interface:
  - [ ] Readline-based chat interface
  - [ ] Command history and autocomplete
  - [ ] Multi-line input support
  - [ ] Session persistence
  - [ ] Context preservation across queries

### 4.2 Slash Command System

- [ ] Implement Claude Coder-compatible slash commands:
  - [ ] `/init` - Project initialization
  - [ ] `/config` - Configuration management
  - [ ] `/mcp` - MCP server status
  - [ ] `/commit` - Git commit creation
  - [ ] `/pr` - Pull request creation
  - [ ] `/help` - Command documentation

### 4.3 Streaming UX Enhancement

- [ ] Implement professional streaming interface:
  - [ ] Real-time progress indicators
  - [ ] Tool execution feedback
  - [ ] Animated loading states
  - [ ] Success/error status display
  - [ ] Token-by-token streaming for responses

### 4.4 Enhanced Error Handling

- [ ] Implement comprehensive error system:
  - [ ] Contextual error messages
  - [ ] Recovery suggestions
  - [ ] Error categorization and codes
  - [ ] Graceful degradation strategies
  - [ ] Error reporting and logging

### 4.5 Configuration UI

- [ ] Create configuration management interface:
  - [ ] Interactive config setup
  - [ ] Configuration validation and testing
  - [ ] Model availability checking
  - [ ] MCP server configuration wizard
  - [ ] Security settings management

### 4.6 Help and Documentation System

- [ ] Implement comprehensive help system:
  - [ ] Built-in command documentation
  - [ ] Example query suggestions
  - [ ] Tool capability descriptions
  - [ ] Troubleshooting guides
  - [ ] Performance tips and best practices

### 4.7 Performance Optimization

- [ ] Optimize performance across the system:
  - [ ] Response time optimization
  - [ ] Memory usage optimization
  - [ ] Caching strategies for context and tools
  - [ ] Lazy loading for MCP servers
  - [ ] Background processing for non-blocking operations

### 4.8 Production Hardening

- [ ] Implement production-ready features:
  - [ ] Comprehensive logging system
  - [ ] Health checks and monitoring
  - [ ] Graceful shutdown handling
  - [ ] Resource cleanup and management
  - [ ] Rate limiting and throttling

### 4.9 VCR Testing System

- [ ] Implement VCR-style testing:
  - [ ] Ollama API response recording
  - [ ] Deterministic test playback
  - [ ] Test cassette management
  - [ ] Real API integration tests
  - [ ] Test coverage reporting

### 4.10 Final Integration and Polish

- [ ] Complete system integration:
  - [ ] End-to-end workflow testing
  - [ ] Performance benchmarking
  - [ ] Security audit and hardening
  - [ ] Documentation completion
  - [ ] Release preparation

**Phase 4 Acceptance Criteria**:

- [ ] Interactive mode provides smooth chat experience
- [ ] All slash commands work like Claude Coder
- [ ] Error messages are helpful with recovery suggestions
- [ ] Performance meets all targets (<2s response, <100MB memory)
- [ ] System is ready for production deployment

---

## 🧪 Testing Strategy (Ongoing)

### Unit Tests

- [ ] Security validation tests (path traversal, command injection)
- [ ] Configuration loading and validation tests
- [ ] Tool execution tests with mocked dependencies
- [ ] Error handling and recovery tests

### Integration Tests

- [ ] Ollama API integration with VCR recordings
- [ ] MCP server integration tests
- [ ] Multi-tool workflow tests
- [ ] File system operation tests

### End-to-End Tests

- [ ] Complete user workflow scenarios
- [ ] Interactive mode testing
- [ ] Performance and stress testing
- [ ] Security penetration testing

---

## 📦 Deployment Preparation

### Build System

- [ ] Production build configuration
- [ ] Binary packaging (optional)
- [ ] npm package preparation
- [ ] Cross-platform compatibility testing

### Documentation

- [ ] README.md with installation and usage
- [ ] Configuration documentation
- [ ] API documentation for tools
- [ ] Troubleshooting guide
- [ ] Security best practices

### Release Preparation

- [ ] Version management setup
- [ ] Release automation
- [ ] Update mechanism (if needed)
- [ ] Backup and recovery procedures

---

## 🎯 Success Metrics Tracking

### Technical Requirements

- [ ] Zero critical security vulnerabilities
- [ ] > 95% tool execution success rate
- [ ] <2s response time for simple queries
- [ ] > 90% test coverage (unit + integration)
- [ ] Graceful handling of MCP server failures

### User Experience Goals

- [ ] Claude Coder-compatible commands and workflow
- [ ] Real-time streaming with clear progress indicators
- [ ] Helpful error messages with recovery suggestions
- [ ] Zero-config startup for basic usage
- [ ] Professional terminal experience

### Performance Targets

- [ ] Tool execution: <500ms for file operations
- [ ] MCP calls: <2s timeout with retry logic
- [ ] Context building: <1s for typical projects
- [ ] Memory usage: <100MB baseline

---

## 🚀 Dependencies and Blockers

### External Dependencies

- [ ] Ollama server availability and compatibility
- [ ] MCP specification stability
- [ ] Node.js and TypeScript ecosystem

### Internal Dependencies

- [ ] Security framework must be completed before tools
- [ ] Core registry required before MCP integration
- [ ] Basic CLI needed before interactive mode
- [ ] Configuration system required for all phases

### Risk Mitigation

- [ ] Fallback strategies for MCP server failures
- [ ] Offline mode for basic operations
- [ ] Alternative model support beyond Ollama
- [ ] Backward compatibility considerations

---

**Total Estimated Tasks**: ~120 tasks across 4 weeks
**Critical Path**: Security → Core → MCP → Tools → UX
**Key Milestones**: Week 1 (Basic functionality), Week 2 (MCP integration), Week 3 (Advanced tools), Week 4 (Production ready)
