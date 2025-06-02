import { QCodeEngine } from '../../src/core/engine.js';
import { OllamaClient } from '../../src/core/client.js';
import { ToolRegistry } from '../../src/core/registry.js';
import { FilesTool } from '../../src/tools/files.js';
import { WorkspaceSecurity } from '../../src/security/workspace.js';
import { getDefaultConfig } from '../../src/config/defaults.js';
import { promises as fs } from 'fs';
import { join } from 'pathe';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import nock from 'nock';

describe('File List Workflow - E2E with LLM Function Calling', () => {
  let engine: QCodeEngine;
  let testWorkspace: string;
  let isRecording: boolean;

  beforeEach(async () => {
    // Create a unique temporary directory for each test
    testWorkspace = join(tmpdir(), `qcode-test-${randomBytes(8).toString('hex')}`);
    await fs.mkdir(testWorkspace, { recursive: true });

    // Create test project structure
    const testFiles = {
      'package.json': JSON.stringify(
        {
          name: 'test-project',
          version: '1.0.0',
          main: 'src/index.ts',
          scripts: { test: 'jest', build: 'tsc' },
        },
        null,
        2
      ),
      'src/index.ts': 'export const main = () => console.log("Hello World");',
      'src/utils/helper.ts': 'export const helper = (msg: string) => `Helper: ${msg}`;',
      'src/components/Button.tsx':
        'export const Button = ({ label }: { label: string }) => <button>{label}</button>;',
      'src/components/Input.tsx':
        'export const Input = ({ type = "text" }) => <input type={type} />;',
      'tests/index.test.ts':
        'import { main } from "../src/index"; test("main function", () => { expect(main).toBeDefined(); });',
      'README.md': '# Test Project\n\nThis is a test project for QCode.',
      'tsconfig.json': JSON.stringify(
        {
          compilerOptions: { target: 'ES2020', module: 'commonjs', outDir: './dist' },
          include: ['src/**/*'],
        },
        null,
        2
      ),
    };

    // Create all test files
    for (const [filePath, content] of Object.entries(testFiles)) {
      const fullPath = join(testWorkspace, filePath);
      const dirPath = join(fullPath, '..');
      await fs.mkdir(dirPath, { recursive: true });
      await fs.writeFile(fullPath, content, 'utf8');
    }

    // Set up configuration
    const config = getDefaultConfig();
    config.workingDirectory = testWorkspace;
    config.security.workspace.allowedPaths = [testWorkspace];

    // Create security and tool registry
    const workspaceSecurity = new WorkspaceSecurity(config.security);
    const toolRegistry = new ToolRegistry(config.security);

    // Register the files tool
    const filesTool = new FilesTool(workspaceSecurity);
    toolRegistry.registerInternalTool(
      'files',
      filesTool.definition,
      filesTool.execute.bind(filesTool)
    );

    // Create Ollama client and engine
    const client = new OllamaClient(config.ollama);
    engine = new QCodeEngine(client, toolRegistry, config);

    // Determine if we're recording based on environment variable
    isRecording = process.env.NOCK_MODE === 'record';
  });

  afterEach(async () => {
    // Clean up test workspace
    if (testWorkspace) {
      await fs.rm(testWorkspace, { recursive: true, force: true });
    }

    if (!isRecording) {
      nock.cleanAll();
    }
  });

  describe('VCR: List Files Functionality', () => {
    it('should list files in project directory', async () => {
      if (!isRecording) {
        // Mock the Ollama response for list operation
        nock('http://localhost:11434')
          .post('/api/chat')
          .reply(200, {
            message: {
              role: 'assistant',
              content: `I'll list the files in the src directory for you.

Looking at the src directory, I can see the following files:
- index.ts - The main entry point with a simple console.log function
- utils/helper.ts - A helper utility function
- components/Button.tsx - A React Button component
- components/Input.tsx - A React Input component

The project has a clean structure with utilities and components organized in separate subdirectories.`,
              tool_calls: [
                {
                  function: {
                    name: 'files',
                    arguments: {
                      operation: 'list',
                      path: 'src',
                      recursive: true,
                    },
                  },
                },
              ],
            },
            done: true,
          });
      }

      const query = `List the files in the src directory of this project`;
      const result = await engine.processQuery(query);

      expect(result.complete).toBe(true);
      expect(result.response).toContain('src');
      expect(result.response).toMatch(/index\.ts|Button\.tsx|helper\.ts/i);

      if (isRecording) {
        console.log('Recording saved for: basic directory list');
      }
    });

    it('should list TypeScript files with pattern matching', async () => {
      if (!isRecording) {
        nock('http://localhost:11434')
          .post('/api/chat')
          .reply(200, {
            message: {
              role: 'assistant',
              content: `I'll show you all the TypeScript files in this project.

Here are all the TypeScript files (.ts and .tsx):
- src/index.ts - Main entry point
- src/utils/helper.ts - Helper utility
- src/components/Button.tsx - React Button component
- src/components/Input.tsx - React Input component
- tests/index.test.ts - Test file

The project uses TypeScript throughout with both .ts files for regular TypeScript and .tsx files for React components.`,
              tool_calls: [
                {
                  function: {
                    name: 'files',
                    arguments: {
                      operation: 'list',
                      pattern: '**/*.{ts,tsx}',
                      recursive: true,
                    },
                  },
                },
              ],
            },
            done: true,
          });
      }

      const query = `Show me all TypeScript files in this project`;
      const result = await engine.processQuery(query);

      expect(result.complete).toBe(true);
      expect(result.response).toMatch(/\.ts|\.tsx/);
      expect(result.response).toMatch(/index\.ts/i);
      expect(result.response).toMatch(/Button\.tsx/i);

      if (isRecording) {
        console.log('Recording saved for: TypeScript files pattern');
      }
    });

    it('should handle multi-step workflow: list then read', async () => {
      if (!isRecording) {
        nock('http://localhost:11434')
          .post('/api/chat')
          .reply(200, {
            message: {
              role: 'assistant',
              content: `I'll first show you all the source files, then read and explain the main entry point.

**Source Files:**
- src/index.ts - Main entry point
- src/utils/helper.ts - Helper utility function
- src/components/Button.tsx - React Button component
- src/components/Input.tsx - React Input component

**Main Entry Point (src/index.ts):**
\`\`\`typescript
export const main = () => console.log("Hello World");
\`\`\`

This is a simple main function that exports a function called \`main\` which logs "Hello World" to the console. It serves as the entry point for the application.`,
              tool_calls: [
                {
                  function: {
                    name: 'files',
                    arguments: {
                      operation: 'list',
                      path: 'src',
                    },
                  },
                },
                {
                  function: {
                    name: 'files',
                    arguments: {
                      operation: 'read',
                      path: 'src/index.ts',
                    },
                  },
                },
              ],
            },
            done: true,
          });
      }

      const query = `First show me all the source files, then read the main entry point file and explain what it does`;
      const result = await engine.processQuery(query);

      expect(result.complete).toBe(true);
      expect(result.response).toMatch(/src.*index\.ts/i);
      expect(result.response).toContain('Hello World');
      expect(result.response).toMatch(/main.*(function|\(\)|=>)/i);

      if (isRecording) {
        console.log('Recording saved for: list then read workflow');
      }
    });
  });

  describe('Error Handling with VCR', () => {
    it('should handle non-existent directory requests', async () => {
      if (!isRecording) {
        nock('http://localhost:11434')
          .post('/api/chat')
          .reply(200, {
            message: {
              role: 'assistant',
              content: `I attempted to list files in the "non-existent-folder" directory, but it appears this directory does not exist in the current workspace. 

The file listing operation returned an error indicating that the directory could not be found. Please check the directory name and try again with a valid directory path.`,
              tool_calls: [
                {
                  function: {
                    name: 'files',
                    arguments: {
                      operation: 'list',
                      path: 'non-existent-folder',
                    },
                  },
                },
              ],
            },
            done: true,
          });
      }

      const query = `List files in the non-existent-folder directory`;
      const result = await engine.processQuery(query);

      expect(result.complete).toBe(true);
      expect(result.response).toMatch(/not found|does not exist|cannot find/i);

      if (isRecording) {
        console.log('Recording saved for: non-existent directory error');
      }
    });
  });
});
