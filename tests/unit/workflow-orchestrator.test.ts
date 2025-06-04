import { WorkflowOrchestrator } from '../../src/core/workflow-orchestrator.js';
import { ContextManager } from '../../src/core/context-manager.js';
import { OllamaClient } from '../../src/core/client.js';
import { ToolRegistry } from '../../src/core/registry.js';
import { FilesTool } from '../../src/tools/files.js';
import { WorkspaceSecurity } from '../../src/security/workspace.js';
import { getDefaultConfig } from '../../src/config/defaults.js';
import { initializeLogger } from '../../src/utils/logger.js';
import { setupVCRTests } from '../helpers/vcr-helper.js';

describe('WorkflowOrchestrator VCR Tests', () => {
  let orchestrator: WorkflowOrchestrator;
  let contextManager: ContextManager;
  let ollamaClient: OllamaClient;
  const vcr = setupVCRTests(__filename);

  beforeAll(() => {
    // Initialize logger for tests
    initializeLogger({
      level: 'error', // Reduce log noise in tests
      console: false,
      timestamp: false,
      colors: false,
    });
  });

  beforeEach(() => {
    // Setup real components for testing
    const config = getDefaultConfig();
    ollamaClient = new OllamaClient(config.ollama);
    const workspaceSecurity = new WorkspaceSecurity(config.security, config.workingDirectory);
    const toolRegistry = new ToolRegistry(config.security, config.workingDirectory);
    const filesTool = new FilesTool(workspaceSecurity);

    toolRegistry.registerInternalTool(
      'files',
      filesTool.definition,
      filesTool.execute.bind(filesTool)
    );

    contextManager = new ContextManager();
    orchestrator = new WorkflowOrchestrator(contextManager, ollamaClient);
  });

  describe('LLM-Based Pattern Detection', () => {
    it('should detect project analysis pattern using real LLM', async () => {
      await vcr.withRecording('pattern_detection_project_analysis', async () => {
        const query = 'analyze this project structure and tell me about the architecture';
        const matches = await orchestrator.detectWorkflowPattern(query);

        expect(matches.length).toBeGreaterThan(0);

        // Test actual LLM response, not mocked behavior
        const topMatch = matches[0]!;
        expect(topMatch.confidence).toBeGreaterThan(0);
        expect(topMatch.pattern.id).toBeDefined();

        vcr.recordingLog('✓ Pattern detection completed');
        vcr.recordingLog('✓ Top match:', topMatch.pattern.name);
        vcr.recordingLog('✓ Confidence:', topMatch.confidence);
      });
    });

    it('should detect API mapping pattern for backend queries', async () => {
      await vcr.withRecording('pattern_detection_api_mapping', async () => {
        const query = 'find all API endpoints in this Express application';
        const matches = await orchestrator.detectWorkflowPattern(query);

        expect(matches.length).toBeGreaterThan(0);

        const topMatch = matches[0]!;
        expect(topMatch.confidence).toBeGreaterThan(0);
        expect(topMatch.extractedParameters).toBeDefined();

        vcr.recordingLog('✓ API mapping pattern detected');
        vcr.recordingLog('✓ Pattern ID:', topMatch.pattern.id);
        vcr.recordingLog('✓ Extracted parameters:', topMatch.extractedParameters);
      });
    });

    it('should detect code quality analysis pattern', async () => {
      await vcr.withRecording('pattern_detection_quality_analysis', async () => {
        const query = 'find all TODO comments and suggest improvements';
        const matches = await orchestrator.detectWorkflowPattern(query);

        expect(matches.length).toBeGreaterThan(0);

        const topMatch = matches[0]!;
        expect(topMatch.confidence).toBeGreaterThan(0);
        expect(topMatch.matchedTriggers).toBeDefined();

        vcr.recordingLog('✓ Quality analysis pattern detected');
        vcr.recordingLog('✓ Matched triggers:', topMatch.matchedTriggers);
      });
    });

    it('should handle queries that do not match any pattern', async () => {
      await vcr.withRecording('pattern_detection_no_match', async () => {
        const query = 'what is the weather today';
        const matches = await orchestrator.detectWorkflowPattern(query);

        // LLM should recognize this is not a code-related workflow
        expect(matches.length).toBe(0);

        vcr.recordingLog('✓ Non-code query correctly rejected by LLM');
      });
    });

    it('should extract parameters from complex queries', async () => {
      await vcr.withRecording('pattern_detection_parameter_extraction', async () => {
        const query = 'analyze all .ts and .js files in the src directory for React components';
        const matches = await orchestrator.detectWorkflowPattern(query);

        expect(matches.length).toBeGreaterThan(0);

        const topMatch = matches[0]!;
        expect(topMatch.extractedParameters).toBeDefined();

        vcr.recordingLog('✓ Parameter extraction completed');
        vcr.recordingLog('✓ Extracted parameters:', topMatch.extractedParameters);
      });
    });
  });

  describe('Workflow Planning', () => {
    it('should plan workflow execution based on detected pattern', async () => {
      await vcr.withRecording('workflow_planning_project_analysis', async () => {
        const query = 'analyze this TypeScript project structure';
        const matches = await orchestrator.detectWorkflowPattern(query);

        expect(matches.length).toBeGreaterThan(0);
        const pattern = matches[0]!.pattern;

        const conversationMemory = contextManager.initializeConversationMemory(query, 10);
        const plan = await orchestrator.planWorkflowExecution(pattern, query, conversationMemory);

        expect(plan).toBeDefined();
        expect(plan.steps.length).toBeGreaterThan(0);
        expect(plan.estimatedCompletion.estimatedSteps).toBeGreaterThan(0);

        vcr.recordingLog('✓ Workflow planning completed');
        vcr.recordingLog('✓ Planned steps:', plan.steps.length);
        vcr.recordingLog('✓ Estimated total steps:', plan.estimatedCompletion.estimatedSteps);
      });
    });

    it('should generate appropriate tool arguments for planned steps', async () => {
      await vcr.withRecording('workflow_planning_tool_arguments', async () => {
        const query = 'list all TypeScript files and analyze their exports';
        const matches = await orchestrator.detectWorkflowPattern(query);

        expect(matches.length).toBeGreaterThan(0);
        const pattern = matches[0]!.pattern;

        const conversationMemory = contextManager.initializeConversationMemory(query, 10);
        const plan = await orchestrator.planWorkflowExecution(pattern, query, conversationMemory);

        expect(plan.steps.length).toBeGreaterThan(0);

        // Check that first step has appropriate arguments
        const firstStep = plan.steps[0]!;
        expect(firstStep.toolName).toBeDefined();
        expect(firstStep.plannedArguments).toBeDefined();

        vcr.recordingLog('✓ Tool arguments generated');
        vcr.recordingLog('✓ First step tool:', firstStep.toolName);
        vcr.recordingLog('✓ First step args:', firstStep.plannedArguments);
      });
    });
  });

  describe('Empty Query Handling', () => {
    it('should handle empty queries gracefully', async () => {
      const query = '';
      const matches = await orchestrator.detectWorkflowPattern(query);

      // No LLM call needed for empty queries
      expect(matches.length).toBe(0);
    });

    it('should handle whitespace-only queries', async () => {
      const query = '   \n  \t  ';
      const matches = await orchestrator.detectWorkflowPattern(query);

      // No LLM call needed for whitespace-only queries
      expect(matches.length).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle LLM errors gracefully', async () => {
      await vcr.withRecording('workflow_orchestrator_error_handling', async () => {
        // Test with a very long query that might cause issues
        const query = 'analyze ' + 'this project '.repeat(100) + 'structure';

        try {
          const matches = await orchestrator.detectWorkflowPattern(query);

          // Should either succeed or fail gracefully
          expect(Array.isArray(matches)).toBe(true);

          vcr.recordingLog('✓ Long query handled');
          vcr.recordingLog('✓ Matches found:', matches.length);
        } catch (error) {
          // If it fails, it should fail gracefully
          expect(error).toBeInstanceOf(Error);
          vcr.recordingLog('✓ Error handled gracefully:', (error as Error).message);
        }
      });
    });
  });
});
