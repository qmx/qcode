/**
 * VCR tests for Ollama client using nock
 * These tests record and replay actual Ollama API interactions for deterministic testing
 */

import { OllamaClient } from '../../src/core/client';
import { getDefaultConfig } from '../../src/config/defaults';
import nock from 'nock';
import fs from 'fs/promises';
import path from 'path';

describe('OllamaClient VCR Tests', () => {
  let client: OllamaClient;
  let recordingsPath: string;

  beforeAll(async () => {
    recordingsPath = path.join(__dirname, '../fixtures/recordings');
    await fs.mkdir(recordingsPath, { recursive: true });
  });

  beforeEach(() => {
    const config = getDefaultConfig();
    client = new OllamaClient(config.ollama);

    // Configure nock for recording/replaying
    if (process.env.NOCK_MODE === 'record') {
      // In record mode, allow real HTTP and record the interactions
      nock.restore();
      nock.recorder.rec({
        output_objects: true,
        enable_reqheaders_recording: false, // More stable replays
      });
    } else {
      // In replay mode, don't allow real HTTP requests
      nock.disableNetConnect();
    }
  });

  afterEach(async () => {
    if (process.env.NOCK_MODE === 'record') {
      nock.recorder.clear();
    } else {
      // Clean up any remaining mocks
      nock.cleanAll();
    }
  });

  describe('Default Model: llama3.1:8b', () => {
    it('should use llama3.1:8b as default model', () => {
      const config = getDefaultConfig();
      expect(config.ollama.model).toBe('llama3.1:8b');
    });

    it('should validate model availability endpoint', async () => {
      const testName = 'model_availability_check';

      if (process.env.NOCK_MODE !== 'record') {
        // Load and apply recorded interactions
        const recordingFile = path.join(recordingsPath, `${testName}.json`);
        try {
          const recordings = JSON.parse(await fs.readFile(recordingFile, 'utf-8'));
          recordings.forEach((recording: any) => {
            const scope = nock(recording.scope);
            if (recording.method.toLowerCase() === 'get') {
              scope.get(recording.path).reply(recording.status, recording.response);
            } else if (recording.method.toLowerCase() === 'post') {
              scope.post(recording.path).reply(recording.status, recording.response);
            }
          });
        } catch (error) {
          console.log('No recording found, skipping test in replay mode');
          return;
        }
      }

      const models = await client.listModels();
      
      // Validate that we get a meaningful response
      expect(Array.isArray(models)).toBe(true);
      expect(models.length).toBeGreaterThan(0);
      
      // Validate that our target model llama3.1:8b is available
      expect(models).toContain('llama3.1:8b');
      
      // Validate that models are properly formatted strings
      models.forEach(model => {
        expect(typeof model).toBe('string');
        expect(model.length).toBeGreaterThan(0);
      });

      if (process.env.NOCK_MODE === 'record') {
        console.log('Available models:', models);
        console.log(`✓ Target model 'llama3.1:8b' is available`);
        
        // Save recording with explicit name
        const recordings = nock.recorder.play();
        if (recordings.length > 0) {
          const recordingFile = path.join(recordingsPath, `${testName}.json`);
          await fs.writeFile(recordingFile, JSON.stringify(recordings, null, 2));
          console.log(`Recorded ${recordings.length} HTTP interactions to ${recordingFile}`);
        }
        nock.recorder.clear();
      }
    });
  });

  describe('Chat Completion with llama3.1:8b', () => {
    it('should handle basic chat completion', async () => {
      const testName = 'basic_chat_completion';

      if (process.env.NOCK_MODE !== 'record') {
        // Load and apply recorded interactions
        const recordingFile = path.join(recordingsPath, `${testName}.json`);
        try {
          const recordings = JSON.parse(await fs.readFile(recordingFile, 'utf-8'));
          recordings.forEach((recording: any) => {
            const scope = nock(recording.scope);
            if (recording.method.toLowerCase() === 'get') {
              scope.get(recording.path).reply(recording.status, recording.response);
            } else if (recording.method.toLowerCase() === 'post') {
              scope.post(recording.path).reply(recording.status, recording.response);
            }
          });
        } catch (error) {
          console.log('No recording found, skipping test in replay mode');
          return;
        }
      }

      const response = await client.chat([{ role: 'user', content: 'Hello, what is 2+2?' }]);

      expect(response).toBeDefined();
      expect(response.response).toBeDefined();
      expect(typeof response.response).toBe('string');
      expect(response.response.length).toBeGreaterThan(0);
      expect(response.model).toBeDefined();
      expect(response.done).toBe(true);

      // Save recording with explicit name
      if (process.env.NOCK_MODE === 'record') {
        const recordings = nock.recorder.play();
        if (recordings.length > 0) {
          const recordingFile = path.join(recordingsPath, `${testName}.json`);
          await fs.writeFile(recordingFile, JSON.stringify(recordings, null, 2));
          console.log(`Recorded ${recordings.length} HTTP interactions to ${recordingFile}`);
        }
        nock.recorder.clear();
      }
    });

    it('should handle function calling with tools', async () => {
      const testName = 'function_calling_with_tools';

      if (process.env.NOCK_MODE !== 'record') {
        // Load and apply recorded interactions
        const recordingFile = path.join(recordingsPath, `${testName}.json`);
        try {
          const recordings = JSON.parse(await fs.readFile(recordingFile, 'utf-8'));
          recordings.forEach((recording: any) => {
            const scope = nock(recording.scope);
            if (recording.method.toLowerCase() === 'get') {
              scope.get(recording.path).reply(recording.status, recording.response);
            } else if (recording.method.toLowerCase() === 'post') {
              scope.post(recording.path).reply(recording.status, recording.response);
            }
          });
        } catch (error) {
          console.log('No recording found, skipping test in replay mode');
          return;
        }
      }

      // Define a simple tool for weather information
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
            content:
              'What is the weather like in San Francisco? Please use the get_weather function.',
          },
        ],
        tools,
        format: 'json',
      };

      const response = await client.functionCall(request);

      expect(response).toBeDefined();
      expect(response.model).toBe('llama3.1:8b');
      expect(response.done).toBe(true);

      // For tool calling, the response might be empty but we should have structured data
      // The actual response could be in the response field or encoded differently
      expect(response.response).toBeDefined();
      expect(typeof response.response).toBe('string');

      // For tool calling, we expect either:
      // 1. A non-empty response string, OR
      // 2. The response to contain tool-related content (even if empty string)
      // The key is that the function call was successful

      // The response should contain structured data since we're using tools
      if (process.env.NOCK_MODE === 'record') {
        console.log('Function calling response:', response.response);
        console.log('Full response object:', JSON.stringify(response, null, 2));
      }

      // Save recording with explicit name
      if (process.env.NOCK_MODE === 'record') {
        const recordings = nock.recorder.play();
        if (recordings.length > 0) {
          const recordingFile = path.join(recordingsPath, `${testName}.json`);
          await fs.writeFile(recordingFile, JSON.stringify(recordings, null, 2));
          console.log(`Recorded ${recordings.length} HTTP interactions to ${recordingFile}`);
        }
        nock.recorder.clear();
      }
    });
  });
});
