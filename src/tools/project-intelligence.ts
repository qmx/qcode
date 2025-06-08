import { z } from 'zod';
import { NamespacedTool, ToolDefinition, ToolResult, QCodeError } from '../types.js';
import { WorkspaceSecurity } from '../security/workspace.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger();


/**
 * Zod schemas for project intelligence operation parameters
 */

// Analyze project operation schema
const AnalyzeProjectSchema = z.object({
  operation: z.literal('analyze'),
  scope: z
    .enum(['full', 'structure', 'dependencies', 'architecture', 'patterns'])
    .default('full')
    .optional(),
  depth: z.enum(['basic', 'detailed', 'comprehensive']).default('detailed').optional(),
  includeCode: z.coerce.boolean().default(true).optional(),
  includeConfigs: z.coerce.boolean().default(true).optional(),
  includeDocs: z.coerce.boolean().default(true).optional(),
});

// Understand project operation schema
const UnderstandProjectSchema = z.object({
  operation: z.literal('understand'),
  focus: z
    .enum([
      'technologies',
      'frameworks',
      'conventions',
      'architecture',
      'domain',
      'patterns',
      'structure',
    ])
    .optional(),
  target: z.string().optional(), // specific file, directory, or component to understand
  context: z.string().optional(), // additional context about what to understand
});

// Summarize project operation schema
const SummarizeProjectSchema = z.object({
  operation: z.literal('summarize'),
  format: z.enum(['brief', 'detailed', 'technical', 'executive']).default('detailed').optional(),
  audience: z.enum(['developer', 'manager', 'team', 'stakeholder']).default('developer').optional(),
  includeMetrics: z.coerce.boolean().default(false).optional(),
  includeRecommendations: z.coerce.boolean().default(true).optional(),
});

// Union schema for all project intelligence operations
const ProjectIntelligenceSchema = z.discriminatedUnion('operation', [
  AnalyzeProjectSchema,
  UnderstandProjectSchema,
  SummarizeProjectSchema,
]);

/**
 * Type definitions for project intelligence operations
 */
export type AnalyzeProjectParams = z.infer<typeof AnalyzeProjectSchema>;
export type UnderstandProjectParams = z.infer<typeof UnderstandProjectSchema>;
export type SummarizeProjectParams = z.infer<typeof SummarizeProjectSchema>;
export type ProjectIntelligenceParams = z.infer<typeof ProjectIntelligenceSchema>;

/**
 * Result types for project intelligence operations
 */
export interface AnalyzeProjectResult {
  /** Project overview and summary */
  overview: {
    name: string;
    type: string;
    description: string;
    primaryLanguage: string;
    languages: string[];
    frameworks: string[];
    technologies: string[];
  };
  /** Project structure analysis */
  structure: {
    directories: string[];
    keyFiles: string[];
    configFiles: string[];
    entryPoints: string[];
    testFiles: string[];
  };
  /** Dependency analysis */
  dependencies: {
    production: Record<string, string>;
    development: Record<string, string>;
    packageManager: string;
    lockFile?: string;
  };
  /** Architecture patterns */
  architecture: {
    patterns: string[];
    layering: string[];
    organization: string;
    conventions: Record<string, string>;
  };
  /** Code patterns and quality */
  codeAnalysis: {
    patterns: string[];
    conventions: Record<string, string>;
    quality: {
      score: number;
      issues: string[];
      strengths: string[];
    };
  };
  /** Analysis metadata */
  metadata: {
    analyzedAt: Date;
    filesAnalyzed: number;
    confidence: number;
    scope: string;
  };
}

export interface UnderstandProjectResult {
  /** Focus area understanding */
  understanding: {
    focus: string;
    summary: string;
    details: Record<string, any>;
    insights: string[];
    relationships: string[];
  };
  /** Context and recommendations */
  context: {
    relevantFiles: string[];
    relatedComponents: string[];
    dependencies: string[];
    patterns: string[];
  };
  /** Understanding metadata */
  metadata: {
    understoodAt: Date;
    confidence: number;
    scope: string;
  };
}

