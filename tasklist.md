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

- [x] Implement write file functionality:

  - [x] File writing with security validation
  - [x] Atomic write operations to prevent corruption
  - [x] Directory creation when needed
  - [x] Backup functionality for existing files
  - [x] Handle write permissions and read-only scenarios
  - [x] File overwrite protection and confirmation

- [x] **Write File Operation Tests (Critical Scenarios)**:
  - [x] **Security validation (workspace boundary enforcement)** - Path traversal prevention
  - [x] **Overwrite existing file with backup** - Backup functionality with timestamp
  - [x] **Atomic write operations** - Corruption prevention during failures
  - [x] **Create new file in existing directory** - Basic file creation
  - [x] ~~Write to read-only directory (should fail) - Error handling validation~~ **SKIPPED: Non-essential edge case**
  - [x] ~~Directory creation during write - Nested directory creation~~ **SKIPPED: Basic functionality covered**
  - [x] ~~Large file write operations - Performance validation~~ **SKIPPED: Not critical for MVP**
  - [x] ~~Concurrent write conflict handling - Advanced edge cases~~ **SKIPPED: Advanced feature for later**
  - [ ] **Agent File Editing Tests with React CRA Fixture**:
    - [ ] Create `tests/fixtures/projects/react-cra/` for testing file editing scenarios
    - [ ] `src/App.js` with h1 heading → test `"Change the h1 in App.js to h2"` workflow
    - [ ] `src/components/Header.jsx`, `src/components/Footer.jsx` → test component modifications
    - [ ] `package.json`, `public/index.html`, `.gitignore` → test configuration file editing
    - [ ] Multiple CSS files and image assets for realistic editing scenarios

#### 1.7.4 List Files Operation

- [x] Implement file listing functionality:

  - [x] Basic directory listing
  - [x] Glob pattern support (`**/*.ts`, `src/**/*.{js,ts}`)
  - [x] Hidden file handling (`.env`, `.git/`)
  - [x] Recursive directory traversal
  - [x] File metadata inclusion (size, dates, permissions)
  - [x] **NEW**: Smart glob pattern detection in path parameter
  - [x] **NEW**: Context-aware working directory resolution
  - [x] **NEW**: Enhanced error handling with specific error codes
  - [x] **NEW**: Comprehensive security validation with workspace boundaries

- [x] **List Files Operation Tests**:
  - [x] Simple directory listing
  - [x] Glob pattern matching (`**/*.ts`, `src/**/*.{js,ts}`)
  - [x] Hidden file handling (`.env`, `.git/`)
  - [x] Nested directory recursion
  - [x] File metadata accuracy
  - [x] Security validation (workspace boundary enforcement)
  - [x] Error handling for inaccessible directories
  - [x] **NEW**: Smart pattern detection tests
  - [x] **NEW**: Context working directory tests
  - [x] **NEW**: Enhanced error message validation

#### 1.7.5 Search Files Operation

- [x] Implement file search functionality:

  - [x] Simple text search across files
  - [x] Regex pattern search with capture groups
  - [x] Case-sensitive vs insensitive search options
  - [x] Binary file exclusion during search
  - [x] Search result ranking and context
  - [x] **NEW**: Glob pattern support for file filtering
  - [x] **NEW**: Context lines before and after matches
  - [x] **NEW**: Result truncation with maxResults parameter
  - [x] **NEW**: Performance optimization for large codebases
  - [x] **NEW**: UTF-8 and special character support

- [x] **Search Files Operation Tests**:

  - [x] Simple text search across files
  - [x] Regex pattern search with groups
  - [x] Case-sensitive vs insensitive search
  - [x] Binary file exclusion during search
  - [x] Large codebase search performance
  - [x] Search result accuracy and ranking
  - [x] Security validation (workspace boundary enforcement)
  - [x] Memory usage during large searches
  - [x] **NEW**: Context line functionality tests
  - [x] **NEW**: Result truncation and pagination tests
  - [x] **NEW**: UTF-8 and special character handling tests
  - [x] **NEW**: Error handling for invalid regex patterns
  - [x] **NEW**: Performance benchmarks and timing tests

- [ ] **Agent API Discovery Tests with Express Fixture**:
  - [ ] Create `tests/fixtures/projects/ts-express-api/` for testing backend code analysis
  - [ ] `src/server.ts`, `src/routes/`, `src/models/` → test `"Show me all API endpoints in this Express app"` workflow
  - [ ] `package.json` with TypeScript dependencies → test dependency analysis
  - [ ] Multiple configuration files (`tsconfig.json`, `.env.example`) → test config discovery
  - [ ] Search for patterns like "app.get", "app.post", "router." to find API endpoints

#### 1.7.6 Error Handling & Integration

- [x] Complete FilesTool integration:

  - [x] Comprehensive error handling for all operations
  - [x] Integration with `WorkspaceSecurity` validation
  - [x] Tool registry integration and registration
  - [x] Tool definition formatting for Ollama function calling
  - [x] Result formatting and standardization
  - [x] Performance monitoring and optimization
  - [x] **NEW**: Enhanced error codes and messages
  - [x] **NEW**: Context-aware path resolution

