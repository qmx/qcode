# QCode Architecture

## 🎯 **Core Architectural Principles**

### **1. LLM-Centric Orchestration**

**Principle**: The LLM itself makes all decisions about tool usage and workflow execution, not hardcoded rules.

```typescript
// ❌ Rule-Based Approach (Deprecated)
if (query.includes("git")) {
  executeGitWorkflow(query);
}

// ✅ LLM-Centric Approach (Current)
const toolsAvailable = registry.getAvailableTools();
const llmResponse = await ollama.functionCall(query, toolsAvailable);
// LLM decides which tools to call and in what order
```

**Benefits**:
- **Adaptive Intelligence**: Handles novel scenarios without predefined patterns
- **Context Awareness**: LLM uses actual project data to inform decisions
- **Self-Directing**: Agent manages its own workflow based on results
- **Natural Language Understanding**: Direct query interpretation without pattern matching

### **2. Granular Tool Design**

**Principle**: Separate, focused tools rather than monolithic ones for better LLM selection.

```typescript
// ✅ Granular Design (Enables Precise LLM Selection)
internal.git.status    // Working directory analysis
internal.git.diff      // Change analysis  
internal.git.log       // History analysis
internal.git.commit    // Intelligent commits

// ❌ Monolithic Design (Forces Operation Parameters)
internal.git({ operation: "status" })  // LLM must know operation structure
```

**Benefits**:
- **Precise Tool Selection**: LLM easily picks `internal.git.diff` vs `internal.git.status`
- **Clear Capabilities**: Each tool has focused, well-defined purpose
- **Better Error Handling**: Failures isolated to specific operations
- **Easier Testing**: Unit tests per tool, not per operation

### **3. Security-First Architecture**

**Principle**: Multiple layers of security validation with workspace boundary enforcement.

```typescript
// Security Layer Architecture
WorkspaceSecurity.validatePath(filePath)     // Workspace boundary
CommandSecurity.validateCommand(command)     // Command allowlist
PathSecurity.sanitizePath(userInput)        // Path sanitization
```

**Security Controls**:
- **Workspace Boundaries**: All operations constrained to project directory
- **Command Allowlists**: Only predetermined safe commands allowed
- **Path Validation**: Prevent traversal attacks and unsafe file access
- **Zero Network Access**: No arbitrary network commands or file downloads

### **4. Three-Level Task Organization**

**Principle**: Maximum three levels of task nesting (X.Y.Z) for manageable complexity.

```
✅ Correct Structure:
1.7.15 Git Foundation
1.7.16 Git Status Tool
1.7.17 Git Diff Tool

❌ Over-Engineered Structure:
1.7.15.1 Foundation Infrastructure
1.7.15.2 Command Infrastructure  
1.7.16.1 Status Implementation
1.7.16.2 Status Formatting
```

**Benefits**:
- **Cognitive Load**: Easier to navigate and understand
- **Project Management**: Clear task boundaries and dependencies
- **Implementation Focus**: Sub-functionality stays within tool implementation

### **5. Context-Aware Project Intelligence**

**Principle**: Tools understand and adapt to specific project characteristics.

```typescript
// Project-Aware Tool Behavior (LLM-Centric)
const projectContext = await projectIntelligence.analyze();
const diffAnalysis = await gitDiff.analyze();

// Let LLM generate appropriate response with project context
const commitMessage = await llm.functionCall(
  "Generate a commit message for these changes",
  { projectContext, diffAnalysis, availableTools }
);
// LLM automatically adapts to React, Rails, or any framework
```

**Intelligence Layers**:
- **Technology Detection**: Framework, language, and tool identification
- **Convention Understanding**: Project-specific patterns and standards
- **Architecture Awareness**: Code organization and dependency relationships
- **Historical Context**: Learning from existing project patterns

## 🏗️ **System Architecture**

### **Core Components**

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   CLI Interface │───▶│  LLM Engine      │───▶│  Tool Registry  │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │                        │
                                ▼                        ▼
                       ┌──────────────────┐    ┌─────────────────┐
                       │ Context Manager  │    │ Internal Tools  │
                       └──────────────────┘    └─────────────────┘
                                                         │
                                                         ▼
                                               ┌─────────────────┐
                                               │ Security Layer  │
                                               └─────────────────┘
