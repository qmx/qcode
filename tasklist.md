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

    - [x] Implement `src/core/context-manager.ts` (was `workflow-state.ts`):
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

    - [x] **1.8.5.2.1 Enhanced LLM Context Management** (COMPLETED):

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

      **✅ ALL TASKS COMPLETED:**

      - [x] Create `StructuredToolResult` interface and conversion methods - COMPLETED in `src/types.ts`
      - [x] Replace `formatToolResult()` with structured result creation - COMPLETED in `src/core/context-manager.ts`
      - [x] Implement conversation memory management with size limits - COMPLETED with `ConversationMemory` interface
      - [x] Add context-aware decision making to workflow continuation - COMPLETED in engine integration
      - [x] Create extractors for key findings (file paths, patterns, errors) - COMPLETED with extraction strategies
      - [x] Implement sliding window conversation history (max 8KB context) - COMPLETED with compression thresholds
      - [x] Add memory cleanup and working memory persistence - COMPLETED with `compressConversationMemory()`
      - [x] Test context preservation across 5+ step workflows - COMPLETED with E2E tests

      **Implementation Status:** ✅ **FULLY COMPLETE**

      - Context Manager implemented in `src/core/context-manager.ts`
      - Engine integration completed in `src/core/engine.ts`
      - All interfaces defined in `src/types.ts`
      - Unit tests passing in `tests/unit/context-manager.test.ts`
      - E2E tests passing in `tests/e2e/enhanced-context-management.test.ts`

    - [ ] **1.8.5.2.2 LLM-Driven Multi-Step Workflow Patterns**:

      **ARCHITECTURAL CONTEXT & CURRENT STATE ANALYSIS:**

      **Current Infrastructure Available (FROM EXISTING CODEBASE):**

      - ✅ **ContextManager** (`src/core/context-manager.ts`): Advanced result processing with 6 extraction strategies
        - File content analysis with class/function/export extraction
        - File list processing with extension grouping and important file detection
        - Search result analysis with pattern matching and file grouping
        - Error handling with context preservation
        - Memory management with compression thresholds (8KB limit, 2KB per result)
        - Next-step context creation for workflow planning

      - ✅ **QCodeEngine Multi-Step Loop** (`src/core/engine.ts`, lines 575-820): Functional foundation
        - LLM function calling with structured tool execution
        - Conversation history management with result integration
        - Workflow state tracking via `WorkflowState` integration
        - `shouldContinueWorkflow()` logic for intelligent termination (lines 861-964)
        - Error recovery and structured result propagation

      - ✅ **Current System Prompt** (lines 540-564): Basic but functional
        - Simple multi-step guidance for list → read workflows
        - Basic pattern recognition for common project structures
        - **LIMITATION**: Lacks sophisticated workflow pattern recognition

      **GAP ANALYSIS - WHAT'S MISSING FOR 1.8.5.2.2:**

      **🚧 Missing: Intelligent Workflow Pattern Detection**
      - Current `detectIntent()` (lines 358-414) uses simple keyword matching
      - No sophisticated query decomposition into sequential steps
      - No framework/project-type aware workflow selection
      - No conditional branching based on intermediate results

      **🚧 Missing: LLM-Driven Workflow Orchestration**
      - Current workflow continuation is rule-based (`shouldContinueWorkflow()`)
      - No LLM-guided step planning based on discovered project context
      - No dynamic workflow adaptation based on intermediate findings
      - No intelligent error recovery with alternative workflow paths

      **🚧 Missing: Project-Context Aware Orchestration**
      - No framework detection (React, Express, monorepo) driving workflow selection
      - No adaptive prompting based on project structure discoveries
      - No workflow specialization for different development scenarios

      **IMPLEMENTATION STRATEGY - FILES TO CREATE/MODIFY:**

      **1. NEW FILE: `src/core/workflow-orchestrator.ts` - WORKFLOW PATTERN ENGINE**

      ```typescript
      /**
       * Intelligent workflow pattern detection and execution orchestrator
       */
      export interface WorkflowPattern {
        /** Unique pattern identifier */
        id: string;
        /** Human-readable pattern name */
        name: string;
        /** Pattern description for LLM context */
        description: string;
        /** Query detection criteria */
        triggers: WorkflowTrigger[];
        /** Execution strategy */
        strategy: WorkflowExecutionStrategy;
        /** Expected tool sequence */
        toolSequence: string[];
        /** Success criteria */
        completionCriteria: WorkflowCompletionCriteria;
      }

      export interface WorkflowTrigger {
        /** Type of trigger (keywords, intent, context) */
        type: 'keywords' | 'intent' | 'project_context' | 'composite';
        /** Trigger-specific matching criteria */
        criteria: {
          keywords?: string[];
          intentTypes?: string[];
          projectPatterns?: string[];
          contextRequirements?: Record<string, any>;
        };
        /** Confidence weight (0-1) */
        weight: number;
      }

      export interface WorkflowExecutionStrategy {
        /** Execution mode */
        mode: 'sequential' | 'conditional' | 'adaptive' | 'parallel';
        /** Step planning approach */
        planning: 'static' | 'dynamic' | 'llm_guided';
        /** Error recovery strategy */
        errorRecovery: 'abort' | 'retry' | 'alternative_path' | 'continue';
        /** Context propagation rules */
        contextPropagation: ContextPropagationRule[];
      }

      export interface WorkflowCompletionCriteria {
        /** Minimum steps required */
        minSteps: number;
        /** Maximum steps allowed */
        maxSteps: number;
        /** Required information gathering */
        requiredFindings: string[];
        /** Success indicators */
        successIndicators: string[];
        /** Quality thresholds */
        qualityThresholds: Record<string, number>;
      }

      export class WorkflowOrchestrator {
        private patterns: Map<string, WorkflowPattern>;
        private contextManager: ContextManager;
        private executionHistory: WorkflowExecution[];

        constructor(contextManager: ContextManager) {
          this.contextManager = contextManager;
          this.patterns = new Map();
          this.initializeBuiltInPatterns();
        }

        /**
         * Detect workflow pattern from user query and current context
         */
        async detectWorkflowPattern(
          query: string,
          projectContext?: ProjectContext
        ): Promise<WorkflowPatternMatch[]> {
          // Multi-layered pattern detection
          // 1. Keyword-based pattern matching
          // 2. Intent classification using LLM
          // 3. Project context analysis
          // 4. Composite scoring and ranking
        }

        /**
         * Plan workflow execution steps based on detected pattern
         */
        async planWorkflowExecution(
          pattern: WorkflowPattern,
          query: string,
          context: ConversationMemory
        ): Promise<WorkflowExecutionPlan> {
          // Intelligent step planning based on:
          // - Pattern template
          // - Current project context
          // - Available tools
          // - Previous execution history
        }

        /**
         * Execute workflow with dynamic adaptation
         */
        async executeWorkflow(
          plan: WorkflowExecutionPlan,
          engine: QCodeEngine
        ): Promise<WorkflowExecutionResult> {
          // Execute with continuous adaptation:
          // - Monitor intermediate results
          // - Adapt subsequent steps based on findings
          // - Handle errors with alternative paths
          // - Optimize context usage
        }

        private initializeBuiltInPatterns(): void {
          // Register comprehensive patterns (see detailed patterns below)
        }
      }
      ```

      **2. EXTEND: `src/core/engine.ts` - ENHANCED SYSTEM PROMPT & INTEGRATION**

      **Current System Prompt Enhancement (lines 540-564):**

      Replace basic prompt with sophisticated workflow guidance:

      ```typescript
      // ENHANCED SYSTEM PROMPT WITH WORKFLOW INTELLIGENCE
      const enhancedSystemPrompt = `You are QCode, an AI coding assistant with advanced multi-step workflow capabilities.

      WORKFLOW ORCHESTRATION PRINCIPLES:
      You excel at decomposing complex queries into intelligent step sequences. Always consider:

      1. PROJECT UNDERSTANDING WORKFLOWS:
         - Start with structure analysis: list files → identify framework → read key configs
         - Detect project type: React (jsx/tsx + package.json), Express (server.js + routes), monorepo (workspaces)
         - Extract patterns: dependencies, build tools, architecture conventions

      2. ANALYSIS WORKFLOWS:
         - Search-driven analysis: search patterns → read matching files → extract insights → summarize
         - Cross-file analysis: list related files → read sequentially → build relationship map
         - Quality assessment: find issues → read context → suggest improvements

      3. ADAPTIVE EXECUTION:
         - Let intermediate results guide next steps
         - If you find package.json with React deps → focus on component analysis
         - If you discover Express routes → prioritize API endpoint mapping
         - If you see TODO/FIXME → read surrounding context for actionable suggestions

      4. CONTEXT OPTIMIZATION:
         - Summarize large results for conversation context
         - Extract key findings to inform subsequent steps
         - Maintain project understanding across multiple tool calls

      EXECUTION PATTERNS BY QUERY TYPE:

      "Analyze project" / "Understand codebase":
      → list files → detect framework → read package.json + tsconfig → read main entry → summarize structure

      "Find all [components/endpoints/functions]":
      → search for patterns → list matching files → read selected files → extract and categorize findings

      "Review [code/changes/issues]":
      → search for TODO/FIXME/ERROR → read files with matches → analyze context → provide recommendations

      "Document [API/components/features]":
      → list relevant files → read for structure → extract public interfaces → generate documentation

      INTELLIGENT ADAPTATION:
      - React projects: Focus on components/, hooks/, context patterns
      - Express projects: Focus on routes/, middleware/, models/
      - Monorepos: Focus on packages/, shared dependencies, cross-package analysis
      - Library projects: Focus on public APIs, exports, documentation

      Continue calling functions until you have sufficient information to fully answer the user's request.
      Adapt your approach based on what you discover about the project structure and type.`;
      ```

      **Integration Points (in `processWithLLMFunctionCalling()`):**

      ```typescript
      // BEFORE WORKFLOW LOOP (after line 520):
      // Initialize workflow orchestrator
      const workflowOrchestrator = new WorkflowOrchestrator(this.contextManager);
      
      // Detect workflow pattern
      const detectedPatterns = await workflowOrchestrator.detectWorkflowPattern(
        query, 
        await this.extractProjectContext(context.workingDirectory)
      );
      
      // Plan execution if high-confidence pattern detected
      let workflowPlan: WorkflowExecutionPlan | undefined;
      if (detectedPatterns.length > 0 && detectedPatterns[0].confidence > 0.7) {
        workflowPlan = await workflowOrchestrator.planWorkflowExecution(
          detectedPatterns[0].pattern,
          query,
          conversationMemory
        );
        
        // Enhance system prompt with workflow-specific guidance
        systemPrompt += await this.buildWorkflowSpecificPrompt(workflowPlan);
      }

      // INSIDE WORKFLOW LOOP (after line 730):
      // Adaptive workflow guidance based on results
      if (workflowPlan && stepStructuredResults.length > 0) {
        const adaptedPlan = await workflowOrchestrator.adaptWorkflowPlan(
          workflowPlan,
          stepStructuredResults,
          conversationMemory
        );
        
        // Update LLM context with adaptive guidance
        if (adaptedPlan.hasChanges) {
          conversationHistory.push({
            role: 'system' as const,
            content: adaptedPlan.adaptationGuidance
          });
        }
      }
      ```

      **3. NEW FILE: `tests/e2e/workflow-patterns.test.ts` - COMPREHENSIVE PATTERN TESTING**

      **BUILT-IN WORKFLOW PATTERNS TO IMPLEMENT:**

      **Pattern 1: Project Discovery & Architecture Analysis**
      ```typescript
      const PROJECT_ANALYSIS_PATTERN: WorkflowPattern = {
        id: 'project_analysis',
        name: 'Project Discovery & Architecture Analysis',
        description: 'Comprehensive project structure and framework detection',
        triggers: [
          {
            type: 'keywords',
            criteria: { keywords: ['analyze project', 'understand codebase', 'project structure', 'architecture'] },
            weight: 0.8
          },
          {
            type: 'intent',
            criteria: { intentTypes: ['project_understanding', 'architecture_analysis'] },
            weight: 0.9
          }
        ],
        strategy: {
          mode: 'sequential',
          planning: 'llm_guided',
          errorRecovery: 'continue',
          contextPropagation: [
            { from: 'file_list', to: 'project_context', extractors: ['framework_detection', 'entry_points'] },
            { from: 'file_content', to: 'dependency_analysis', extractors: ['package_deps', 'imports'] }
          ]
        },
        toolSequence: ['internal.files.list', 'internal.files.read', 'internal.files.search'],
        completionCriteria: {
          minSteps: 3,
          maxSteps: 8,
          requiredFindings: ['project_type', 'main_entry', 'dependencies'],
          successIndicators: ['framework_identified', 'structure_mapped'],
          qualityThresholds: { 'context_coverage': 0.7, 'finding_relevance': 0.8 }
        }
      };

      // Test Execution:
      // Query: "Analyze this React project and tell me about its structure"
      // Expected Flow:
      // 1. list files → detect React (jsx/tsx files, package.json with react deps)
      // 2. read package.json → extract dependencies, scripts, project metadata
      // 3. read main entry (src/index.tsx or src/App.tsx) → understand app structure
      // 4. list src/ → identify components, hooks, utils, styles organization
      // 5. search for "export default" → find main components and modules
      // 6. summarize: framework version, architecture patterns, key components
      ```

      **Pattern 2: Feature Discovery & API Mapping**
      ```typescript
      const API_MAPPING_PATTERN: WorkflowPattern = {
        id: 'api_mapping',
        name: 'API Endpoint Discovery & Documentation',
        description: 'Systematic discovery and documentation of API endpoints',
        triggers: [
          {
            type: 'keywords',
            criteria: { keywords: ['api endpoints', 'routes', 'document api', 'find endpoints'] },
            weight: 0.9
          },
          {
            type: 'project_context',
            criteria: { projectPatterns: ['express', 'fastify', 'koa', 'nestjs'] },
            weight: 0.8
          }
        ],
        strategy: {
          mode: 'conditional',
          planning: 'dynamic',
          errorRecovery: 'alternative_path',
          contextPropagation: [
            { from: 'search_results', to: 'endpoint_map', extractors: ['route_patterns', 'http_methods'] },
            { from: 'file_content', to: 'api_docs', extractors: ['route_handlers', 'middleware'] }
          ]
        },
        toolSequence: ['internal.files.search', 'internal.files.list', 'internal.files.read'],
        completionCriteria: {
          minSteps: 4,
          maxSteps: 10,
          requiredFindings: ['endpoint_list', 'http_methods', 'route_handlers'],
          successIndicators: ['complete_api_map', 'documented_params'],
          qualityThresholds: { 'endpoint_coverage': 0.85, 'documentation_completeness': 0.7 }
        }
      };

      // Test Execution:
      // Query: "Find all API endpoints in this Express app and document them"
      // Expected Flow:
      // 1. search "app.get|app.post|app.put|app.delete" → find route definitions
      // 2. list routes/ or api/ directories → discover route organization
      // 3. read main server file → understand middleware and route mounting
      // 4. read individual route files → extract endpoint details, parameters, responses
      // 5. search for middleware → understand authentication, validation patterns
      // 6. generate API documentation with endpoints, methods, parameters
      ```

      **Pattern 3: Code Quality & Issue Analysis**
      ```typescript
      const QUALITY_ANALYSIS_PATTERN: WorkflowPattern = {
        id: 'quality_analysis',
        name: 'Code Quality Assessment & Issue Detection',
        description: 'Systematic discovery and analysis of code quality issues',
        triggers: [
          {
            type: 'keywords',
            criteria: { keywords: ['find issues', 'code quality', 'todos', 'review code', 'find problems'] },
            weight: 0.8
          },
          {
            type: 'composite',
            criteria: { 
              keywords: ['todo', 'fixme', 'hack', 'warning'],
              contextRequirements: { 'multiple_files': true }
            },
            weight: 0.9
          }
        ],
        strategy: {
          mode: 'adaptive',
          planning: 'llm_guided',
          errorRecovery: 'continue',
          contextPropagation: [
            { from: 'search_results', to: 'issue_map', extractors: ['issue_patterns', 'severity_indicators'] },
            { from: 'file_content', to: 'context_analysis', extractors: ['surrounding_code', 'impact_assessment'] }
          ]
        },
        toolSequence: ['internal.files.search', 'internal.files.read', 'internal.files.list'],
        completionCriteria: {
          minSteps: 3,
          maxSteps: 12,
          requiredFindings: ['issue_list', 'context_analysis', 'recommendations'],
          successIndicators: ['prioritized_issues', 'actionable_suggestions'],
          qualityThresholds: { 'issue_relevance': 0.8, 'suggestion_quality': 0.7 }
        }
      };

      // Test Execution:
      // Query: "Find TODO comments and suggest fixes"
      // Expected Flow:
      // 1. search "TODO|FIXME|HACK|XXX" → find all issue markers
      // 2. read files with matches → understand context around each issue
      // 3. list related files → understand broader code context
      // 4. analyze patterns → group similar issues, assess impact
      // 5. generate recommendations → prioritize fixes, suggest solutions
      ```

      **Pattern 4: Dependency & Security Analysis**
      ```typescript
      const DEPENDENCY_ANALYSIS_PATTERN: WorkflowPattern = {
        id: 'dependency_analysis',
        name: 'Dependency Analysis & Security Assessment',
        description: 'Analysis of project dependencies and potential security issues',
        triggers: [
          {
            type: 'keywords',
            criteria: { keywords: ['dependencies', 'security', 'vulnerabilities', 'packages', 'outdated'] },
            weight: 0.8
          },
          {
            type: 'project_context',
            criteria: { projectPatterns: ['package.json', 'requirements.txt', 'Gemfile', 'pom.xml'] },
            weight: 0.7
          }
        ],
        strategy: {
          mode: 'sequential',
          planning: 'static',
          errorRecovery: 'retry',
          contextPropagation: [
            { from: 'file_content', to: 'dependency_map', extractors: ['package_versions', 'dependency_tree'] },
            { from: 'search_results', to: 'usage_analysis', extractors: ['import_patterns', 'usage_frequency'] }
          ]
        },
        toolSequence: ['internal.files.read', 'internal.files.search', 'internal.files.list'],
        completionCriteria: {
          minSteps: 3,
          maxSteps: 6,
          requiredFindings: ['dependency_list', 'usage_patterns', 'potential_issues'],
          successIndicators: ['complete_inventory', 'risk_assessment'],
          qualityThresholds: { 'dependency_coverage': 0.9, 'analysis_depth': 0.7 }
        }
      };
      ```

      **IMPLEMENTATION TASKS - DETAILED BREAKDOWN:**

      **Phase 1: Core Workflow Orchestrator (Week 1)**
      - [ ] **1.8.5.2.2.1**: Implement `WorkflowOrchestrator` class with pattern detection engine
        - Multi-layered pattern matching (keywords + intent + project context)
        - Confidence scoring and pattern ranking
        - Built-in pattern library with 6+ comprehensive patterns
        - Project context extraction from file structure analysis

      - [ ] **1.8.5.2.2.2**: Create workflow execution planning system
        - Step sequence generation based on pattern templates
        - Dynamic adaptation based on intermediate results
        - Context propagation rules for cross-step information sharing
        - Error recovery strategies with alternative workflow paths

      **Phase 2: Engine Integration & Enhanced Prompting (Week 1-2)**
      - [ ] **1.8.5.2.2.3**: Integrate orchestrator with `QCodeEngine.processWithLLMFunctionCalling()`
        - Pre-workflow pattern detection and plan generation
        - Real-time workflow adaptation based on step results
        - Enhanced system prompt with workflow-specific guidance
        - Context-aware conversation management

      - [ ] **1.8.5.2.2.4**: Implement sophisticated system prompt enhancement
        - Pattern-specific prompting strategies
        - Project-type aware execution guidance
        - Adaptive prompting based on discovered context
        - Result summarization for conversation optimization

      **Phase 3: Comprehensive Testing & Validation (Week 2)**
      - [ ] **1.8.5.2.2.5**: Create realistic project fixtures for pattern testing
        - React CRA project with component hierarchy and routing
        - Express API project with routes, middleware, and models
        - Monorepo workspace with multiple packages and shared dependencies
        - Python Flask project for cross-language pattern validation

      - [ ] **1.8.5.2.2.6**: Implement VCR testing for complex workflow scenarios
        - Record LLM interactions for 10+ realistic workflow scenarios
        - Test pattern detection accuracy across different project types
        - Validate workflow adaptation and error recovery mechanisms
        - Performance testing for multi-step workflows (5-15 steps)

      **Phase 4: Advanced Features & Optimization (Week 2)**
      - [ ] **1.8.5.2.2.7**: Implement workflow performance optimization
        - Intelligent context compression for long workflows
        - Parallel tool execution where appropriate
        - Memory usage monitoring and cleanup
        - Workflow execution caching for repeated patterns

      - [ ] **1.8.5.2.2.8**: Add workflow learning and improvement mechanisms
        - Success/failure pattern tracking
        - Workflow optimization based on execution history
        - User feedback integration for pattern refinement
        - Adaptive pattern weights based on project type success rates

      **INTEGRATION WITH EXISTING SYSTEMS:**

      **ContextManager Integration:**
      - Leverage existing extraction strategies for enhanced context creation
      - Extend `ConversationMemory` to include workflow state tracking
      - Enhance result formatting for workflow-aware conversation management
      - Utilize context compression for long workflow sequences

      **Engine Integration Points:**
      - Pre-process queries through workflow pattern detection
      - Enhance `shouldContinueWorkflow()` with pattern-aware decision making
      - Integrate workflow planning with existing function calling loop
      - Extend error handling with workflow-specific recovery strategies

      **Expected Outcomes:**
      - 50% improvement in multi-step workflow success rates
      - 30% reduction in unnecessary tool executions through intelligent planning
      - 80%+ accuracy in project type detection and appropriate workflow selection
      - Robust handling of 15+ step workflows with maintained context quality

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