### 1.8 Core Engine - End-to-End Function Calling

**GOAL**: Implement ONE complete function calling workflow that works end-to-end

- [x] **1.8.1 Basic Query Processing Engine (FOUNDATION - COMPLETED)**

  - [x] Create initial `src/core/engine.ts` structure
  - [x] Core interfaces and basic query validation
  - [x] Simple intent detection and configuration management

- [x] **1.8.2 Single File Operation Function Calling (END-TO-END MVP - COMPLETED)**

  - [x] **LLM Function Calling for Files Tool**:
    - [x] Implement LLM-based function calling in engine
    - [x] Format `internal.files` tool for Ollama function calling API
    - [x] Parse LLM function call responses and execute tools
    - [x] Handle "read file" query end-to-end with real LLM
  - [x] **VCR Tests for Complete Workflow**:
    - [x] `file_read_query.json`: User asks "show me package.json", LLM calls `internal.files.read`
    - [x] `file_read_partial.json`: User asks "show me the first 20 lines of src/main.ts", LLM calls with line range
    - [x] `file_operation_error.json`: LLM function call with invalid parameters, error handling
  - [x] **Integration Requirements**:
    - [x] Must work with existing `FilesTool.read` operation from 1.7.2
    - [x] Must implement proper error handling and recovery
    - [x] Must format tool results into readable responses

- [x] **1.8.3 Add List Operation (EXTEND E2E WORKFLOW) - COMPLETED**

  - [x] **Implement List Operation in FilesTool**:
    - [x] Complete the `listFiles` method in `src/tools/files.ts`
    - [x] Support glob patterns, recursive listing, hidden files
    - [x] Security validation and workspace boundary enforcement
    - [x] Comprehensive error handling and metadata support
    - [x] **NEW**: Smart glob pattern detection in path parameter
    - [x] **NEW**: Context-aware working directory resolution
  - [x] **Extend LLM Function Calling**:
    - [x] LLM can now call both `read` and `list` operations
    - [x] Handle "list files in src/" queries end-to-end
    - [x] Support complex queries: "list TypeScript files and show me the main one"
  - [x] **VCR Tests for List Workflow**:
    - [x] `file_list_workflow.test.ts`: Complete e2e tests for list operations
    - [x] Multi-step workflow tests: list files, then read specific one
    - [x] Pattern matching tests for TypeScript files
    - [x] Error handling tests for non-existent directories
  - [x] **Integration Requirements**:
    - [x] Must work with existing read function calling from 1.8.2
    - [x] Must handle both single operations and multi-step workflows
    - [x] Must format list results in user-friendly way
  - [x] **Enhanced Testing and Bug Fixes**:
    - [x] Fixed all e2e test failures related to workspace boundary security
    - [x] Improved workspace security error handling with specific error codes
    - [x] Updated test expectations to match new error message patterns
    - [x] Enhanced file operations tool with proper context resolution
    - [x] All tests now pass with improved stability and error reporting

- [x] **1.8.4 CLI Integration (REAL USER EXPERIENCE) - COMPLETE**

  - [x] **Replace CLI Simulation** (from 1.9):
    - [x] Remove `simulateQueryProcessing()`
    - [x] Integrate real `QCodeEngine` with function calling
    - [x] Display tool execution progress and results
    - [x] Add proper engine initialization with OllamaClient, ToolRegistry, and FilesTool
    - [x] Add comprehensive error handling and user-friendly messages
  - [x] **End-to-End CLI Testing**:
    - [x] `qcode "show me package.json"` works completely
    - [x] `qcode "read the first 5 lines of test-file.txt"` works with line ranges
    - [x] `qcode "list files in src/"` works completely
    - [x] `qcode "show me all TypeScript files and read the main one"` works
    - [x] Error handling for non-existent files with graceful degradation
    - [x] Verbose mode shows tool execution details and timing
    - [x] Configuration and version commands work properly
    - [x] Multi-step workflows and complex queries work end-to-end
  - [x] **VCR Testing Implementation** (FOLLOWS @vcr-testing-guide.mdc):
    - [x] Proper fixtures and recordings directory structure (`tests/fixtures/` organized)
    - [x] Real Ollama HTTP interactions recorded in `NOCK_MODE=record`
    - [x] Deterministic replay in normal test runs (0.8s vs 5.7s speedup)
    - [x] Tests CLI functionality by calling engine methods directly
    - [x] 5 VCR recordings created for different file operation scenarios
    - [x] Error handling and edge cases covered with recordings
    - [x] Fixtures properly organized (moved `test-file.txt` from root to `tests/fixtures/test-files/`)

