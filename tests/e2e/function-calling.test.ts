/**
 * VCR tests for QCode function calling e2e scenarios
 * These tests record and replay actual Ollama API interactions for deterministic testing
 */

import { QCodeEngine } from '../../src/core/engine.js';
import { OllamaClient } from '../../src/core/client.js';
import { ToolRegistry } from '../../src/core/registry.js';
import { FilesTool } from '../../src/tools/files.js';
import { WorkspaceSecurity } from '../../src/security/workspace.js';
import { getDefaultConfig } from '../../src/config/defaults.js';
import { setupVCRTests } from '../helpers/vcr-helper';
import { promises as fs } from 'fs';
import { join } from 'path';

describe('QCode Function Calling E2E Tests', () => {
  let engine: QCodeEngine;
  let client: OllamaClient;
  const vcr = setupVCRTests(__filename);

  const TEST_WORKSPACE = join(process.cwd(), 'tests', 'fixtures', 'projects', 'test-workspace');

  beforeAll(async () => {
    // Create test workspace directory and basic files
    await fs.mkdir(TEST_WORKSPACE, { recursive: true });

    // Create package.json
    const packageJson = {
      name: 'test-project',
      version: '1.0.0',
      description: 'Test project for QCode e2e testing',
      scripts: {
        test: 'echo "test script"',
        build: 'echo "build script"',
      },
      dependencies: {
        typescript: '^5.0.0',
        jest: '^29.0.0',
      },
    };
    await fs.writeFile(join(TEST_WORKSPACE, 'package.json'), JSON.stringify(packageJson, null, 2));

    // Create README.md
    const readmeContent = `# Test Project

This is a test project for QCode e2e testing.

## Features
- File operations
- Function calling
- LLM integration

## Scripts
- \`npm test\` - Run tests
- \`npm run build\` - Build project
`;
    await fs.writeFile(join(TEST_WORKSPACE, 'README.md'), readmeContent);

    // Initialize configuration and components
    const config = getDefaultConfig();
    client = new OllamaClient(config.ollama);

    // Initialize components with proper constructor arguments
    const workspaceSecurity = new WorkspaceSecurity(config.security, TEST_WORKSPACE);
    // Add the test workspace to allowed paths
    workspaceSecurity.addAllowedPath(TEST_WORKSPACE);

    const toolRegistry = new ToolRegistry(config.security, TEST_WORKSPACE);
    const filesTool = new FilesTool(workspaceSecurity);

    // Register file tool properly with all required arguments
    toolRegistry.registerInternalTool(
      'files',
      filesTool.definition,
      filesTool.execute.bind(filesTool)
    );

    // Initialize engine
    engine = new QCodeEngine(client, toolRegistry, config, {
      workingDirectory: TEST_WORKSPACE,
      enableStreaming: false,
      debug: false,
    });
  });

  describe('File Read Function Calling', () => {
    it('should handle "show me package.json" query with function calling', async () => {
      await vcr.withRecording('file_read_query', async () => {
        const response = await engine.processQuery('show me package.json');

        expect(response.complete).toBe(true);
        expect(response.response).toBeDefined();
        expect(typeof response.response).toBe('string');
        expect(response.response.length).toBeGreaterThan(0);

        // Response should contain package.json content
        expect(response.response).toContain('test-project');
        expect(response.response).toContain('1.0.0');

        vcr.recordingLog('✓ Query response:', response.response);
      });
    });

    it('should handle "read the first 5 lines of README.md" with line range', async () => {
      await vcr.withRecording('file_read_partial', async () => {
        const response = await engine.processQuery('read the first 5 lines of README.md');

        expect(response.complete).toBe(true);
        expect(response.response).toBeDefined();
        expect(typeof response.response).toBe('string');

        // Should contain README content but might be truncated
        expect(response.response).toContain('Test Project');

        vcr.recordingLog('✓ Partial read response:', response.response);
      });
    });

    it('should handle function call errors gracefully', async () => {
      await vcr.withRecording('file_operation_error', async () => {
        const response = await engine.processQuery('show me nonexistent-file.txt');

        expect(response.complete).toBe(true);
        expect(response.response).toBeDefined();
        expect(typeof response.response).toBe('string');

        // Should handle error gracefully and explain what happened
        expect(response.response.toLowerCase()).toMatch(/not found|error|does not exist/);

        vcr.recordingLog('✓ Error handling response:', response.response);
      });
    });

    it('should handle single-step workflow with complex query', async () => {
      await vcr.withRecording('multi_step_workflow', async () => {
        const response = await engine.processQuery(
          'List all files in this directory, then show me the contents of package.json'
        );

        expect(response.complete).toBe(true);
        expect(response.response).toBeDefined();
        expect(typeof response.response).toBe('string');

        // Multi-step workflow should execute multiple operations
        expect(response.response).toContain('package.json');
        expect(response.response).toContain('test-project'); // From package.json content

        // Should have executed multiple tool calls for multi-step query
        expect(response.toolsExecuted.length).toBeGreaterThan(1);
        expect(response.toolsExecuted).toContain('internal:files');

        vcr.recordingLog('✓ Multi-step workflow response:', response.response);
      });
    });
  });

  describe('File Read Operations', () => {
    test('should handle "show me the first 20 lines of src/main.ts" query with line range', async () => {
      // Setup test file with many lines - do this before VCR check
      const mainTsContent = Array.from(
        { length: 50 },
        (_, i) => `// Line ${i + 1}: This is a TypeScript file\nconst line${i + 1} = '${i + 1}';`
      ).join('\n');

      await fs.mkdir(join(TEST_WORKSPACE, 'src'), { recursive: true });
      await fs.writeFile(join(TEST_WORKSPACE, 'src/main.ts'), mainTsContent);

      await vcr.withRecording('file_read_with_line_range', async () => {
        // Execute query
        const result = await engine.processQuery('show me the first 20 lines of src/main.ts');

        // Verify results
        expect(result.complete).toBe(true);
        expect(result.errors).toBeUndefined();
        expect(result.toolsExecuted).toContain('internal:files');

        // Verify the response mentions line limits
        expect(result.response).toContain('20 lines');

        // Tool results should show successful file read with line range
        const fileToolResult = result.toolResults?.find(r => r.tool === 'files');
        expect(fileToolResult).toBeDefined();
        expect(fileToolResult?.success).toBe(true);

        vcr.recordingLog('✓ Line range query completed');
        vcr.recordingLog('✓ Tool results:', fileToolResult?.data);
      });
    });

    test('should handle function call with invalid parameters gracefully', async () => {
      await vcr.withRecording('file_read_invalid_params', async () => {
        // Execute query that should result in an error
        const result = await engine.processQuery('show me a non-existent file that does not exist');

        // Verify the query was processed successfully
        expect(result.complete).toBe(true);
        expect(result.response).toBeDefined();
        expect(typeof result.response).toBe('string');

        // Should mention error or file not found
        expect(result.response.toLowerCase()).toMatch(/error|not found|does not exist/);

        // LLM should have attempted to use the files tool
        expect(result.toolsExecuted).toContain('internal:files');

        vcr.recordingLog('✓ Invalid parameter handling completed');
        vcr.recordingLog('✓ Response:', result.response);
      });
    });

    test('should provide helpful context when files are found', async () => {
      await vcr.withRecording('file_context_helpful', async () => {
        const result = await engine.processQuery('tell me about the package.json file');

        expect(result.complete).toBe(true);
        expect(result.response).toBeDefined();
        expect(typeof result.response).toBe('string');

        // Should contain actual content analysis
        expect(result.response).toContain('test-project');
        expect(result.toolsExecuted).toContain('internal:files');

        vcr.recordingLog('✓ Contextual file analysis completed');
        vcr.recordingLog('✓ Analysis result:', result.response);
      });
    });
  });

  describe('Response Formatting', () => {
    test('should format file content with syntax highlighting markers', async () => {
      const tsContent = `interface User {
  id: string;
  name: string;
  email: string;
}

export class UserService {
  async getUser(id: string): Promise<User> {
    // Implementation here
    return { id, name: 'Test', email: 'test@example.com' };
  }
}`;

      await fs.writeFile(join(TEST_WORKSPACE, 'user.ts'), tsContent);

      await vcr.withRecording('file_read_with_formatting', async () => {
        const result = await engine.processQuery('show me user.ts');

        expect(result.complete).toBe(true);
        expect(result.response).toBeDefined();
        expect(typeof result.response).toBe('string');

        // Should contain the TypeScript content
        expect(result.response).toContain('interface User');
        expect(result.response).toContain('UserService');

        // LLM should have used the files tool
        expect(result.toolsExecuted).toContain('internal:files');

        vcr.recordingLog('✓ Formatted file content display completed');
        vcr.recordingLog('✓ Formatted response sample:', result.response.substring(0, 200));
      });
    });

    test('should handle large file content appropriately', async () => {
      // Create a large file
      const largeContent = Array.from(
        { length: 200 },
        (_, i) => `Line ${i + 1}: This is a large file with many lines of content.`
      ).join('\n');

      await fs.writeFile(join(TEST_WORKSPACE, 'large-file.txt'), largeContent);

      await vcr.withRecording('large_file_handling', async () => {
        const result = await engine.processQuery('show me the content of large-file.txt');

        expect(result.complete).toBe(true);
        expect(result.response).toBeDefined();
        expect(typeof result.response).toBe('string');

        // Should handle large content appropriately (might be truncated)
        expect(result.response).toContain('large file');
        expect(result.toolsExecuted).toContain('internal:files');

        vcr.recordingLog('✓ Large file handling completed');
        vcr.recordingLog('✓ Response length:', result.response.length);
      });
    });
  });
});
