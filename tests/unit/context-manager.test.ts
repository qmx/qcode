import { ContextManager, DEFAULT_CONTEXT_CONFIG } from '../../src/core/context-manager.js';
import { ToolResult } from '../../src/types.js';

describe('ContextManager - Phase 1 Implementation', () => {
  let contextManager: ContextManager;

  beforeEach(() => {
    contextManager = new ContextManager(DEFAULT_CONTEXT_CONFIG);
  });

  describe('createStructuredResult', () => {
    it('should create structured result for file content', () => {
      const toolResult: ToolResult = {
        success: true,
        data: {
          path: 'src/main.ts',
          content: 'export class TestClass {\n  public method() {\n    return "hello";\n  }\n}',
          lines: 5,
          size: 85,
        },
        duration: 150,
        tool: 'read',
        namespace: 'internal',
      };

      const structuredResult = contextManager.createStructuredResult('internal.files', toolResult);

      expect(structuredResult.toolName).toBe('internal.files');
      expect(structuredResult.success).toBe(true);
      expect(structuredResult.type).toBe('file_content');
      expect(structuredResult.summary).toContain('src/main.ts');
      expect(structuredResult.summary).toContain('5 lines');
      expect(structuredResult.keyFindings).toContain('export class TestClass');
      expect(structuredResult.contextForNextStep.filePath).toBe('src/main.ts');
      expect(structuredResult.contextForNextStep.hasClasses).toBe(true);
    });

    it('should create structured result for file list', () => {
      const toolResult: ToolResult = {
        success: true,
        data: {
          path: 'src/',
          count: 3,
          files: [
            { relativePath: 'main.ts', isDirectory: false },
            { relativePath: 'utils.js', isDirectory: false },
            { relativePath: 'package.json', isDirectory: false },
          ],
        },
        duration: 50,
        tool: 'list',
        namespace: 'internal',
      };

      const structuredResult = contextManager.createStructuredResult('internal.files', toolResult);

      expect(structuredResult.type).toBe('file_list');
      expect(structuredResult.summary).toContain('Found 3 items');
      expect(structuredResult.keyFindings).toContain('1 .ts files');
      expect(structuredResult.keyFindings).toContain('1 .js files');
      expect(structuredResult.contextForNextStep.totalFiles).toBe(3);
      expect(structuredResult.contextForNextStep.hasPackageJson).toBe(true);
    });

    it('should create structured result for search results', () => {
      const toolResult: ToolResult = {
        success: true,
        data: {
          query: 'TODO',
          totalMatches: 5,
          filesSearched: 10,
          matches: [
            { file: 'src/main.ts', line: 10, match: 'TODO: implement this' },
            { file: 'src/utils.ts', line: 25, match: 'TODO: fix bug' },
          ],
        },
        duration: 200,
        tool: 'search',
        namespace: 'internal',
      };

      const structuredResult = contextManager.createStructuredResult('internal.files', toolResult);

      expect(structuredResult.type).toBe('search_results');
      expect(structuredResult.summary).toContain('Search "TODO"');
      expect(structuredResult.summary).toContain('5 matches in 10 files');
      expect(structuredResult.keyFindings).toContain('Found in 2 files');
      expect(structuredResult.contextForNextStep.searchQuery).toBe('TODO');
    });

    it('should handle error results', () => {
      const toolResult: ToolResult = {
        success: false,
        error: 'File not found: missing.txt',
        duration: 10,
        tool: 'read',
        namespace: 'internal',
      };

      const structuredResult = contextManager.createStructuredResult('internal.files', toolResult);

      expect(structuredResult.type).toBe('error');
      expect(structuredResult.success).toBe(false);
      expect(structuredResult.summary).toContain('Error: File not found');
      expect(structuredResult.errors).toContain('File not found: missing.txt');
    });
  });

  describe('formatResultForConversation', () => {
    it('should format file content with context awareness', () => {
      const structuredResult = {
        toolName: 'internal.files',
        success: true,
        duration: 150,
        type: 'file_content' as const,
        summary: 'File: src/main.ts (5 lines) - export class TestClass {',
        keyFindings: ['export class TestClass'],
        fullData: {
          path: 'src/main.ts',
          content: 'export class TestClass {\n  method() {}\n}',
          lines: 5,
        },
        truncated: false,
        contextForNextStep: {},
        filePaths: ['src/main.ts'],
        patterns: ['class', 'export'],
        errors: [],
        originalSize: 100,
      };

      const conversationMemory = contextManager.initializeConversationMemory('test query');
      const formatted = contextManager.formatResultForConversation(
        structuredResult,
        conversationMemory
      );

      expect(formatted).toContain('📄 **src/main.ts**');
      expect(formatted).toContain('(5 lines)');
    });

    it('should format large file content with summary instead of full content', () => {
      const structuredResult = {
        toolName: 'internal.files',
        success: true,
        duration: 150,
        type: 'file_content' as const,
        summary: 'File: large-file.ts (500 lines)',
        keyFindings: ['multiple classes', 'complex logic'],
        fullData: {
          path: 'large-file.ts',
          content: 'very long content...',
          lines: 500,
        },
        truncated: true,
        contextForNextStep: {},
        filePaths: ['large-file.ts'],
        patterns: [],
        errors: [],
        originalSize: 5000, // Large size triggers summary mode
      };

      const conversationMemory = contextManager.initializeConversationMemory('test query');
      const formatted = contextManager.formatResultForConversation(
        structuredResult,
        conversationMemory
      );

      expect(formatted).toContain('📄 **large-file.ts**');
      expect(formatted).toContain('**Summary:**');
      expect(formatted).toContain('**Key findings:**');
      expect(formatted).not.toContain('```'); // Should not show full content
    });
  });

  describe('conversation memory management', () => {
    it('should initialize conversation memory correctly', () => {
      const memory = contextManager.initializeConversationMemory('test query', 5);

      expect(memory.originalQuery).toBe('test query');
      expect(memory.stepNumber).toBe(0);
      expect(memory.maxSteps).toBe(5);
      expect(memory.previousResults).toHaveLength(0);
      expect(memory.totalContextSize).toBe(0);
    });

    it('should update conversation memory with new results', () => {
      const memory = contextManager.initializeConversationMemory('test query');

      const structuredResult = {
        toolName: 'internal.files',
        success: true,
        duration: 100,
        type: 'file_content' as const,
        summary: 'test summary',
        keyFindings: ['finding1', 'finding2'],
        fullData: {},
        truncated: false,
        contextForNextStep: { testKey: 'testValue' },
        filePaths: [],
        patterns: ['pattern1'],
        errors: [],
      };

      const updatedMemory = contextManager.updateConversationMemory(memory, structuredResult);

      expect(updatedMemory.stepNumber).toBe(1);
      expect(updatedMemory.previousResults).toHaveLength(1);
      expect(updatedMemory.workingMemory.testKey).toBe('testValue');
      expect(updatedMemory.extractedPatterns.pattern1).toBe(1);
      expect(updatedMemory.totalContextSize).toBeGreaterThan(0);
    });
  });
});