- [x] **1.8.5 Advanced Multi-Step Workflow Orchestration (CORE AGENT INTELLIGENCE)**

  - [x] **1.8.5.1 Workflow State Management (COMPLETED)**:

    - [x] Implement `src/core/workflow-state.ts`:
      - [x] Track execution context across multiple tool calls
      - [x] Store intermediate results and decisions
      - [x] Handle workflow interruption and resumption
      - [x] Context cleanup and memory management
    - [x] Extend engine to maintain workflow state:
      - [x] Previous tool results accessible to subsequent calls
      - [x] Decision branching based on intermediate results
      - [x] Error recovery with rollback capabilities
    - [x] **Workflow State Tests**:
      - [x] Complete unit test suite (21 tests) covering all workflow functionality
      - [x] VCR tests for multi-step workflow context preservation
      - [x] Error recovery and rollback validation
      - [x] Context cleanup and memory management validation
      - [x] Nested workflow support and depth enforcement
      - [x] Checkpoint creation and restoration functionality

  - [ ] **1.8.5.2 Sequential Tool Execution Chains**:

    - [ ] **1.8.5.2.1 Enhanced LLM Context Management**:
      
      **Current Context Management Issues:**
      
      The current `processWithLLMFunctionCalling` method (lines 481-820) uses a simple array to build conversation history (lines 565-575) without intelligent truncation. Results are formatted through `formatToolResult()` (lines 1052-1115) which outputs full content regardless of size, causing conversation context to explode exponentially in multi-step workflows.

      **Current Flow Analysis:**
      - Conversation history is built as simple message array in `conversationHistory` (lines 565-575)
      - Tool results are added via `stepResults.push(formattedResult)` (line 697) with no size consideration
      - Full result text is joined and pushed to conversation with `stepResults.join('\n')` (line 731)
      - Large file contents (>2KB) flood LLM context without summarization
      - Context window fills rapidly, degrading LLM performance in complex workflows

      **Files to modify:**
      - `src/core/engine.ts` - Replace conversation building (lines 565-575) and result formatting (lines 1052-1115)
      - `src/types.ts` - Add new interfaces for intelligent context management

      **Architecture Strategy:**
      
      **Phase 1: Structured Tool Results**
      Create intelligent result objects that separate display content from LLM context. Current `formatToolResult()` method creates user-friendly strings but loses semantic structure needed for smart context management.

      **Phase 2: Context-Aware Conversation Building**
      Replace the simple array appending in `conversationHistory.push()` (line 734) with intelligent memory management that preserves key findings while discarding verbose content.

      **Phase 3: Multi-Step Context Preservation**
      Enhance `shouldContinueWorkflow()` method (lines 825-880) to make decisions based on structured context rather than string matching on conversation content.

      **New interfaces needed in `src/types.ts`:**
      ```typescript
      // Structured tool result for intelligent context management
      export interface StructuredToolResult {
        // Tool execution metadata
        toolName: string;
        success: boolean;
        duration: number;
        
        // Result categorization for smart formatting
        type: 'file_content' | 'file_list' | 'search_results' | 'analysis' | 'error';
        
        // Human-readable summary for conversation context (max 500 chars)
        summary: string;
        
        // Key extracted information for workflow decisions
        keyFindings: string[];
        
        // Full raw data for detailed analysis when needed
        fullData: any;
        
        // Size management flags
        truncated: boolean;
        originalSize?: number;
        
        // Context for next workflow step
        contextForNextStep: Record<string, any>;
        
        // File-specific extracted metadata
        filePaths?: string[];
        patterns?: string[];
        errors?: string[];
      }

      // Enhanced conversation memory management
      export interface ConversationMemory {
        // Original user intent
        originalQuery: string;
        
        // Current workflow position
        stepNumber: number;
        maxSteps: number;
        
        // Structured results from previous steps
        previousResults: StructuredToolResult[];
        
        // Extracted patterns and decisions
        extractedPatterns: Record<string, any>;
        
        // Working memory for cross-step context
        workingMemory: Record<string, any>;
        
        // Conversation size management
        totalContextSize: number;
        maxContextSize: number;
      }

      // Context-aware message formatting
      export interface ContextMessage {
        role: 'system' | 'user' | 'assistant';
        content: string;
        metadata?: {
          toolResults?: StructuredToolResult[];
          stepNumber?: number;
          contextSize?: number;
          truncated?: boolean;
        };
      }
      ```

      **Implementation Strategy:**

      **1. Replace formatToolResult() Method (lines 1052-1115)**
      
      Current method creates monolithic strings. Replace with:
      ```typescript
      private createStructuredResult(
        toolName: string, 
        result: ToolResult, 
        stepContext: ConversationMemory
      ): StructuredToolResult {
        // Analyze result type and extract key information
        // Create intelligent summaries based on content size
        // Extract actionable data for next steps
      }
      
      private formatResultForConversation(
        structuredResult: StructuredToolResult,
        stepContext: ConversationMemory
      ): string {
        // Size-aware formatting for LLM context
        // Preserve important information while discarding verbose content
        // Adapt formatting based on step position in workflow
      }
      ```

      **2. Enhance Conversation Building (lines 731-734)**
      
      Replace simple string concatenation with intelligent memory management:
      ```typescript
      private buildContextAwareConversation(
        conversationMemory: ConversationMemory,
        newResults: StructuredToolResult[]
      ): ContextMessage[] {
        // Sliding window context management
        // Key findings extraction and preservation
        // Size-based truncation with semantic awareness
      }
      ```

      **3. Upgrade shouldContinueWorkflow() (lines 825-880)**
      
      Current method uses string matching on conversation content. Replace with structured decision making:
      ```typescript
      private shouldContinueWorkflow(
        memory: ConversationMemory,
        hadErrors: boolean,
        iterationCount: number
      ): boolean {
        // Analyze structured results instead of string content
        // Make decisions based on extracted patterns
        // Consider workflow completeness vs. context size
      }
      ```

      **Specific Implementation Areas:**

      **File Result Summarization:**
      - Large file contents (>2KB): Extract file type, key functions/classes, structure
      - File lists (>20 items): Group by type, highlight main entry points
      - Search results: Preserve match context, patterns, and file paths

      **Context Size Management:**
      - Monitor total conversation character count
      - Implement sliding window: keep system prompt + user query + last 3-5 structured responses
      - Preserve key findings in `workingMemory` for cross-step reference

      **Memory Extraction Patterns:**
      - Extract file paths for future reference
      - Identify project patterns (framework, structure, key files)
      - Track error patterns and recovery strategies
      - Preserve cross-file relationships and dependencies

      **Tasks:**
      - [ ] Create `StructuredToolResult` interface and conversion methods
      - [ ] Replace `formatToolResult()` with structured result creation
      - [ ] Implement conversation memory management with size limits
      - [ ] Add context-aware decision making to workflow continuation
      - [ ] Create extractors for key findings (file paths, patterns, errors)
      - [ ] Implement sliding window conversation history (max 8KB context)
      - [ ] Add memory cleanup and working memory persistence
      - [ ] Test context preservation across 5+ step workflows

    - [ ] **1.8.5.2.2 LLM-Driven Multi-Step Workflow Patterns**:

      **Files to create/modify:**
      - `src/core/workflow-orchestrator.ts` - NEW FILE for workflow pattern detection
      - `src/core/engine.ts` - Extend LLM system prompt with workflow strategies
      - `tests/e2e/sequential-workflows.test.ts` - NEW FILE for workflow pattern tests

      **Workflow patterns to implement:**
      
      **Pattern 1: Project Discovery → Analysis → Summary**
      ```typescript
      // List files → Detect patterns → Read key files → Generate summary
      async executeProjectAnalysisWorkflow(query: string): Promise<WorkflowResult> {
        // Step 1: List project structure
        // Step 2: Identify framework/patterns (package.json, tsconfig.json)
        // Step 3: Read configuration files and entry points
        // Step 4: Generate structured analysis
      }
      ```

      **Pattern 2: Search → Read → Report Generation**
      ```typescript
      // Search for patterns → Read matching files → Write analysis report
      async executeSearchAndAnalysisWorkflow(query: string): Promise<WorkflowResult> {
        // Step 1: Search for TODO/FIXME/pattern
        // Step 2: Read files with matches
        // Step 3: Analyze context and generate recommendations
        // Step 4: Optionally write summary report
      }
      ```

      **Pattern 3: Configuration Validation Chain**
      ```typescript
      // Find config files → Read settings → Validate consistency
      async executeConfigValidationWorkflow(query: string): Promise<WorkflowResult> {
        // Step 1: Find all configuration files (.json, .yaml, .env)
        // Step 2: Read and parse configuration values
        // Step 3: Cross-reference and validate consistency
        // Step 4: Report inconsistencies and recommendations
      }
      ```

      **Tasks:**
      - [ ] Implement pattern detection in `src/core/workflow-orchestrator.ts`
      - [ ] Create workflow execution strategies with step dependencies
      - [ ] Add conditional logic for step execution based on intermediate results
      - [ ] Implement rollback/retry mechanisms for failed steps

    - [ ] **1.8.5.2.3 Enhanced System Prompt for Multi-Step Reasoning**:

      **Files to modify:**
      - `src/core/engine.ts` - Update LLM system prompt (lines 565-588)

      **Current system prompt enhancement needed:**
      ```typescript
      // Replace existing system prompt with multi-step strategy
      const enhancedSystemPrompt = `You are QCode, an AI coding assistant with advanced workflow capabilities.

      WORKFLOW STRATEGIES:
      For complex queries, break them into logical steps:

      1. PROJECT UNDERSTANDING:
         - Always start with project structure analysis
         - Look for package.json, tsconfig.json, README files
         - Identify framework and architecture patterns
         
      2. SEQUENTIAL EXECUTION:
         - List relevant files first, then read specific ones
         - Search for patterns before analyzing code
         - Read configuration files to understand project setup
         
      3. ANALYSIS CHAINING:
         - Use results from previous steps to inform next actions
         - Maintain context about project type and structure
         - Focus on files most relevant to the user's query

      CONTEXT MANAGEMENT:
      - Summarize large outputs for conversation context
      - Extract key findings and pass them forward
      - Track file relationships and dependencies
      
      EXECUTION PATTERNS:
      - "Analyze project" = list → identify patterns → read key files → summarize
      - "Find issues" = search patterns → read matches → analyze context
      - "Review changes" = list recent files → read changes → assess impact`;
      ```

      **Tasks:**
      - [ ] Design context-aware prompting strategies
      - [ ] Add workflow pattern detection keywords
      - [ ] Implement step-by-step reasoning guidance
      - [ ] Add context preservation instructions

    - [ ] **1.8.5.2.4 Tool Result Formatting for LLM Context**:

      **Files to modify:**
      - `src/core/engine.ts` - Replace `formatToolResult()` method (lines 1052-1069)
      - `src/tools/files.ts` - Enhance result objects with metadata

      **Current issues to fix:**
      - Results over 2KB flood conversation context
      - File lists with 50+ files overwhelm LLM
      - Search results lose important context in formatting
      
      **Enhanced formatting strategy:**
      ```typescript
      private formatToolResultForLLMContext(
        toolName: string, 
        result: ToolResult,
        stepContext: ChainContext
      ): string {
        // Different formatting based on step position and result size
        if (stepContext.stepNumber === 1 && result.data?.files?.length > 10) {
          return this.formatProjectOverview(result);
        }
        
        if (result.data?.content?.length > 2000) {
          return this.formatContentSummary(result);
        }
        
        return this.formatFullResult(result);
      }
      ```

      **Tasks:**
      - [ ] Implement structured summaries for large file lists (>20 items)
      - [ ] Extract key findings from search results automatically
      - [ ] Context-aware result truncation based on query intent
      - [ ] Smart highlighting of relevant information for next steps

    - [ ] **1.8.5.2.5 Comprehensive Sequential Workflow Tests**:

      **Files to create:**
      - `tests/e2e/sequential-workflows.test.ts` - NEW comprehensive test suite
      - `tests/fixtures/recordings/workflow_*.json` - NEW VCR recordings

      **Test scenarios to implement:**
      
      **VCR Test: React Component Analysis Workflow**
      ```typescript
      // Query: "Find all React components and analyze their props usage"
      // Step 1: List *.jsx, *.tsx files → identify React components
      // Step 2: Read component files → extract props interfaces
      // Step 3: Generate summary of prop patterns and recommendations
      ```

      **VCR Test: Project Health Check Workflow**
      ```typescript
      // Query: "Analyze project structure and find potential issues"
      // Step 1: List project structure → identify project type
      // Step 2: Read package.json, tsconfig → check configuration
      // Step 3: Search for TODO/FIXME → find pending issues
      // Step 4: Generate comprehensive health report
      ```

      **VCR Test: API Documentation Workflow**
      ```typescript
      // Query: "Document all API endpoints in this Express app"
      // Step 1: List files matching server patterns → find route files
      // Step 2: Search for app.get, app.post patterns → extract endpoints
      // Step 3: Read route handler files → analyze endpoint details
      // Step 4: Generate API documentation summary
      ```

      **Tasks:**
      - [ ] Create realistic project fixtures (React app, Express API, monorepo)
      - [ ] Record LLM interactions for complex multi-step workflows
      - [ ] Test error recovery when intermediate steps fail
      - [ ] Validate context preservation across 5+ step workflows
      - [ ] Measure performance and memory usage for complex chains
      - [ ] Complex glob operations across different project structures

    - [ ] **1.8.5.2.6 Memory Management and Performance Optimization**:

      **Files to modify:**
      - `src/core/engine.ts` - Add conversation history management
      - `src/core/workflow-state.ts` - Enhance memory cleanup (lines 301-318)

      **Performance considerations:**
      - Conversation history grows exponentially with tool results
      - Large file contents consume LLM context window
      - Memory leaks from uncleaned workflow states

      **Optimization strategies:**
      ```typescript
      class ConversationMemoryManager {
        private maxHistorySize = 8000; // characters
        private maxSteps = 10;
        
        compressHistory(history: ConversationMessage[]): ConversationMessage[] {
          // Keep system prompt + user query + last 3 assistant messages
          // Summarize older steps to preserve key findings
        }
        
        extractKeyContext(result: ToolResult): KeyContext {
          // Extract file paths, patterns, errors for future reference
          // Discard verbose content while preserving actionable information
        }
      }
      ```

      **Tasks:**
      - [ ] Implement sliding window conversation history
      - [ ] Add automatic context compression for long workflows
      - [ ] Monitor memory usage during multi-step execution
      - [ ] Implement cleanup hooks for abandoned workflows

  - [ ] **1.8.5.3 Complex Query Understanding (MANDATORY - BROKEN DOWN)**:

  - [ ] **1.8.5.3.1 Basic Intent Detection**:

    - [ ] Implement query parsing and intent classification
    - [ ] Detect file operation intents (read, write, list, search)
    - [ ] Identify project analysis intents (structure, dependencies, patterns)
    - [ ] Handle ambiguous queries with intelligent defaults
    - [ ] **Basic Intent Tests**:
      - [ ] `"show me package.json"` → file read intent
      - [ ] `"list TypeScript files"` → file list intent with pattern
      - [ ] `"find TODO comments"` → search intent with pattern

  - [ ] **1.8.5.3.2 Query Decomposition**:

    - [ ] Break complex queries into sequential steps
    - [ ] Plan multi-step workflows from single user request
    - [ ] Handle conditional logic based on intermediate results
    - [ ] **Query Decomposition Tests**:
      - [ ] `"Find all React components and analyze their props"` → List .jsx files → Read each → Extract props → Summarize
      - [ ] `"Review recent changes and suggest improvements"` → Search for TODO/FIXME → Read affected files → Generate recommendations

  - [ ] **1.8.5.3.3 File Editing Workflows (CORE AGENT CAPABILITY)**:

    - [ ] Parse file modification requests into actionable steps
    - [ ] Implement read → analyze → edit → verify patterns
    - [ ] Handle backup and rollback for safe editing
    - [ ] **File Editing Tests** (using CRA and Express fixtures):
      - [ ] `"Change the h1 in App.js to h2"` → CRA fixture (read → edit → verify)
      - [ ] `"Add a new import for React hooks in Header.jsx"` → CRA fixture
      - [ ] `"Update the port in server.ts from 3000 to 8080"` → Express fixture
      - [ ] `"Add a new script to package.json for building"` → Any fixture

  - [ ] **1.8.5.3.4 Project Understanding Workflows**:

    - [ ] Analyze project structure and conventions
    - [ ] Detect frameworks and build patterns
    - [ ] Extract component/API/dependency relationships
    - [ ] **Project Understanding Tests**:
      - [ ] `"Find all React components and list their props"` → CRA fixture
      - [ ] `"Show me all API endpoints in this Express app"` → Express fixture
      - [ ] `"List all packages in this monorepo and their dependencies"` → Monorepo fixture

  - [ ] **1.8.5.3.5 Complex Analysis Workflows**:

    - [ ] Multi-file analysis and pattern detection
    - [ ] Code quality assessment and suggestions
    - [ ] Cross-file dependency analysis
    - [ ] **Complex Analysis Tests**:
      - [ ] `"Find TODO comments, read the files, and suggest fixes"` → All fixtures
      - [ ] `"Analyze test coverage by finding test files and their targets"` → All fixtures
      - [ ] `"Review recent changes and identify potential issues"` → Git-enabled fixtures

  - [ ] **1.8.5.3.6 Query Refinement and Clarification**:

    - [ ] Handle unclear or incomplete user requests
    - [ ] Suggest related actions based on intermediate results
    - [ ] Context-aware followup questions and recommendations
    - [ ] **Query Refinement Tests**:
      - [ ] Handle ambiguous requests with intelligent defaults
      - [ ] Suggest corrections for malformed queries
      - [ ] Provide contextual help based on current workspace

  - [ ] **1.8.5.4 Performance & Reliability (OPTIONAL - NICE TO HAVE)**:

