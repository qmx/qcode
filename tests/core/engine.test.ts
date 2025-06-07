/**
 * Unit tests for QCodeEngine core logic with mocked dependencies
 * Tests engine behavior in isolation without external API calls
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { QCodeEngine, createQCodeEngine } from '../../src/core/engine.js';
import { ToolRegistry } from '../../src/core/registry.js';
import { Config, QCodeError } from '../../src/types.js';
import { getDefaultConfig } from '../../src/config/defaults.js';
import { TEST_WORKSPACE } from '../setup.js';

describe('QCodeEngine - Unit Tests', () => {
  let engine: QCodeEngine;
  let mockOllamaClient: any;
  let toolRegistry: ToolRegistry;
  let config: Config;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Setup configuration
    config = getDefaultConfig(TEST_WORKSPACE);

    // Create real tool registry
    toolRegistry = new ToolRegistry(config.security, TEST_WORKSPACE);

    // Create mock Ollama client with just the methods we need
    mockOllamaClient = {
      validateConnection: jest.fn(),
      isModelAvailable: jest.fn(),
      listModels: jest.fn(),
      generate: jest.fn(),
      generateStream: jest.fn(),
      chat: jest.fn(),
      chatStream: jest.fn(),
      functionCall: jest.fn(),
      updateConfig: jest.fn(),
      list: jest.fn(),
      show: jest.fn(),
      pull: jest.fn(),
      push: jest.fn(),
      delete: jest.fn(),
      copy: jest.fn(),
      create: jest.fn(),
      embed: jest.fn(),
    };

    // Create engine with mocked client
    engine = new QCodeEngine(mockOllamaClient, toolRegistry, config, {
      workingDirectory: TEST_WORKSPACE,
    });
  });

  describe('Engine Initialization', () => {
    it('should initialize with provided dependencies', () => {
      expect(engine).toBeInstanceOf(QCodeEngine);
    });

    it('should create engine using factory function', () => {
      const factoryEngine = createQCodeEngine(mockOllamaClient, toolRegistry, config, {
        workingDirectory: TEST_WORKSPACE,
      });
      expect(factoryEngine).toBeInstanceOf(QCodeEngine);
    });

    it('should provide access to available tools', () => {
      const tools = engine.getAvailableTools();
      expect(Array.isArray(tools)).toBe(true);
    });
  });

  describe('Query Validation', () => {
    it('should reject empty queries', async () => {
      const response = await engine.processQuery('');

      expect(response.complete).toBe(false);
      expect(response.errors).toHaveLength(1);
      expect(response.errors?.[0]?.code).toBe('INVALID_QUERY');
      
      // Should not make any LLM calls
      expect(mockOllamaClient.generate).not.toHaveBeenCalled();
      expect(mockOllamaClient.functionCall).not.toHaveBeenCalled();
    });

    it('should reject queries that are too long', async () => {
      const longQuery = 'a'.repeat(10001);
      const response = await engine.processQuery(longQuery);

      expect(response.complete).toBe(false);
      expect(response.errors).toHaveLength(1);
      expect(response.errors?.[0]?.code).toBe('QUERY_TOO_LONG');
      
      // Should not make any LLM calls
      expect(mockOllamaClient.generate).not.toHaveBeenCalled();
      expect(mockOllamaClient.functionCall).not.toHaveBeenCalled();
    });

    it('should handle whitespace-only queries', async () => {
      const response = await engine.processQuery('   \t\n   ');

      expect(response.complete).toBe(false);
      expect(response.errors).toHaveLength(1);
      expect(response.errors?.[0]?.code).toBe('EMPTY_QUERY');
      
      // Should not make any LLM calls
      expect(mockOllamaClient.generate).not.toHaveBeenCalled();
      expect(mockOllamaClient.functionCall).not.toHaveBeenCalled();
    });

    it('should accept valid queries', async () => {
      // Setup mock response for this test
      mockOllamaClient.functionCall.mockResolvedValue({
        response: 'Mocked chat response',
        message: { role: 'assistant', content: 'Mocked chat response' },
        model: 'llama3.1:8b',
        done: true,
      });

      const response = await engine.processQuery('help');

      expect(response.complete).toBe(true);
      expect(response.response).toBeDefined();
      expect(typeof response.response).toBe('string');
      
      // Should make LLM calls for valid queries
      expect(mockOllamaClient.functionCall).toHaveBeenCalled();
    });
  });

  describe('Configuration Management', () => {
    it('should update engine configuration', () => {
      const newConfig = {
        ollama: {
          ...config.ollama,
          model: 'mistral',
          temperature: 0.5,
        },
      };

      expect(() => engine.updateConfig(newConfig)).not.toThrow();
    });

    it('should update engine options', () => {
      const newOptions = {
        enableStreaming: true,
        debug: true,
        maxToolExecutions: 5,
      };

      expect(() => engine.updateOptions(newOptions)).not.toThrow();
    });
  });

  describe('Response Structure', () => {
    it('should return properly structured responses', async () => {
      // Setup mock response
      mockOllamaClient.functionCall.mockResolvedValue({
        response: 'Mocked response',
        message: { role: 'assistant', content: 'Mocked response' },
        model: 'llama3.1:8b',
        done: true,
      });

      const response = await engine.processQuery('help');

      expect(response).toHaveProperty('response');
      expect(response).toHaveProperty('toolsExecuted');
      expect(response).toHaveProperty('toolResults');
      expect(response).toHaveProperty('processingTime');
      expect(response).toHaveProperty('complete');

      expect(typeof response.response).toBe('string');
      expect(Array.isArray(response.toolsExecuted)).toBe(true);
      expect(Array.isArray(response.toolResults)).toBe(true);
      expect(typeof response.processingTime).toBe('number');
      expect(typeof response.complete).toBe('boolean');
    });

    it('should include processing time in responses', async () => {
      // Setup mock response
      mockOllamaClient.functionCall.mockResolvedValue({
        response: 'Mocked response',
        message: { role: 'assistant', content: 'Mocked response' },
        model: 'llama3.1:8b',
        done: true,
      });

      const response = await engine.processQuery('help');

      expect(response.processingTime).toBeGreaterThanOrEqual(0);
      expect(typeof response.processingTime).toBe('number');
    });
  });

  describe('Error Handling', () => {
    it('should handle LLM client errors gracefully', async () => {
      // Mock LLM client to throw an error
      mockOllamaClient.functionCall.mockRejectedValue(new Error('LLM connection failed'));

      const response = await engine.processQuery('help');

      // Engine handles errors gracefully and returns error response
      expect(response.errors).toBeDefined();
      expect(response.errors).toHaveLength(1);
      expect(response.errors?.[0]?.code).toBe('ORCHESTRATION_ERROR');
      expect(response.response).toContain('error');
    });

    it('should preserve QCodeError instances', async () => {
      const originalError = new QCodeError('Custom error', 'CUSTOM_ERROR', { test: true });
      mockOllamaClient.functionCall.mockRejectedValue(originalError);

      const response = await engine.processQuery('help');

      expect(response.errors).toBeDefined();
      expect(response.errors).toHaveLength(1);
      expect(response.errors?.[0]).toBe(originalError);
      expect(response.errors?.[0]?.code).toBe('CUSTOM_ERROR');
      expect(response.errors?.[0]?.context).toEqual({ test: true });
    });

    it('should handle tool registry errors', async () => {
      // Create a broken tool registry
      const brokenToolRegistry = new ToolRegistry(config.security, TEST_WORKSPACE);
      const originalListTools = brokenToolRegistry.listTools;
      brokenToolRegistry.listTools = () => {
        throw new Error('Registry error');
      };

      const brokenEngine = new QCodeEngine(mockOllamaClient, brokenToolRegistry, config, {
        workingDirectory: TEST_WORKSPACE,
      });

      // Mock a successful function call since tool registry errors happen during execution
      mockOllamaClient.functionCall.mockResolvedValue({
        response: 'Help response',
        message: { role: 'assistant', content: 'Help response' },
        model: 'llama3.1:8b',
        done: true,
      });

      const response = await brokenEngine.processQuery('help');

      // Engine should handle the error and still provide a response
      expect(response.response).toBeDefined();
      expect(typeof response.response).toBe('string');

      // Restore the original method
      brokenToolRegistry.listTools = originalListTools;
    });
  });

  describe('LLM Integration Points', () => {
    it('should call LLM with correct parameters for help queries', async () => {
      // Setup mock response
      mockOllamaClient.functionCall.mockResolvedValue({
        response: 'Help response',
        message: { role: 'assistant', content: 'Help response' },
        model: 'llama3.1:8b',
        done: true,
      });

      await engine.processQuery('help');

      expect(mockOllamaClient.functionCall).toHaveBeenCalledWith(
        expect.objectContaining({
          model: config.ollama.model,
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: 'system',
              content: expect.stringContaining('QCode'),
            }),
            expect.objectContaining({
              role: 'user',
              content: 'help',
            }),
          ]),
        })
      );
    });

    it('should handle LLM function calling responses', async () => {
      // Mock LLM response with function calls
      mockOllamaClient.functionCall
        .mockResolvedValueOnce({
          response: '',
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                function: {
                  name: 'internal:files',
                  arguments: { operation: 'list', path: '.' },
                },
              },
            ],
          },
          model: 'llama3.1:8b',
          done: true,
        })
        .mockResolvedValueOnce({
          response: 'Tool execution completed',
          message: { role: 'assistant', content: 'Tool execution completed' },
          model: 'llama3.1:8b',
          done: true,
        });

      const response = await engine.processQuery('list files');

      expect(response.complete).toBe(true);
      expect(mockOllamaClient.functionCall).toHaveBeenCalledTimes(2);
    });
  });

  describe('Help Intent Handling', () => {
    it('should provide meaningful help responses', async () => {
      mockOllamaClient.functionCall.mockResolvedValue({
        response: 'QCode is a helpful AI coding assistant...',
        message: { role: 'assistant', content: 'QCode is a helpful AI coding assistant...' },
        model: 'llama3.1:8b',
        done: true,
      });

      const response = await engine.processQuery('help');

      expect(response.complete).toBe(true);
      expect(response.response).toContain('QCode');
      expect(response.response.length).toBeGreaterThan(10);
    });

    it('should handle unknown queries gracefully', async () => {
      mockOllamaClient.functionCall.mockResolvedValue({
        response: 'I can help with coding tasks...',
        message: { role: 'assistant', content: 'I can help with coding tasks...' },
        model: 'llama3.1:8b',
        done: true,
      });

      const response = await engine.processQuery('what is the meaning of life');

      expect(response.complete).toBe(true);
      expect(response.response).toBeDefined();
      expect(response.response.length).toBeGreaterThan(10);
    });
  });
});