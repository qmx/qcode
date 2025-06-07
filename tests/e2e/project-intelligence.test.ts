import { QCodeEngine } from '../../src/core/engine.js';
import { OllamaClient } from '../../src/core/client.js';
import { ToolRegistry } from '../../src/core/registry.js';
import { FilesTool } from '../../src/tools/files.js';
import { ProjectIntelligenceTool } from '../../src/tools/project-intelligence.js';
import { WorkspaceSecurity } from '../../src/security/workspace.js';
import { getDefaultConfig } from '../../src/config/defaults.js';
import { setupVCRTests } from '../helpers/vcr-helper.js';
import { TEST_WORKSPACE } from '../setup.js';

describe('Project Intelligence E2E Tests', () => {
  let engine: QCodeEngine;
  const vcr = setupVCRTests(__filename);

  beforeEach(() => {
    // Setup real engine with all components
    const config = getDefaultConfig(TEST_WORKSPACE);
    const client = new OllamaClient({ ...config.ollama, retries: 0 });
    const workspaceSecurity = new WorkspaceSecurity(config.security, TEST_WORKSPACE);
    const toolRegistry = new ToolRegistry(config.security, TEST_WORKSPACE);

    // Register files tool
    const filesTool = new FilesTool(workspaceSecurity);
    toolRegistry.registerInternalTool(
      'files',
      filesTool.definition,
      filesTool.execute.bind(filesTool)
    );

    // Register project intelligence tool
    const projectIntelligenceTool = new ProjectIntelligenceTool(workspaceSecurity);
    toolRegistry.registerInternalTool(
      'project',
      projectIntelligenceTool.definition,
      projectIntelligenceTool.execute.bind(projectIntelligenceTool)
    );

    engine = new QCodeEngine(client, toolRegistry, config, {
      workingDirectory: TEST_WORKSPACE,
      enableStreaming: false,
      debug: false,
    });
  });

  describe('Project Analysis Function Calling', () => {
    it('should analyze project structure through LLM function calling', async () => {
      await vcr.withRecording('project_analysis_structure', async () => {
        const response = await engine.processQuery('analyze the structure of this project');

        // Test that LLM chose to use project intelligence tool
        expect(response.complete).toBe(true);
        expect(response.toolsExecuted.length).toBeGreaterThan(0);
        expect(response.toolsExecuted.some(tool => tool.includes('project'))).toBe(true);

        // Test that response contains project analysis
        expect(response.response.length).toBeGreaterThan(0);
        expect(typeof response.response).toBe('string');

        vcr.recordingLog('✓ Project analysis response:', response.response);
        vcr.recordingLog('✓ Tools executed:', response.toolsExecuted);
      });
    });

    it('should understand project technologies through LLM function calling', async () => {
      await vcr.withRecording('project_understand_technologies', async () => {
        const response = await engine.processQuery(
          'what technologies and frameworks are used in this project?'
        );

        expect(response.complete).toBe(true);
        expect(response.toolsExecuted.length).toBeGreaterThan(0);
        expect(response.toolsExecuted.some(tool => tool.includes('project'))).toBe(true);

        // Should provide technology insights
        expect(response.response.length).toBeGreaterThan(0);
        expect(typeof response.response).toBe('string');

        vcr.recordingLog('✓ Technology analysis response:', response.response);
        vcr.recordingLog('✓ Tools executed:', response.toolsExecuted);
      });
    });

    it('should summarize project for developers through LLM function calling', async () => {
      await vcr.withRecording('project_summarize_developer', async () => {
        const response = await engine.processQuery(
          'give me a technical summary of this project for a developer'
        );

        expect(response.complete).toBe(true);
        expect(response.toolsExecuted.length).toBeGreaterThan(0);
        expect(response.toolsExecuted.some(tool => tool.includes('project'))).toBe(true);

        // Should provide developer-focused summary
        expect(response.response.length).toBeGreaterThan(0);
        expect(typeof response.response).toBe('string');

        vcr.recordingLog('✓ Developer summary response:', response.response);
        vcr.recordingLog('✓ Tools executed:', response.toolsExecuted);
      });
    });

    it('should handle project understanding queries with specific focus', async () => {
      await vcr.withRecording('project_understand_architecture', async () => {
        const response = await engine.processQuery(
          'help me understand the architecture patterns used in this codebase'
        );

        expect(response.complete).toBe(true);
        expect(response.toolsExecuted.length).toBeGreaterThan(0);
        expect(response.toolsExecuted.some(tool => tool.includes('project'))).toBe(true);

        // Should provide architecture insights
        expect(response.response.length).toBeGreaterThan(0);

        vcr.recordingLog('✓ Architecture understanding response:', response.response);
        vcr.recordingLog('✓ Tools executed:', response.toolsExecuted);
      });
    });

    it('should analyze project dependencies and configuration', async () => {
      await vcr.withRecording('project_analyze_dependencies', async () => {
        const response = await engine.processQuery(
          'analyze the dependencies and configuration of this project'
        );

        expect(response.complete).toBe(true);
        expect(response.toolsExecuted.length).toBeGreaterThan(0);
        expect(response.toolsExecuted.some(tool => tool.includes('project'))).toBe(true);

        // Should provide dependency analysis
        expect(response.response.length).toBeGreaterThan(0);

        vcr.recordingLog('✓ Dependencies analysis response:', response.response);
        vcr.recordingLog('✓ Tools executed:', response.toolsExecuted);
      });
    });
  });

  describe('Multi-Step Project Analysis Workflows', () => {
    it('should perform comprehensive project analysis workflow', async () => {
      await vcr.withRecording('project_comprehensive_analysis', async () => {
        const response = await engine.processQuery(
          'give me a comprehensive analysis of this project including structure, technologies, and recommendations'
        );

        expect(response.complete).toBe(true);
        expect(response.toolsExecuted.length).toBeGreaterThan(0);

        // May use multiple tools including project intelligence
        expect(response.toolsExecuted.some(tool => tool.includes('project'))).toBe(true);

        // Should provide comprehensive analysis
        expect(response.response.toLowerCase()).toMatch(/(analysis|structure|technolog|recommend)/);

        vcr.recordingLog('✓ Comprehensive analysis response:', response.response);
        vcr.recordingLog('✓ Tools executed:', response.toolsExecuted);
        vcr.recordingLog('✓ Multi-step workflow completed');
      });
    });

    it('should combine file operations with project intelligence', async () => {
      await vcr.withRecording('project_files_and_analysis', async () => {
        const response = await engine.processQuery(
          'analyze the project structure and show me the key configuration files'
        );

        expect(response.complete).toBe(true);
        expect(response.toolsExecuted.length).toBeGreaterThan(0);

        // Should use both files and project tools
        const toolsUsed = response.toolsExecuted;
        expect(toolsUsed.some(tool => tool.includes('project'))).toBe(true);
        // May also use files tool for configuration discovery

        // LLM-centric approach may provide different responses, just ensure we get a meaningful response
        expect(response.response.length).toBeGreaterThan(10);

        vcr.recordingLog('✓ Combined analysis response:', response.response);
        vcr.recordingLog('✓ Tools executed:', response.toolsExecuted);
        vcr.recordingLog('✓ Multi-tool workflow completed');
      });
    });
  });

  describe('Project Intelligence Error Handling', () => {
    it('should handle ambiguous project queries gracefully', async () => {
      await vcr.withRecording('project_ambiguous_query', async () => {
        const response = await engine.processQuery('tell me about the project stuff and things');

        expect(response.complete).toBe(true);

        // LLM should either ask for clarification or provide general analysis
        expect(response.response).toBeDefined();
        expect(response.response.length).toBeGreaterThan(0);

        vcr.recordingLog('✓ Ambiguous query response:', response.response);
        vcr.recordingLog('✓ Tools executed:', response.toolsExecuted);
      });
    });

    it('should reject non-project related queries', async () => {
      await vcr.withRecording('project_non_project_query', async () => {
        const response = await engine.processQuery('what is the weather like today?');

        expect(response.complete).toBe(true);

        // Should not use project intelligence tool for weather queries
        expect(response.toolsExecuted).not.toContain('internal:project');

        // Should politely decline or redirect to project-related assistance
        expect(response.response).toBeDefined();

        vcr.recordingLog('✓ Non-project query response:', response.response);
        vcr.recordingLog('✓ Tools executed:', response.toolsExecuted);
        vcr.recordingLog('✓ Correctly avoided project tool for non-project query');
      });
    });

    it('should handle project analysis with insufficient information', async () => {
      await vcr.withRecording('project_insufficient_info', async () => {
        const response = await engine.processQuery(
          'analyze the advanced microservices architecture patterns in this project'
        );

        expect(response.complete).toBe(true);
        expect(response.toolsExecuted.length).toBeGreaterThan(0);

        // Should use project tool but provide honest assessment
        if (response.toolsExecuted.includes('internal:project')) {
          expect(response.response).toBeDefined();
          // Should be honest about limitations in placeholder implementation
          expect(response.response.toLowerCase()).toMatch(/(placeholder|implement|not yet)/);
        }

        vcr.recordingLog('✓ Insufficient info response:', response.response);
        vcr.recordingLog('✓ Tools executed:', response.toolsExecuted);
      });
    });
  });

  describe('Project Intelligence Context Integration', () => {
    it('should maintain context across project analysis queries', async () => {
      await vcr.withRecording('project_context_persistence', async () => {
        // First query to establish context
        const firstResponse = await engine.processQuery('analyze this project structure');
        expect(firstResponse.complete).toBe(true);

        // Follow-up query that should use established context
        const secondResponse = await engine.processQuery(
          'based on that analysis, what improvements would you recommend?'
        );
        expect(secondResponse.complete).toBe(true);

        // Should maintain context and provide relevant recommendations
        expect(secondResponse.response).toBeDefined();
        expect(secondResponse.response.toLowerCase()).toMatch(/(recommend|improve|suggest)/);

        vcr.recordingLog('✓ First analysis response:', firstResponse.response);
        vcr.recordingLog('✓ Follow-up recommendations:', secondResponse.response);
        vcr.recordingLog('✓ Context maintained across queries');
      });
    });

    it('should integrate project understanding with code queries', async () => {
      await vcr.withRecording('project_code_integration', async () => {
        const response = await engine.processQuery(
          'understand the project architecture and show me how error handling is implemented'
        );

        expect(response.complete).toBe(true);
        // Tool may or may not be executed depending on LLM decision
        if (response.toolsExecuted.length > 0) {
          expect(
            response.toolsExecuted.some(tool => tool.includes('project') || tool.includes('files'))
          ).toBe(true);
        }

        // Should combine project analysis with code investigation
        expect(response.response.length).toBeGreaterThan(0);

        vcr.recordingLog('✓ Integrated analysis response:', response.response);
        vcr.recordingLog('✓ Tools executed:', response.toolsExecuted);
        vcr.recordingLog('✓ Project-code integration completed');
      });
    });
  });

  describe('Project Intelligence Performance', () => {
    it('should complete project analysis within reasonable time', async () => {
      await vcr.withRecording('project_performance_test', async () => {
        const startTime = Date.now();

        const response = await engine.processQuery(
          'analyze the project structure and technologies used'
        );

        const executionTime = Date.now() - startTime;

        expect(response.complete).toBe(true);
        expect(response.toolsExecuted.length).toBeGreaterThan(0);
        expect(executionTime).toBeLessThan(30000); // Should complete within 30 seconds

        vcr.recordingLog('✓ Analysis completed in:', `${executionTime}ms`);
        vcr.recordingLog('✓ Performance test response:', response.response);
        vcr.recordingLog('✓ Tools executed:', response.toolsExecuted);
      });
    });

    it('should handle large project analysis efficiently', async () => {
      await vcr.withRecording('project_large_analysis', async () => {
        const response = await engine.processQuery(
          'perform a comprehensive deep analysis of the entire project including all subsystems and dependencies'
        );

        expect(response.complete).toBe(true);
        expect(response.toolsExecuted.length).toBeGreaterThan(0);

        // Should provide analysis even for complex requests
        expect(response.response).toBeDefined();
        expect(response.response.length).toBeGreaterThan(50);

        vcr.recordingLog('✓ Large analysis response:', response.response);
        vcr.recordingLog('✓ Tools executed:', response.toolsExecuted);
        vcr.recordingLog('✓ Handled complex analysis request');
      });
    });
  });

  describe('Real-World Project Intelligence Scenarios', () => {
    it('should help new developers understand the project', async () => {
      await vcr.withRecording('project_new_developer_onboarding', async () => {
        const response = await engine.processQuery(
          "I'm new to this project. Can you help me understand what it does and how it's organized?"
        );

        expect(response.complete).toBe(true);
        expect(response.toolsExecuted.length).toBeGreaterThan(0);

        // Should provide newcomer-friendly explanation
        expect(response.response).toBeDefined();
        expect(response.response.toLowerCase()).toMatch(/(project|organiz|understand)/);

        vcr.recordingLog('✓ New developer onboarding response:', response.response);
        vcr.recordingLog('✓ Tools executed:', response.toolsExecuted);
      });
    });

    it('should assist with architectural decision making', async () => {
      await vcr.withRecording('project_architectural_decisions', async () => {
        const response = await engine.processQuery(
          'what are the current architectural patterns in this project and how do they fit together?'
        );

        expect(response.complete).toBe(true);
        expect(response.toolsExecuted.length).toBeGreaterThan(0);

        // Should provide architectural insights
        expect(response.response.toLowerCase()).toMatch(/(architect|pattern|structure)/);

        vcr.recordingLog('✓ Architectural decisions response:', response.response);
        vcr.recordingLog('✓ Tools executed:', response.toolsExecuted);
      });
    });

    it('should support code review and quality assessment', async () => {
      await vcr.withRecording('project_code_quality_assessment', async () => {
        const response = await engine.processQuery(
          'assess the overall code quality and identify areas for improvement in this project'
        );

        expect(response.complete).toBe(true);
        expect(response.toolsExecuted.length).toBeGreaterThan(0);

        // Should provide quality assessment
        expect(response.response.toLowerCase()).toMatch(/(quality|improv|assess)/);

        vcr.recordingLog('✓ Code quality assessment response:', response.response);
        vcr.recordingLog('✓ Tools executed:', response.toolsExecuted);
      });
    });

    it('should help with technology migration planning', async () => {
      await vcr.withRecording('project_migration_planning', async () => {
        const response = await engine.processQuery(
          'analyze the current technology stack and suggest what would be involved in modernizing this project'
        );

        expect(response.complete).toBe(true);
        expect(response.toolsExecuted.length).toBeGreaterThan(0);

        // Should provide migration insights
        expect(response.response.toLowerCase()).toMatch(/(technolog|modern|stack|migrat)/);

        vcr.recordingLog('✓ Migration planning response:', response.response);
        vcr.recordingLog('✓ Tools executed:', response.toolsExecuted);
      });
    });
  });
});