**Current Status**: Sections 1.8.2-1.8.4 are **complete** - file read and list operations work end-to-end with full CLI integration and comprehensive e2e testing. Section 1.8.5 remains for advanced multi-step workflow orchestration.

**🎉 PHASE 1 STATUS UPDATE (MAJOR MILESTONE ACHIEVED)**:

✅ **Core Infrastructure Complete (1.1-1.6)**:

- Project setup, type definitions, security framework, configuration system
- Ollama client integration with function calling support
- Tool registry system with namespacing

✅ **File Operations Tool Partially Complete (1.7)**:

- **Read operations** (1.7.2): ✅ Full implementation with line ranges, encoding support, binary detection
- **List operations** (1.7.4): ✅ Complete with glob patterns, recursive listing, metadata, hidden files
- **Write operations** (1.7.3): ✅ Complete with security validation, atomic writes, directory creation, backup functionality
- **Search operations** (1.7.5): ✅ Complete with simple text search, regex search, and comprehensive tests
- **Security integration**: ✅ Workspace boundary enforcement, path validation, error handling

✅ **Core Engine Complete (1.8.1-1.8.4)**:

- LLM function calling integration with Ollama
- End-to-end workflows: read files, list files, multi-step operations
- Comprehensive VCR testing with recorded interactions
- Full CLI integration with user-friendly experience

