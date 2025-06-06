import { ProjectIntelligenceTool } from '../../src/tools/project-intelligence.js';
import { WorkspaceSecurity } from '../../src/security/workspace.js';
import { getDefaultConfig } from '../../src/config/defaults.js';
import { TEST_WORKSPACE } from '../setup.js';

describe('ProjectIntelligenceTool', () => {
  let projectIntelligenceTool: ProjectIntelligenceTool;
  let workspaceSecurity: WorkspaceSecurity;

  beforeEach(() => {
    const securityConfig = getDefaultConfig(TEST_WORKSPACE).security;
    workspaceSecurity = new WorkspaceSecurity(securityConfig, TEST_WORKSPACE);
    projectIntelligenceTool = new ProjectIntelligenceTool(workspaceSecurity);
  });

  describe('Basic Structure', () => {
    it('should have correct namespace and name', () => {
      expect(projectIntelligenceTool.namespace).toBe('internal');
      expect(projectIntelligenceTool.name).toBe('project');
      expect(projectIntelligenceTool.fullName).toBe('internal:project');
    });

    it('should provide a valid tool definition', () => {
      const definition = projectIntelligenceTool.definition;

      expect(definition.name).toBe('project');
      expect(definition.description).toContain('project structure');
      expect(definition.description).toContain('architecture');
      expect(definition.description).toContain('patterns');
      expect(definition.parameters.type).toBe('object');
      expect(definition.parameters.properties.operation).toBeDefined();
      expect(definition.parameters.required).toContain('operation');
    });

    it('should validate operation parameter in tool definition', () => {
      const definition = projectIntelligenceTool.definition;
      const operationProp = definition.parameters.properties.operation;

      expect(operationProp.enum).toEqual(['analyze', 'understand', 'summarize']);
      expect(operationProp.description).toContain('project intelligence operation');
    });

    it('should have all required parameters in tool definition', () => {
      const definition = projectIntelligenceTool.definition;
      const properties = definition.parameters.properties;

      // Core operation parameter
      expect(properties.operation).toBeDefined();

      // Analyze operation parameters
      expect(properties.scope).toBeDefined();
      expect(properties.depth).toBeDefined();
      expect(properties.includeCode).toBeDefined();
      expect(properties.includeConfigs).toBeDefined();
      expect(properties.includeDocs).toBeDefined();

      // Understand operation parameters
      expect(properties.focus).toBeDefined();
      expect(properties.target).toBeDefined();
      expect(properties.context).toBeDefined();

      // Summarize operation parameters
      expect(properties.format).toBeDefined();
      expect(properties.audience).toBeDefined();
      expect(properties.includeMetrics).toBeDefined();
      expect(properties.includeRecommendations).toBeDefined();
    });
  });

  describe('Schema Validation', () => {
    it('should accept valid analyze operation parameters', async () => {
      const validParams = {
        operation: 'analyze',
        scope: 'full',
        depth: 'detailed',
        includeCode: true,
        includeConfigs: true,
        includeDocs: true,
      };

      const result = await projectIntelligenceTool.execute(validParams);
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.namespace).toBe('internal');
      expect(result.tool).toBe('project');
    });

    it('should accept valid understand operation parameters', async () => {
      const validParams = {
        operation: 'understand',
        focus: 'technologies',
        target: 'src/auth',
        context: 'preparing to add authentication',
      };

      const result = await projectIntelligenceTool.execute(validParams);
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.namespace).toBe('internal');
      expect(result.tool).toBe('project');
    });

    it('should accept valid summarize operation parameters', async () => {
      const validParams = {
        operation: 'summarize',
        format: 'detailed',
        audience: 'developer',
        includeMetrics: true,
        includeRecommendations: true,
      };

      const result = await projectIntelligenceTool.execute(validParams);
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.namespace).toBe('internal');
      expect(result.tool).toBe('project');
    });

    it('should reject invalid operation parameter', async () => {
      const invalidParams = {
        operation: 'invalid_operation',
      };

      const result = await projectIntelligenceTool.execute(invalidParams);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid discriminator value');
    });

    it('should reject missing operation parameter', async () => {
      const invalidParams = {};

      const result = await projectIntelligenceTool.execute(invalidParams);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid discriminator value');
    });

    it('should apply default values for optional parameters', async () => {
      const minimalParams = {
        operation: 'analyze',
      };

      const result = await projectIntelligenceTool.execute(minimalParams);
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });
  });

  describe('Operation Results', () => {
    describe('Analyze Operation', () => {
      it('should return structured analyze result', async () => {
        const params = {
          operation: 'analyze',
          scope: 'full',
          depth: 'detailed',
        };

        const result = await projectIntelligenceTool.execute(params);
        expect(result.success).toBe(true);

        const data = result.data;
        expect(data.overview).toBeDefined();
        expect(data.structure).toBeDefined();
        expect(data.dependencies).toBeDefined();
        expect(data.architecture).toBeDefined();
        expect(data.codeAnalysis).toBeDefined();
        expect(data.metadata).toBeDefined();

        // Check overview structure
        expect(data.overview.name).toBeDefined();
        expect(data.overview.type).toBeDefined();
        expect(data.overview.languages).toBeInstanceOf(Array);
        expect(data.overview.frameworks).toBeInstanceOf(Array);
        expect(data.overview.technologies).toBeInstanceOf(Array);

        // Check metadata
        expect(data.metadata.analyzedAt).toBeInstanceOf(Date);
        expect(data.metadata.scope).toBe('full');
        expect(typeof data.metadata.confidence).toBe('number');
      });
    });

    describe('Understand Operation', () => {
      it('should return structured understand result', async () => {
        const params = {
          operation: 'understand',
          focus: 'technologies',
        };

        const result = await projectIntelligenceTool.execute(params);
        expect(result.success).toBe(true);

        const data = result.data;
        expect(data.understanding).toBeDefined();
        expect(data.context).toBeDefined();
        expect(data.metadata).toBeDefined();

        // Check understanding structure
        expect(data.understanding.focus).toBe('technologies');
        expect(data.understanding.summary).toBeDefined();
        expect(data.understanding.insights).toBeInstanceOf(Array);
        expect(data.understanding.relationships).toBeInstanceOf(Array);

        // Check metadata
        expect(data.metadata.understoodAt).toBeInstanceOf(Date);
        expect(typeof data.metadata.confidence).toBe('number');
      });
    });

    describe('Summarize Operation', () => {
      it('should return structured summarize result', async () => {
        const params = {
          operation: 'summarize',
          format: 'detailed',
          audience: 'developer',
        };

        const result = await projectIntelligenceTool.execute(params);
        expect(result.success).toBe(true);

        const data = result.data;
        expect(data.summary).toBeDefined();
        expect(data.metadata).toBeDefined();

        // Check summary structure
        expect(data.summary.overview).toBeDefined();
        expect(data.summary.technologies).toBeInstanceOf(Array);
        expect(data.summary.keyFeatures).toBeInstanceOf(Array);

        // Check metadata
        expect(data.metadata.summarizedAt).toBeInstanceOf(Date);
        expect(data.metadata.format).toBe('detailed');
        expect(data.metadata.audience).toBe('developer');
      });

      it('should include optional sections when requested', async () => {
        const params = {
          operation: 'summarize',
          format: 'detailed',
          includeMetrics: true,
          includeRecommendations: true,
        };

        const result = await projectIntelligenceTool.execute(params);
        expect(result.success).toBe(true);

        const data = result.data;
        expect(data.metrics).toBeDefined();
        expect(data.recommendations).toBeDefined();

        // Check metrics structure
        expect(typeof data.metrics.linesOfCode).toBe('number');
        expect(typeof data.metrics.files).toBe('number');
        expect(typeof data.metrics.directories).toBe('number');

        // Check recommendations structure
        expect(data.recommendations.improvements).toBeInstanceOf(Array);
        expect(data.recommendations.optimizations).toBeInstanceOf(Array);
        expect(data.recommendations.bestPractices).toBeInstanceOf(Array);
        expect(data.recommendations.nextSteps).toBeInstanceOf(Array);
      });

      it('should not include optional sections when not requested', async () => {
        const params = {
          operation: 'summarize',
          format: 'brief',
          includeMetrics: false,
          includeRecommendations: false,
        };

        const result = await projectIntelligenceTool.execute(params);
        expect(result.success).toBe(true);

        const data = result.data;
        expect(data.metrics).toBeUndefined();
        expect(data.recommendations).toBeUndefined();
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle execution errors gracefully', async () => {
      const params = {
        operation: 'analyze',
        scope: 'invalid_scope' as any, // Force an error
      };

      const result = await projectIntelligenceTool.execute(params);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(result.namespace).toBe('internal');
      expect(result.tool).toBe('project');
    });

    it('should provide meaningful error messages', async () => {
      const params = {
        operation: 'understand',
        focus: 'invalid_focus' as any,
      };

      const result = await projectIntelligenceTool.execute(params);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid enum value');
    });
  });

  describe('Performance and Timing', () => {
    it('should track execution duration', async () => {
      const params = {
        operation: 'analyze',
        scope: 'structure',
      };

      const result = await projectIntelligenceTool.execute(params);
      expect(result.success).toBe(true);
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(typeof result.duration).toBe('number');
    });

    it('should complete operations within reasonable time', async () => {
      const params = {
        operation: 'summarize',
        format: 'brief',
      };

      const startTime = Date.now();
      const result = await projectIntelligenceTool.execute(params);
      const executionTime = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(executionTime).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });

  describe('Debug Mode', () => {
    it('should handle debug context', async () => {
      const params = {
        operation: 'analyze',
        scope: 'structure',
      };

      const context = { debug: true };

      const result = await projectIntelligenceTool.execute(params, context);
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });
  });
});