export interface SummarizeProjectResult {
  /** Project summary */
  summary: {
    overview: string;
    technologies: string[];
    keyFeatures: string[];
    architecture: string;
    status: string;
  };
  /** Detailed analysis (if requested) */
  details?: {
    structure: string;
    patterns: string[];
    conventions: Record<string, string>;
    dependencies: string[];
  };
  /** Metrics (if requested) */
  metrics?: {
    linesOfCode: number;
    files: number;
    directories: number;
    dependencies: number;
    testCoverage?: number;
  };
  /** Recommendations (if requested) */
  recommendations?: {
    improvements: string[];
    optimizations: string[];
    bestPractices: string[];
    nextSteps: string[];
  };
  /** Summary metadata */
  metadata: {
    summarizedAt: Date;
    format: string;
    audience: string;
  };
}

/**
 * ProjectIntelligenceTool class - Deep project understanding and analysis
 *
 * This tool transforms QCode from a generic file browser into a project-aware
 * coding partner that understands specific codebase patterns, conventions,
 * and architecture across multiple programming languages and frameworks.
 */
export class ProjectIntelligenceTool implements NamespacedTool {
  public readonly namespace = 'internal';
  public readonly name = 'project';
  public readonly fullName = 'internal:project';

  private workspaceSecurity: WorkspaceSecurity;
  private ollamaConfig: any;

  constructor(workspaceSecurity: WorkspaceSecurity, ollamaConfig?: any) {
    this.workspaceSecurity = workspaceSecurity;
    this.ollamaConfig = ollamaConfig || {
      url: 'http://localhost:11434',
      model: 'llama3.1:8b',
      timeout: 30000,
      retries: 2,
      temperature: 0.1,
      stream: false,
    };
  }

  /**
   * Tool definition for Ollama function calling
   */
  public get definition(): ToolDefinition {
    return {
      name: 'project',
      description:
        'Analyze and understand project structure, architecture, patterns, and conventions to provide intelligent, context-aware coding assistance',
      parameters: {
        type: 'object',
        properties: {
          operation: {
            type: 'string',
            enum: ['analyze', 'understand', 'summarize'],
            description: 'The type of project intelligence operation to perform',
          },
          scope: {
            type: 'string',
            enum: ['full', 'structure', 'dependencies', 'architecture', 'patterns'],
            description:
              'Scope of analysis: full project, structure only, dependencies, architecture patterns, or code patterns',
            default: 'full',
          },
          depth: {
            type: 'string',
            enum: ['basic', 'detailed', 'comprehensive'],
            description:
              'Depth of analysis: basic overview, detailed analysis, or comprehensive deep-dive',
            default: 'detailed',
          },
          focus: {
            type: 'string',
            enum: [
              'technologies',
              'frameworks',
              'conventions',
              'architecture',
              'domain',
              'patterns',
              'structure',
            ],
            description:
              'Specific focus area for understanding: technologies used, frameworks, naming conventions, architecture patterns, business domain, code patterns, or file structure',
          },
          target: {
            type: 'string',
            description:
              'Specific file, directory, or component to understand (e.g., "src/auth", "components/Header.tsx")',
          },
          context: {
            type: 'string',
            description:
              'Additional context about what to understand or why (e.g., "preparing to add authentication", "refactoring for better performance")',
          },
          format: {
            type: 'string',
            enum: ['brief', 'detailed', 'technical', 'executive'],
            description:
              'Format of summary: brief overview, detailed analysis, technical deep-dive, or executive summary',
            default: 'detailed',
          },
          audience: {
            type: 'string',
            enum: ['developer', 'manager', 'team', 'stakeholder'],
            description:
              'Target audience for the summary to adjust language and focus appropriately',
            default: 'developer',
          },
          includeCode: {
            type: 'boolean',
            description: 'Whether to include code samples and patterns in the analysis',
            default: true,
          },
          includeConfigs: {
            type: 'boolean',
            description: 'Whether to include configuration files in the analysis',
            default: true,
          },
          includeDocs: {
            type: 'boolean',
            description: 'Whether to include documentation files in the analysis',
            default: true,
          },
          includeMetrics: {
            type: 'boolean',
            description: 'Whether to include quantitative metrics in the summary',
            default: false,
          },
          includeRecommendations: {
            type: 'boolean',
            description: 'Whether to include actionable recommendations',
            default: true,
          },
        },
        required: ['operation'],
        additionalProperties: false,
      },
    };
  }