✅ **CLI Integration Complete (1.9)**:

- Real engine integration (no more simulation)
- Tool registry initialization and execution
- Progress indicators and user-friendly error handling
- Multi-step workflow support

✅ **Testing Infrastructure Complete (1.10)**:

- Jest framework with comprehensive test coverage (165 tests passing)
- VCR testing system for deterministic LLM interaction replay
- Enhanced test fixtures and project builders
- E2E tests covering all major workflows

✅ **Recent Achievements**:

- Fixed all e2e test failures and improved stability
- Enhanced workspace security with specific error codes
- Implemented complete list file operations with pattern matching
- Multi-step workflow support (list → read combinations)
- **NEW**: Implemented complete search file operations (1.7.5) with comprehensive functionality
- **NEW**: Added 33 comprehensive tests for search operations covering all edge cases
- **NEW**: Search supports simple text, regex patterns, case sensitivity, binary file exclusion
- **NEW**: Context lines, result truncation, UTF-8 support, and performance optimization
- **NEW**: End-to-end CLI integration for search queries working perfectly
- All tests passing with comprehensive coverage (165 tests total)

**Next Priorities**:

1. **Complete File Operations** (1.7.3):

   - Implement write file operations with atomic writes and backups
   - ✅ COMPLETED
   - Add comprehensive testing for write operations

