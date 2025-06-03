/**
 * VCR tests for Ollama client using nock
 * These tests record and replay actual Ollama API interactions for deterministic testing
 */

import { OllamaClient } from '../../src/core/client';
import { getDefaultConfig } from '../../src/config/defaults';
import { setupVCRTests } from '../helpers/vcr-helper';

describe('OllamaClient VCR Tests', () => {
  let client: OllamaClient;
  const vcr = setupVCRTests(__filename);

  beforeEach(() => {
    const config = getDefaultConfig();
    client = new OllamaClient(config.ollama);
  });

  describe('Model Management', () => {
    it('should use llama3.1:8b as default model', () => {
      const config = getDefaultConfig();
      expect(config.ollama.model).toBe('llama3.1:8b');
    });

    it('should list available models', async () => {
      await vcr.withRecording('list_models', async () => {
        const models = await client.listModels();

        expect(Array.isArray(models)).toBe(true);
        expect(models.length).toBeGreaterThan(0);

        // All models should be non-empty strings
        models.forEach(model => {
          expect(typeof model).toBe('string');
          expect(model.length).toBeGreaterThan(0);
        });

        // Our target model should be available
        expect(models).toContain('llama3.1:8b');

        vcr.recordingLog('✓ Available models:', models);
        vcr.recordingLog(`✓ Target model 'llama3.1:8b' is available`);
      });
    });
  });

  describe('Chat Completion', () => {
    it('should handle basic chat completion', async () => {
      await vcr.withRecording('basic_chat', async () => {
        const response = await client.chat([{ role: 'user', content: 'Hello, what is 2+2?' }]);

        expect(response).toBeDefined();
        expect(response.response).toBeDefined();
        expect(typeof response.response).toBe('string');
        expect(response.response.length).toBeGreaterThan(0);
        expect(response.model).toBeDefined();
        expect(response.done).toBe(true);

        vcr.recordingLog('✓ Chat response:', response.response);
      });
    });

    it('should handle function calling with tools', async () => {
      await vcr.withRecording('function_calling', async () => {
        const tools = [
          {
            type: 'function' as const,
            function: {
              name: 'get_weather',
              description: 'Get current weather information for a location',
              parameters: {
                type: 'object' as const,
                properties: {
                  location: {
                    type: 'string',
                    description: 'The city name to get weather for',
                  },
                  unit: {
                    type: 'string',
                    description: 'Temperature unit (celsius or fahrenheit)',
                    enum: ['celsius', 'fahrenheit'],
                  },
                },
                required: ['location'],
              },
            },
          },
        ];

        const request = {
          model: 'llama3.1:8b',
          messages: [
            {
              role: 'user' as const,
              content: 'What is the weather like in San Francisco?',
            },
          ],
          tools,
          stream: false,
        };

        const response = await client.functionCall(request);

        expect(response).toBeDefined();
        expect(response.response).toBeDefined();
        expect(typeof response.response).toBe('string');
        expect(response.model).toBeDefined();
        expect(response.done).toBe(true);

        // Validate tool calls if present
        if (response.message?.tool_calls) {
          expect(Array.isArray(response.message.tool_calls)).toBe(true);
          response.message.tool_calls.forEach(toolCall => {
            expect(toolCall.function).toBeDefined();
            expect(toolCall.function.name).toBe('get_weather');
            expect(toolCall.function.arguments).toBeDefined();
          });

          vcr.recordingLog('✓ Tool calls made:', response.message.tool_calls);
        }

        vcr.recordingLog('✓ Function calling response:', response.response);
      });
    });
  });
});
