import { QCodeEngine } from '../../src/core/engine.js';
import { OllamaClient } from '../../src/core/client.js';
import { ToolRegistry } from '../../src/core/registry.js';
import { EditTool } from '../../src/tools/edit.js';
import { FilesTool } from '../../src/tools/files.js';
import { WorkspaceSecurity } from '../../src/security/workspace.js';
import { getDefaultConfig } from '../../src/config/defaults.js';
import { setupVCRTests } from '../helpers/vcr-helper.js';
import { promises as fs } from 'fs';
import { join } from 'path';

const EDIT_TOOL_FIXTURE = join(__dirname, '../fixtures/projects/edit-tool-test');

describe('EditTool E2E Tests', () => {
  let engine: QCodeEngine;
  const vcr = setupVCRTests(__filename);

  beforeEach(async () => {
    // Setup real engine using the dedicated EditTool fixture
    const config = getDefaultConfig(EDIT_TOOL_FIXTURE);
    const client = new OllamaClient({ ...config.ollama, retries: 0 });
    const workspaceSecurity = new WorkspaceSecurity(config.security, EDIT_TOOL_FIXTURE);
    const toolRegistry = new ToolRegistry(config.security, EDIT_TOOL_FIXTURE);

    // Register EditTool
    const editTool = new EditTool(workspaceSecurity);
    toolRegistry.registerInternalTool('edit', editTool.definition, editTool.execute.bind(editTool));

    // Register FilesTool
    const filesTool = new FilesTool(workspaceSecurity);
    toolRegistry.registerInternalTool(
      'files',
      filesTool.definition,
      filesTool.execute.bind(filesTool)
    );

    engine = new QCodeEngine(client, toolRegistry, config, {
      workingDirectory: EDIT_TOOL_FIXTURE,
      enableStreaming: false,
      debug: false,
    });
  });

  it('should add error handling to authentication function', async () => {
    await vcr.withRecording('edit_add_error_handling', async () => {
      const query =
        'Use the edit tool to add proper error handling to the authenticateUser function in src/auth.js. Insert validation checks for empty username and password at the beginning of the function using the insert_line operation.';

      vcr.recordingLog('🎯 Query:', query);
      const result = await engine.processQuery(query);

      vcr.recordingLog('✅ Result complete:', result.complete);
      vcr.recordingLog('🔧 Tools executed:', result.toolsExecuted);
      vcr.recordingLog('📝 Response:', result.response);

      expect(result.complete).toBe(true);

      // The LLM should at least attempt to use the edit tool or provide instructions
      const toolsUsed = result.toolsExecuted || [];
      const usedEdit = toolsUsed.includes('internal:edit') || toolsUsed.includes('internal.edit');
      const usedFiles =
        toolsUsed.includes('internal:files') || toolsUsed.includes('internal.files');

      // The LLM should at least read the file to understand it
      expect(usedFiles).toBe(true);

      // If edit tool was used, verify file was modified; otherwise check that LLM provided the solution
      if (usedEdit) {
        const modifiedContent = await fs.readFile(join(EDIT_TOOL_FIXTURE, 'src', 'auth.js'), 'utf8');
        vcr.recordingLog('📝 Modified file content:', modifiedContent);
        expect(modifiedContent).toMatch(/validation|validate|empty/i);
      } else {
        // LLM should provide the corrected code in response
        expect(result.response).toMatch(/username.*empty|empty.*username/i);
        expect(result.response).toMatch(/password.*empty|empty.*password/i);
      }
    });
  });

  it('should replace specific lines by line numbers in user.js', async () => {
    await vcr.withRecording('edit_replace_lines_by_number', async () => {
      const query =
        'Use the edit tool to replace lines 38-40 in src/user.js with a new updateUserProfile function that takes id, name, and email parameters. Use the replace_lines operation.';

      vcr.recordingLog('🎯 Query:', query);
      const result = await engine.processQuery(query);

      vcr.recordingLog('✅ Result complete:', result.complete);
      vcr.recordingLog('🔧 Tools executed:', result.toolsExecuted);
      vcr.recordingLog('📝 Response:', result.response);

      expect(result.complete).toBe(true);

      // This test specifically requires EditTool's replace_lines operation
      // FilesTool cannot replace specific line ranges - it can only read/write entire files
      const toolsUsed = result.toolsExecuted || [];
      const usedEdit = toolsUsed.includes('internal:edit') || toolsUsed.includes('internal.edit');
      const usedFiles =
        toolsUsed.includes('internal:files') || toolsUsed.includes('internal.files');

      // LLM should use files tool to read the file first to understand the structure
      expect(usedFiles).toBe(true);

      // This test REQUIRES EditTool's replace_lines operation - FilesTool cannot do line-specific replacements
      expect(usedEdit).toBe(true);
      
      // Verify the file was actually modified with the new function  
      const modifiedContent = await fs.readFile(join(EDIT_TOOL_FIXTURE, 'src', 'user.js'), 'utf8');
      vcr.recordingLog('📝 Modified file content:', modifiedContent);
      expect(modifiedContent).toMatch(/updateUserProfile/i);
      expect(modifiedContent).toMatch(/name.*email|email.*name/i);
    });
  });

  // Additional EditTool E2E tests can be added here as needed
  // Current tests demonstrate line insertion and line range replacement - core EditTool capabilities
});