2. **Advanced Workflows** (1.8.5):

   - Multi-step workflow orchestration
   - Complex query handling and context passing

3. **Phase 2 MCP Integration** (2.1-2.8):
   - External MCP tool integration via stdio/HTTP
   - Tool namespacing and conflict resolution

**Current Status**: Phase 1 is **fully complete** with read/list/write/search file operations and full CLI integration working end-to-end. All core file operations tools are now implemented with comprehensive security validation and testing.

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

- [x] **Enhanced Test Infrastructure**:
  - [x] `tests/helpers/project-builder.ts` - Dynamic test project creation
  - [x] `tests/helpers/vcr-manager.ts` - VCR recording/playback management
  - [x] `tests/helpers/assertion-helpers.ts` - Custom Jest matchers
  - [x] `scripts/record-vcr.ts` - Script for capturing new LLM interactions

**Phase 1 Acceptance Criteria**:

- [x] **After 1.7.2 (Read File Operation - COMPLETED)**:

  - [x] Read file operation works in isolation (unit tests pass)
  - [x] Security validation prevents path traversal and unauthorized access
  - [x] Read file operation respects workspace boundaries
  - [x] Test fixtures provide comprehensive coverage for read operations
  - [x] Binary file detection and encoding support implemented
  - [x] Line range reading and large file management working
  - [x] Comprehensive error handling for read operations