  /**
   * Execute project intelligence operation with optional context
   */
  public async execute(args: Record<string, any>, context?: any): Promise<ToolResult> {
    const startTime = Date.now();
    const debugEnabled = context?.debug || false;

    if (debugEnabled) {
      logger.debug(`🧠 [DEBUG PROJECT] Execute called with args: ${JSON.stringify(args, null, 2)}`);
      logger.debug(`🧠 [DEBUG PROJECT] Context: ${JSON.stringify(context, null, 2)}`);
    }

    try {
      // Validate and parse operation parameters
      const params = ProjectIntelligenceSchema.parse(args);

      if (debugEnabled) {
        logger.debug(`🧠 [DEBUG PROJECT] Parsed params: ${JSON.stringify(params, null, 2)}`);
      }

      // Route to appropriate operation handler
      let result: any;

      switch (params.operation) {
        case 'analyze':
          if (debugEnabled) {
            logger.debug(`🧠 [DEBUG PROJECT] Executing analyze operation`);
          }
          result = await this.analyzeProject(params);
          break;

        case 'understand':
          if (debugEnabled) {
            logger.debug(`🧠 [DEBUG PROJECT] Executing understand operation`);
          }
          result = await this.understandProject(params);
          break;

        case 'summarize':
          if (debugEnabled) {
            logger.debug(`🧠 [DEBUG PROJECT] Executing summarize operation`);
          }
          result = await this.summarizeProject(params);
          break;

        default:
          throw new QCodeError(
            `Unknown project intelligence operation: ${(params as any).operation}`,
            'INVALID_OPERATION'
          );
      }

      const duration = Date.now() - startTime;

      if (debugEnabled) {
        logger.debug(`🧠 [DEBUG PROJECT] Operation completed in ${duration}ms`);
      }

      return {
        success: true,
        data: result,
        duration,
        tool: this.name,
        namespace: this.namespace,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      if (error instanceof QCodeError) {
        if (debugEnabled) {
          logger.debug(`🧠 [DEBUG PROJECT] QCodeError: ${error.message}`);
        }
        return {
          success: false,
          error: error.message,
          duration,
          tool: this.name,
          namespace: this.namespace,
        };
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      logger.error(`Project intelligence operation failed: ${errorMessage}`);

      if (debugEnabled) {
        logger.debug(`🧠 [DEBUG PROJECT] Unexpected error: ${errorMessage}`);
      }

      return {
        success: false,
        error: `Project intelligence operation failed: ${errorMessage}`,
        duration,
        tool: this.name,
        namespace: this.namespace,
      };
    }
  }

  /**
   * Analyze project structure, architecture, and patterns
   */
  private async analyzeProject(params: AnalyzeProjectParams): Promise<AnalyzeProjectResult> {
    // Validate workspace access
    try {
      await this.workspaceSecurity.validateWorkspacePath('.');
    } catch (error) {
      throw new QCodeError(
        'Workspace access denied for project analysis',
        'WORKSPACE_ACCESS_DENIED'
      );
    }

    const workingDirectory = this.workspaceSecurity.getWorkingDirectory();
    const analyzedAt = new Date();

    // Collect project information
    const packageInfo = await this.analyzePackageJson(workingDirectory);
    const projectStructure = await this.analyzeProjectStructure(workingDirectory);
    const codeAnalysis = await this.analyzeCodePatterns(workingDirectory);
    const techStack = await this.analyzeTechStack(workingDirectory);

    return {
      overview: {
        name: packageInfo.name || 'Unknown Project',
        type: this.determineProjectType(packageInfo, projectStructure),
        description: packageInfo.description || 'No description available',
        primaryLanguage: techStack.primaryLanguage,
        languages: techStack.languages,
        frameworks: techStack.frameworks,
        technologies: techStack.technologies,
      },
      structure: projectStructure,
      dependencies: packageInfo.dependencies,
      architecture: {
        patterns: codeAnalysis.patterns,
        layering: codeAnalysis.layering,
        organization: codeAnalysis.organization,
        conventions: codeAnalysis.conventions,
      },
      codeAnalysis: {
        patterns: codeAnalysis.patterns,
        conventions: codeAnalysis.conventions,
        quality: {
          score: codeAnalysis.patterns.length > 0 ? 7 : 5,
          issues: [],
          strengths: codeAnalysis.patterns.map(p => `Uses ${p} pattern`),
        },
      },
      metadata: {
        analyzedAt,
        filesAnalyzed: projectStructure.keyFiles.length + projectStructure.configFiles.length,
        confidence: 8,
        scope: params.scope || 'full',
      },
    };
  }

  /**
   * Understand specific aspects of the project
   */
  private async understandProject(
    params: UnderstandProjectParams
  ): Promise<UnderstandProjectResult> {
    // Placeholder implementation - will be fully implemented in subsequent sections
    const understoodAt = new Date();

    return {
      understanding: {
        focus: params.focus || 'general',
        summary:
          'This is a placeholder implementation that will be enhanced with real project understanding',
        details: {},
        insights: ['Understanding not yet implemented'],
        relationships: [],
      },
      context: {
        relevantFiles: [],
        relatedComponents: [],
        dependencies: [],
        patterns: [],
      },
      metadata: {
        understoodAt,
        confidence: 0,
        scope: 'placeholder',
      },
    };
  }

  /**
   * Summarize project for different audiences and formats
   */
  private async summarizeProject(params: SummarizeProjectParams): Promise<SummarizeProjectResult> {
    // Placeholder implementation - will be fully implemented in subsequent sections
    const summarizedAt = new Date();

    const result: SummarizeProjectResult = {
      summary: {
        overview:
          'This is a placeholder implementation that will be enhanced with real project summarization',
        technologies: [],
        keyFeatures: [],
        architecture: 'unknown',
        status: 'analysis pending',
      },
      metadata: {
        summarizedAt,
        format: params.format || 'detailed',
        audience: params.audience || 'developer',
      },
    };

    // Add optional sections based on parameters
    if (params.format === 'detailed' || params.format === 'technical') {
      result.details = {
        structure: 'Structure analysis not yet implemented',
        patterns: [],
        conventions: {},
        dependencies: [],
      };
    }

    if (params.includeMetrics) {
      result.metrics = {
        linesOfCode: 0,
        files: 0,
        directories: 0,
        dependencies: 0,
      };
    }

    if (params.includeRecommendations) {
      result.recommendations = {
        improvements: ['Implement full project analysis capabilities'],
        optimizations: [],
        bestPractices: [],
        nextSteps: ['Continue with sections 1.7.7.2-1.7.7.17 of the implementation plan'],
      };
    }

    return result;
  }

  /**
   * Analyze package.json and extract project information
   */
  private async analyzePackageJson(workingDirectory: string): Promise<{
    name?: string;
    description?: string;
    dependencies: {
      production: Record<string, string>;
      development: Record<string, string>;
      packageManager: string;
    };
  }> {
    const fs = await import('fs/promises');
    const path = await import('path');

    try {
      const packageJsonPath = path.join(workingDirectory, 'package.json');
      const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(packageJsonContent);

      return {
        name: packageJson.name,
        description: packageJson.description,
        dependencies: {
          production: packageJson.dependencies || {},
          development: packageJson.devDependencies || {},
          packageManager: this.detectPackageManager(workingDirectory),
        },
      };
    } catch {
      return {
        dependencies: {
          production: {},
          development: {},
          packageManager: 'unknown',
        },
      };
    }
  }

  /**
   * Analyze project directory structure
   */
  private async analyzeProjectStructure(workingDirectory: string): Promise<{
    directories: string[];
    keyFiles: string[];
    configFiles: string[];
    entryPoints: string[];
    testFiles: string[];
  }> {
    const fs = await import('fs/promises');

    try {
      const items = await fs.readdir(workingDirectory, { withFileTypes: true });

      const directories: string[] = [];
      const keyFiles: string[] = [];
      const configFiles: string[] = [];
      const entryPoints: string[] = [];
      const testFiles: string[] = [];

      for (const item of items) {
        if (item.isDirectory()) {
          directories.push(item.name);
        } else {
          const fileName = item.name;

          // Categorize files
          if (this.isConfigFile(fileName)) {
            configFiles.push(fileName);
          }

          if (this.isEntryPoint(fileName)) {
            entryPoints.push(fileName);
          }

          if (this.isTestFile(fileName)) {
            testFiles.push(fileName);
          }

          if (this.isKeyFile(fileName)) {
            keyFiles.push(fileName);
          }
        }
      }

      return {
        directories,
        keyFiles,
        configFiles,
        entryPoints,
        testFiles,
      };
    } catch {
      return {
        directories: [],
        keyFiles: [],
        configFiles: [],
        entryPoints: [],
        testFiles: [],
      };
    }
  }

  /**
   * Analyze technology stack using LLM intelligence
   */
  private async analyzeTechStack(workingDirectory: string): Promise<{
    primaryLanguage: string;
    languages: string[];
    frameworks: string[];
    technologies: string[];
  }> {
    try {
      // Gather project files and structure
      const projectFiles = await this.gatherProjectFiles(workingDirectory);

      // Read key configuration files
      const configContents = await this.readKeyConfigFiles(
        workingDirectory,
        projectFiles.configFiles
      );

      // Use LLM to analyze the project
      const analysis = await this.analyzeProjectWithLLM(projectFiles, configContents);

      return {
        primaryLanguage: analysis.primaryLanguage || 'Unknown',
        languages: analysis.languages || [],
        frameworks: analysis.frameworks || [],
        technologies: analysis.technologies || [],
      };
    } catch (error) {
      logger.debug(`LLM tech stack analysis failed: ${error}`);

      // In test mode, fail hard to ensure VCR recordings are complete
      if (process.env.NODE_ENV === 'test') {
        throw new QCodeError(
          'LLM tech stack analysis failed in test mode - missing VCR recording?',
          'LLM_ANALYSIS_FAILED',
          { originalError: error instanceof Error ? error.message : String(error) }
        );
      }

      // No fallbacks - if LLM fails, we genuinely don't know
      return {
        primaryLanguage: 'Unknown',
        languages: [],
        frameworks: [],
        technologies: [],
      };
    }
  }

  /**
   * Gather project files and structure for LLM analysis
   */
  private async gatherProjectFiles(workingDirectory: string): Promise<{
    directories: string[];
    allFiles: string[];
    configFiles: string[];
    sourceFiles: string[];
  }> {
    const fs = await import('fs/promises');
    const path = await import('path');

    const directories: string[] = [];
    const allFiles: string[] = [];
    const configFiles: string[] = [];
    const sourceFiles: string[] = [];

    try {
      const items = await fs.readdir(workingDirectory, { withFileTypes: true });

      for (const item of items) {
        if (
          item.isDirectory() &&
          !item.name.startsWith('.') &&
          !['node_modules', 'target', 'build', 'dist'].includes(item.name)
        ) {
          directories.push(item.name);
        } else if (item.isFile()) {
          allFiles.push(item.name);

          // Identify config files
          if (this.isConfigFile(item.name)) {
            configFiles.push(item.name);
          }

          // Identify source files by extension
          const ext = path.extname(item.name).toLowerCase();
          if (
            [
              '.ts',
              '.js',
              '.py',
              '.swift',
              '.rs',
              '.go',
              '.java',
              '.cpp',
              '.c',
              '.rb',
              '.php',
              '.cs',
              '.kt',
            ].includes(ext)
          ) {
            sourceFiles.push(item.name);
          }
        }
      }
    } catch (error) {
      logger.debug(`Error gathering project files: ${error}`);
    }

    return { directories, allFiles, configFiles, sourceFiles };
  }

  /**
   * Read contents of key configuration files
   */
  private async readKeyConfigFiles(
    workingDirectory: string,
    configFiles: string[]
  ): Promise<Record<string, string>> {
    const fs = await import('fs/promises');
    const path = await import('path');
    const contents: Record<string, string> = {};

    // Priority config files to read (limit to most important ones)
    const priorityFiles = [
      'Package.swift',
      'Cargo.toml',
      'package.json',
      'requirements.txt',
      'go.mod',
      'pom.xml',
      'build.gradle',
      'pyproject.toml',
      'composer.json',
      'Gemfile',
      'tsconfig.json',
      '.swiftlint.yml',
      'Dockerfile',
      'docker-compose.yml',
    ];

    const filesToRead = configFiles
      .filter(file =>
        priorityFiles.some(priority => file.toLowerCase().includes(priority.toLowerCase()))
      )
      .slice(0, 8); // Limit to 8 files max

    for (const file of filesToRead) {
      try {
        const content = await fs.readFile(path.join(workingDirectory, file), 'utf-8');
        // Truncate very long files
        contents[file] = content.length > 2000 ? content.slice(0, 2000) + '...' : content;
      } catch (error) {
        logger.debug(`Could not read config file ${file}: ${error}`);
      }
    }

    return contents;
  }

  /**
   * Use LLM to analyze project structure and configuration
   */
  private async analyzeProjectWithLLM(
    projectFiles: {
      directories: string[];
      allFiles: string[];
      configFiles: string[];
      sourceFiles: string[];
    },
    configContents: Record<string, string>
  ): Promise<{
    primaryLanguage: string;
    languages: string[];
    frameworks: string[];
    technologies: string[];
  }> {
    // Import OllamaClient dynamically to avoid circular dependencies
    const { OllamaClient } = await import('../core/client.js');

    // Create LLM client using the provided config
    const ollamaClient = new OllamaClient(this.ollamaConfig);

    const prompt = `Analyze this project and identify its technologies, frameworks, and programming languages.

PROJECT STRUCTURE:
- Directories: ${projectFiles.directories.join(', ')}
- Config files: ${projectFiles.configFiles.join(', ')}
- Source files: ${projectFiles.sourceFiles.slice(0, 20).join(', ')}${projectFiles.sourceFiles.length > 20 ? '...' : ''}

CONFIGURATION FILE CONTENTS:
${Object.entries(configContents)
  .map(([file, content]) => `--- ${file} ---\n${content}`)
  .join('\n\n')}

Analyze this project and respond with a JSON object in this exact format:
{
  "primaryLanguage": "the main programming language",
  "languages": ["array", "of", "programming", "languages"],
  "frameworks": ["array", "of", "frameworks", "and", "libraries"], 
  "technologies": ["array", "of", "tools", "and", "technologies"]
}

Be comprehensive but accurate. For Swift projects, include Swift Package Manager, SwiftLint, etc. For Node.js, include npm/yarn, testing frameworks, etc. Only include what you can actually detect from the files.`;

    try {
      const response = await ollamaClient.generate(prompt);

      // Extract JSON from response - match balanced braces to avoid capturing extra text
      const jsonMatch = response.response.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/);
      if (jsonMatch) {
        try {
          const analysis = JSON.parse(jsonMatch[0]);
          return {
            primaryLanguage: analysis.primaryLanguage || 'Unknown',
            languages: Array.isArray(analysis.languages) ? analysis.languages : [],
            frameworks: Array.isArray(analysis.frameworks) ? analysis.frameworks : [],
            technologies: Array.isArray(analysis.technologies) ? analysis.technologies : [],
          };
        } catch (parseError) {
          // If JSON parsing fails, try a more aggressive approach
          const lines = response.response.split('\n');
          const jsonLines = [];
          let inJson = false;
          let braceCount = 0;

          for (const line of lines) {
            if (line.trim().startsWith('{')) {
              inJson = true;
              braceCount = 0;
            }

            if (inJson) {
              jsonLines.push(line);
              braceCount += (line.match(/\{/g) || []).length;
              braceCount -= (line.match(/\}/g) || []).length;

              if (braceCount === 0) {
                break;
              }
            }
          }

          if (jsonLines.length > 0) {
            const jsonStr = jsonLines.join('\n');
            const analysis = JSON.parse(jsonStr);
            return {
              primaryLanguage: analysis.primaryLanguage || 'Unknown',
              languages: Array.isArray(analysis.languages) ? analysis.languages : [],
              frameworks: Array.isArray(analysis.frameworks) ? analysis.frameworks : [],
              technologies: Array.isArray(analysis.technologies) ? analysis.technologies : [],
            };
          }

          throw parseError;
        }
      }

      throw new Error('No valid JSON found in LLM response');
    } catch (error) {
      logger.debug(`LLM analysis failed: ${error}`);
      throw error;
    }
  }

  /**
   * Analyze code patterns and conventions
   */
  private async analyzeCodePatterns(workingDirectory: string): Promise<{
    patterns: string[];
    layering: string[];
    organization: string;
    conventions: Record<string, string>;
  }> {
    const fs = await import('fs/promises');

    const patterns: string[] = [];
    const layering: string[] = [];
    let organization = 'unknown';
    const conventions: Record<string, string> = {};

    try {
      const items = await fs.readdir(workingDirectory, { withFileTypes: true });
      const directories = items.filter(item => item.isDirectory()).map(item => item.name);

      // Detect organization patterns
      if (directories.includes('src')) {
        organization = 'source-based';
        layering.push('src/');
      }

      if (directories.includes('lib') || directories.includes('dist')) {
        patterns.push('compiled-output');
      }

      if (directories.includes('tests') || directories.includes('test')) {
        patterns.push('dedicated-testing');
      }

      if (directories.includes('docs') || directories.includes('documentation')) {
        patterns.push('documented-project');
      }

      if (directories.includes('config') || directories.includes('configs')) {
        patterns.push('configuration-management');
      }

      // Check for common architecture patterns
      if (directories.includes('components') || directories.includes('views')) {
        patterns.push('component-architecture');
      }

      if (directories.includes('services') || directories.includes('api')) {
        patterns.push('service-layer');
      }

      if (directories.includes('utils') || directories.includes('helpers')) {
        patterns.push('utility-organization');
      }

      if (directories.includes('types') || directories.includes('interfaces')) {
        patterns.push('type-organization');
        conventions['Type Organization'] = 'Dedicated types directory';
      }

      if (directories.includes('security')) {
        patterns.push('security-focused');
        conventions['Security'] = 'Dedicated security module';
      }

      // Detect naming conventions from common files
      const tsFiles = items.filter(item => item.name.endsWith('.ts')).map(item => item.name);
      if (tsFiles.some(file => file.includes('.test.ts'))) {
        conventions['Test Files'] = '*.test.ts pattern';
      }

      if (tsFiles.some(file => file.includes('.config.ts'))) {
        conventions['Config Files'] = '*.config.ts pattern';
      }
    } catch (error) {
      // Ignore file system errors during pattern detection
    }

    return {
      patterns,
      layering,
      organization,
      conventions,
    };
  }

  /**
   * Detect package manager
   */
  private detectPackageManager(workingDirectory: string): string {
    const fs = require('fs');
    const path = require('path');

    try {
      if (fs.existsSync(path.join(workingDirectory, 'package-lock.json'))) {
        return 'npm';
      }
      if (fs.existsSync(path.join(workingDirectory, 'yarn.lock'))) {
        return 'yarn';
      }
      if (fs.existsSync(path.join(workingDirectory, 'pnpm-lock.yaml'))) {
        return 'pnpm';
      }
    } catch (error) {
      // Ignore file system errors during package manager detection
    }

    return 'npm'; // default
  }

  /**
   * Determine project type based on analysis
   */
  private determineProjectType(_packageInfo: any, structure: any): string {
    if (structure.directories.includes('src') && structure.configFiles.includes('tsconfig.json')) {
      return 'TypeScript Application';
    }
    if (structure.configFiles.includes('package.json')) {
      return 'Node.js Application';
    }
    return 'Unknown';
  }

  /**
   * Check if file is a configuration file
   */
  private isConfigFile(fileName: string): boolean {
    const configFiles = [
      'package.json',
      'tsconfig.json',
      'jest.config.js',
      '.eslintrc.json',
      '.prettierrc.json',
      'webpack.config.js',
      'vite.config.js',
      'rollup.config.js',
    ];
    return (
      configFiles.includes(fileName) || (fileName.startsWith('.') && fileName.includes('config'))
    );
  }

  /**
   * Check if file is an entry point
   */
  private isEntryPoint(fileName: string): boolean {
    const entryPoints = [
      'index.js',
      'index.ts',
      'main.js',
      'main.ts',
      'app.js',
      'app.ts',
      'cli.js',
      'cli.ts',
    ];
    return entryPoints.includes(fileName);
  }

  /**
   * Check if file is a test file
   */
  private isTestFile(fileName: string): boolean {
    return (
      fileName.includes('.test.') ||
      fileName.includes('.spec.') ||
      fileName.includes('test') ||
      fileName.includes('spec')
    );
  }

  /**
   * Check if file is a key project file
   */
  private isKeyFile(fileName: string): boolean {
    const keyFiles = ['README.md', 'LICENSE', 'CHANGELOG.md', 'package.json', 'tsconfig.json'];
    return keyFiles.includes(fileName);
  }
}