```

### **Tool Namespace Design**

```typescript
// Namespace Pattern: {scope}.{domain}.{operation}
"internal.files.read"        // Internal file reading
"internal.files.write"       // Internal file writing
"internal.git.status"        // Internal git status
"internal.git.diff"          // Internal git diff
"github.list_repos"          // External MCP tool
"slack.send_message"         // External MCP tool
```

**Namespace Benefits**:
- **Collision Prevention**: Tools from different sources can't conflict
- **Clear Ownership**: Obvious which tools are internal vs external
- **Organized Discovery**: LLM can browse tools by domain
- **Future Extensibility**: Easy to add new namespaces and sources

### **Data Flow Architecture**

```typescript
// Query Processing Flow
User Query → CLI → LLM Engine → Tool Selection → Tool Execution → Context Management → Response Synthesis
```

**Detailed Flow**:
1. **Query Reception**: CLI receives natural language query
2. **LLM Analysis**: LLM analyzes query with full project context
3. **Tool Orchestration**: LLM decides which tools to call and when
4. **Context Integration**: Tool results integrated with project understanding
5. **Response Synthesis**: LLM creates coherent, actionable response

### **Security Architecture**

```typescript
// Security Layer Stack
┌─────────────────────────────────┐
│        User Interface          │
├─────────────────────────────────┤
│      Command Validation        │
├─────────────────────────────────┤
│     Workspace Boundaries       │
├─────────────────────────────────┤
│      Path Sanitization         │
├─────────────────────────────────┤
│     File System Access         │
└─────────────────────────────────┘
```

## 🧪 **Testing Architecture**

### **Test Strategy Patterns**

**1. VCR Testing for LLM Interactions**
```typescript
// Deterministic LLM Testing (Actual QCode Pattern)
describe('Git Analysis', () => {
  const vcr = setupVCRTests(__filename);
  
  it('should analyze git changes', async () => {
    await vcr.withRecording('git_analysis', async () => {
      const result = await ollama.functionCall(query, tools);
      
      // Assertions and validation
      expect(result.response).toBeDefined();
      vcr.recordingLog('✓ Git analysis result:', result);
    });
  });
});
```

**2. Unit Tests Alongside Implementation**
```typescript
// Co-located Testing
src/tools/git/status.ts          // Implementation
tests/unit/tools/git/status.test.ts  // Unit tests (same PR)
```

**3. Workflow-Based E2E Testing**
```typescript
// Real-World Scenario Testing
tests/e2e/git-feature-workflow.test.ts     // Development workflows
tests/e2e/git-project-workflow.test.ts     // Cross-tool integration
tests/e2e/git-performance.test.ts          // Scalability validation
```

### **Test Organization Principles**

- **Unit Tests**: Alongside feature implementation (same section/PR)
- **Integration Tests**: Cross-tool interactions and security validation
- **E2E Tests**: Real-world workflow scenarios by domain
- **Performance Tests**: Scalability and resource usage validation
- **VCR Tests**: Deterministic LLM interaction replay

## 📦 **MCP Integration Architecture**

### **External Tool Integration Strategy**

```typescript
// MCP Integration Pattern
QCode CLI → LLM Engine → Tool Registry → MCP Client → External MCP Server
                                     → Internal Tools
```

**Integration Principles**:
- **SDK-First**: Use existing `@modelcontextprotocol/sdk`, no reinvention
- **Stdio Foundation**: Focus on stdio transport for reliability
- **Seamless Integration**: External tools work like internal tools
- **Namespace Isolation**: Clear separation between internal and external tools

### **Transport Layer Strategy**

**Phase 2: Stdio Transport (Foundation)**
```typescript
// Reliable process-based communication
const client = new StdioClientTransport({
  command: "npx",
  args: ["@modelcontextprotocol/server-github"]
});
```

**Phase 4: HTTP Transport (Advanced)**
```typescript
// Web-based MCP servers
const client = new HttpClientTransport({
  url: "https://api.example.com/mcp"
});
```

## 🎨 **Design Patterns**

### **1. Tool Interface Pattern**

```typescript
interface NamespacedTool {
  name: string;              // "internal.git.status"
  description: string;       // Human-readable description
  inputSchema: ZodSchema;    // Input validation
  execute(params: any): Promise<ToolResult>;
}
```

### **2. Context-Aware Tool Pattern**

```typescript
class GitStatusTool implements NamespacedTool {
  constructor(
    private workspaceSecurity: WorkspaceSecurity,
    private projectIntelligence: ProjectIntelligenceTool
  ) {}
  
  async execute(params: any): Promise<ToolResult> {
    // Use project context to inform git status analysis
    const projectType = await this.projectIntelligence.analyze();
    // Adapt output based on project conventions
  }
}
```

### **3. Security Validation Pattern**

```typescript
// Layered Security Validation
async executeTool(toolName: string, params: any): Promise<ToolResult> {
  // 1. Workspace boundary check
  await this.workspaceSecurity.validateAccess(params);
  
  // 2. Parameter sanitization
  const sanitizedParams = await this.sanitizer.clean(params);
  
  // 3. Tool execution
  return await this.registry.execute(toolName, sanitizedParams);
}
```

### **4. LLM Orchestration Pattern**

```typescript
// LLM-Driven Tool Coordination
async processQuery(query: string): Promise<string> {
  const availableTools = this.registry.getToolDefinitions();
  
  // LLM decides tool usage strategy
  const toolCalls = await this.ollama.functionCall(query, availableTools);
  
  // Execute LLM-selected tools
  const results = await this.executeToolChain(toolCalls);
  
  // LLM synthesizes final response
  return await this.ollama.synthesizeResponse(query, results);
}
```

## 📋 **Development Principles**

### **Code Organization**

```
src/
├── core/           # LLM engine, tool registry, security
├── tools/          # Internal tool implementations
├── mcp/            # MCP integration layer
├── config/         # Configuration management
└── security/       # Security validation layer
```

### **Quality Standards**

- **TypeScript First**: Full type safety throughout
- **Security Validation**: All user inputs validated and sanitized
- **Test Coverage**: Unit tests with implementation, E2E for workflows
- **Documentation**: Architecture decisions captured and maintained
- **Performance**: Sub-second response times for common operations

### **Future Evolution**

- **Phase 2**: MCP stdio integration for external tools
- **Phase 3**: Advanced editing and context management
- **Phase 4**: HTTP MCP, advanced features, enterprise deployment
- **Beyond**: Language server integration, collaborative features

## 🎯 **Architectural Achievements**

**Current State**: QCode delivers a **true AI agent** with:
- **LLM Intelligence**: The LLM coordinates all operations intelligently
- **Project Understanding**: Deep, AI-powered analysis of any project type
- **Adaptive Behavior**: Responds to novel scenarios without hardcoded patterns
- **Context-Aware Responses**: All answers informed by actual project data
- **Self-Directing Agent**: LLM manages its own workflow and execution strategy

This architecture represents a **fundamental advancement** in AI agent design, moving from rule-based pattern matching to true LLM-centric intelligence. 