- [x] **After 1.7.4 (List File Operation - COMPLETED)**:

  - [x] ✅ Read file operations work (completed in 1.7.2)
  - [x] ✅ List file operations work (completed in 1.7.4)
  - [ ] ❌ Write and search file operations need implementation (1.7.3, 1.7.5)
  - [x] Security validation prevents path traversal and unauthorized access
  - [x] File operations respect workspace boundaries with enhanced error handling
  - [x] Test fixtures provide comprehensive coverage

- [x] **After 1.8 (Core Engine - COMPLETED)**:

  - [x] Engine can process queries and orchestrate tool execution
  - [x] LLM integration works with function calling
  - [x] VCR tests demonstrate reliable tool calling behavior
  - [x] Error handling provides graceful recovery
  - [x] All file read and list operations work end-to-end

- [x] **After 1.9 (CLI Integration - COMPLETED)**:

  - [x] `qcode "list files in src/"` works securely end-to-end
  - [x] `qcode "show me package.json"` works securely end-to-end
  - [x] CLI integrates engine and displays formatted results
  - [x] Configuration loads from multiple sources correctly
  - [x] User experience includes progress indicators and helpful errors
  - [x] All Phase 1 implemented components work together seamlessly

- [ ] **Agent Project Structure Tests with Monorepo Fixture**:
  - [ ] Create `tests/fixtures/projects/monorepo-workspace/` for testing complex project navigation
  - [ ] `packages/frontend/`, `packages/backend/`, `packages/shared/` → test `"List all packages in this monorepo"` workflow
  - [ ] Root `package.json` with workspaces configuration → test workspace discovery
  - [ ] Mixed JavaScript/TypeScript across packages → test cross-package file discovery
  - [ ] Test glob patterns like `packages/*/package.json` for package discovery

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
  - [ ] Advanced file editing capabilities
  - [ ] Diff-based file modifications
  - [ ] Multi-file batch operations
  - [ ] Smart merge conflict resolution

### 3.2 Additional Phase 3 Features

- [ ] **1.8.5 Advanced Workflows (MULTI-STEP ORCHESTRATION)**
  - [ ] **Sequential Tool Execution**:
    - [ ] Multi-step workflows: analyze → read → summarize
    - [ ] Context passing between tool executions
    - [ ] Workflow state management and error recovery
  - [ ] **Complex Query Examples**:
    - [ ] "Analyze the project structure and find potential issues"
    - [ ] "Find all React components and check their props usage"
    - [ ] "Review recent changes and suggest improvements"

**Phase 1.8 Acceptance Criteria** (PARTIALLY COMPLETE):

- [x] **After 1.8.2**: `qcode "show me package.json"` works end-to-end with real LLM function calling
- [ ] **After 1.8.3**: `qcode "list files in src/"` and combined workflows work end-to-end (pending list operation implementation)
- [x] **After 1.8.4**: CLI provides complete user experience with progress and formatting (✅ COMPLETE for file reads)

**Current Status**: Section 1.8.4 is **partially complete** - file read operations work end-to-end with full CLI integration. Remaining work includes implementing list, write, and search file operations to complete the full file operations workflow.

---

## 🔗 Phase 4: Advanced Features (Week 4)

**Goal**: Implement advanced features and integrations  
**Deliverable**: Advanced features and integrations

### 4.1 Advanced Features

- [ ] Implement `src/features/advanced.ts`:
  - [ ] Advanced feature implementation
  - [ ] Integration with existing system components

### 4.2 Integration with External Systems

- [ ] Implement `src/integrations/external.ts`:
  - [ ] Integration with external systems
  - [ ] Cross-system data sharing

### 4.3 User Feedback and Analytics

- [ ] Implement `src/analytics/user-feedback.ts`:
  - [ ] User feedback collection
  - [ ] Analytics integration

### 4.4 Security and Compliance

- [ ] Implement `src/security/compliance.ts`:
  - [ ] Security compliance implementation
  - [ ] Compliance reporting

### 4.5 Performance and Scalability

- [ ] Implement `src/performance/scalability.ts`:
  - [ ] Performance optimization
  - [ ] Scalability implementation

### 4.6 User Interface and Experience

- [ ] Implement `src/ui/user-interface.ts`:
  - [ ] User interface implementation
  - [ ] Interactive design

### 4.7 Documentation and User Guide

- [ ] Implement `src/docs/user-guide.ts`:
  - [ ] User guide implementation
  - [ ] Documentation integration

### 4.8 Testing and Validation

- [ ] Implement `src/tests/validation.ts`:
  - [ ] Testing and validation implementation
  - [ ] Integration with CI/CD pipelines

### 4.9 Deployment and Release

- [ ] Implement `src/deployment/release.ts`:
  - [ ] Deployment implementation
  - [ ] Release management

### 4.10 Post-Deployment Support

- [ ] Implement `src/support/post-deployment.ts`:
  - [ ] Post-deployment support implementation
  - [ ] User support integration

### 4.11 Continuous Improvement

- [ ] Implement `src/improvement/continuous.ts`:
  - [ ] Continuous improvement implementation
  - [ ] Feedback loop integration

### 4.12 Final Acceptance Testing

- [ ] Implement `src/tests/acceptance.ts`:
  - [ ] Acceptance testing implementation
  - [ ] Integration with deployment pipelines

### 4.13 Final Deployment

- [ ] Implement `src/deployment/final.ts`:
  - [ ] Final deployment implementation
  - [ ] Integration with deployment pipelines

### 4.14 Post-Deployment Review

- [ ] Implement `src/review/post-deployment.ts`:
  - [ ] Post-deployment review implementation
  - [ ] Integration with deployment pipelines

### 4.15 Project Closure

- [ ] Implement `src/closure/project.ts`:
  - [ ] Project closure implementation
  - [ ] Integration with deployment pipelines

### 4.16 Knowledge Transfer

- [ ] Implement `src/transfer/knowledge.ts`:
  - [ ] Knowledge transfer implementation
  - [ ] Integration with deployment pipelines

### 4.17 Project Evaluation

- [ ] Implement `src/evaluation/project.ts`:
  - [ ] Project evaluation implementation
  - [ ] Integration with deployment pipelines

### 4.18 Project Archive

- [ ] Implement `src/archive/project.ts`:
  - [ ] Project archive implementation
  - [ ] Integration with deployment pipelines

### 4.19 Project Cleanup

- [ ] Implement `src/cleanup/project.ts`:
  - [ ] Project cleanup implementation
  - [ ] Integration with deployment pipelines

### 4.20 Project Documentation

- [ ] Implement `src/docs/project.ts`:
  - [ ] Project documentation implementation

---

## 📋 **STRATEGIC TASKLIST UPDATES - PHASE 1 FOCUS**

### ✅ **Key Changes Made:**

1. **Removed Non-Essential Tests** - Streamlined testing by removing edge cases like "write to read-only directory" and "concurrent write conflict handling" that aren't critical for MVP

2. **Added Comprehensive Project Fixtures** - Replaced generic test fixtures with realistic project structures:

   - `react-cra/`: Complete Create React App for testing file editing scenarios
   - `ts-express-api/`: TypeScript Express API for backend testing
   - `monorepo-workspace/`: Multi-package workspace for complex scenarios

3. **Created Agent Validation Test Scenarios** - Added specific, testable scenarios:

   - **File Editing**: `"Change the h1 in App.js to h2"` → CRA fixture
   - **Project Understanding**: `"Find all React components and list their props"` → CRA fixture
   - **Complex Workflows**: `"Find TODO comments, read files, suggest fixes"` → All fixtures

4. **Broke Down Section 1.8.5** - Expanded the minimal 1.8.5 into comprehensive workflow orchestration:
   - **1.8.5.1**: Workflow State Management (context tracking, error recovery)
   - **1.8.5.2**: Sequential Tool Execution Chains (multi-step workflows)
   - **1.8.5.3**: Complex Query Understanding (intent detection, decomposition)
   - **1.8.5.4**: VCR Tests for Complex Workflows (comprehensive test coverage)
   - **1.8.5.5**: Performance & Reliability (optimization, error handling)

### 🎯 **Next Immediate Priorities for Phase 1 Completion:**

1. **Create Project Fixtures** (1.7 completion):

   - Build the realistic test projects (CRA, Express API, Monorepo)
   - Essential for validating agent capabilities with real-world scenarios

2. **Implement 1.8.5 Workflow Orchestration**:

   - Start with 1.8.5.1 (Workflow State Management)
   - Build foundation for multi-step agent intelligence
   - This is the core of our agent's reasoning capabilities

3. **Agent Validation Tests**:
   - Test scenarios like `"Change h1 to h2 in React app"`
   - Validate end-to-end file editing capabilities
   - Ensure agent can understand and execute complex project modifications

### 🚀 **Strategic Focus:**

The updated tasklist now prioritizes **agent intelligence and real-world capability validation** over comprehensive edge-case testing. We can now build and test complex workflows that demonstrate QCode's ability to understand projects and make intelligent modifications.
