import { logger } from '../utils/logger';
import { ContextManager } from './context-manager';
import {
  WorkflowPattern,
  WorkflowPatternMatch,
  WorkflowTrigger,
  WorkflowTriggerMatch,
  WorkflowExecutionPlan,
  PlannedWorkflowStep,
  WorkflowStepCondition,
  WorkflowCompletionEstimate,
  ProjectContext,
  ConversationMemory,
} from '../types';

/**
 * Intelligent workflow pattern detection and execution orchestrator
 */
export class WorkflowOrchestrator {
  private patterns: Map<string, WorkflowPattern> = new Map();
  private contextManager: ContextManager;
  private executionHistory: WorkflowExecution[] = [];
  private llmClient?: any; // Will be injected for LLM-based pattern detection

  constructor(contextManager: ContextManager, llmClient?: any) {
    this.contextManager = contextManager;
    this.llmClient = llmClient;
    this.initializeBuiltInPatterns();

    // Initialize execution history tracking (will be used in future features)
    this.executionHistory = [];
  }

  /**
   * Get the registered patterns (for testing purposes)
   */
  getPatterns(): Map<string, WorkflowPattern> {
    return this.patterns;
  }

  /**
   * Get execution history (for monitoring purposes)
   */
  getExecutionHistory(): WorkflowExecution[] {
    return this.executionHistory;
  }

  /**
   * Get context manager (for advanced features)
   */
  getContextManager(): ContextManager {
    return this.contextManager;
  }

  /**
   * Enhanced pattern detection using both rule-based and LLM-based analysis
   */
  async detectWorkflowPattern(
    query: string,
    projectContext?: ProjectContext
  ): Promise<WorkflowPatternMatch[]> {
    const normalizedQuery = query.toLowerCase().trim();

    // Return empty array for empty or whitespace-only queries
    if (!normalizedQuery || normalizedQuery.length < 2) {
      return [];
    }

    // Start with rule-based detection (fast baseline)
    const ruleBasedMatches = await this.detectPatternsRuleBased(normalizedQuery, projectContext);

    // Enhance with LLM-based detection if available
    let enhancedMatches = ruleBasedMatches;
    if (this.llmClient) {
      try {
        enhancedMatches = await this.enhanceWithLLMDetection(
          query,
          ruleBasedMatches,
          projectContext
        );
      } catch (error) {
        logger.debug(`LLM pattern enhancement failed, falling back to rule-based: ${error}`);
        enhancedMatches = ruleBasedMatches;
      }
    }

    // Sort by confidence descending
    enhancedMatches.sort((a, b) => b.confidence - a.confidence);

    logger.debug(
      `🎯 [WorkflowOrchestrator] Detected ${enhancedMatches.length} patterns for query: "${query}"`
    );
    for (const match of enhancedMatches.slice(0, 3)) {
      logger.debug(`  - ${match.pattern.name}: ${(match.confidence * 100).toFixed(1)}% confidence`);
    }

    return enhancedMatches;
  }

  /**
   * Original rule-based pattern detection (kept as fallback)
   */
  private async detectPatternsRuleBased(
    normalizedQuery: string,
    projectContext?: ProjectContext
  ): Promise<WorkflowPatternMatch[]> {
    const matches: WorkflowPatternMatch[] = [];

    // Multi-layered pattern detection
    for (const pattern of this.patterns.values()) {
      const patternMatch = await this.evaluatePattern(pattern, normalizedQuery, projectContext);
      if (patternMatch && patternMatch.confidence > 0.2) {
        // Lower threshold but require actual matches
        matches.push(patternMatch);
      }
    }

    return matches;
  }

  /**
   * Enhanced LLM-based pattern detection
   */
  private async enhanceWithLLMDetection(
    originalQuery: string,
    ruleBasedMatches: WorkflowPatternMatch[],
    projectContext?: ProjectContext
  ): Promise<WorkflowPatternMatch[]> {
    const patternDescriptions = Array.from(this.patterns.values()).map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      toolSequence: p.toolSequence,
    }));

    const contextInfo = projectContext
      ? `Project context: ${projectContext.type} project using ${projectContext.packageManager}, dependencies: ${projectContext.dependencies.slice(0, 5).join(', ')}`
      : 'No project context available';

    const prompt = `Analyze this user query and determine which workflow patterns are most relevant:

QUERY: "${originalQuery}"

${contextInfo}

AVAILABLE PATTERNS:
${patternDescriptions.map(p => `- ${p.id}: ${p.name} - ${p.description}`).join('\n')}

RULE-BASED ANALYSIS FOUND:
${ruleBasedMatches.map(m => `- ${m.pattern.name}: ${(m.confidence * 100).toFixed(1)}% confidence`).join('\n')}

IMPORTANT CONTEXT: You are an AI coding assistant. Only respond with patterns for queries related to:
- Software development
- Code analysis
- Project structure
- File operations on codebases
- API development
- Code quality and issues

For queries unrelated to software development (like weather, general questions, etc.), respond with an empty patterns array.

Please analyze the query intent and provide pattern relevance scores (0-100) for each pattern.
Consider:
1. Query semantics and user intent
2. Project context if available  
3. Complexity and scope of the request
4. Most appropriate workflow sequence
5. Whether this is actually related to software development

Respond in JSON format:
{
  "patterns": [
    {"id": "pattern_id", "confidence": 85, "reasoning": "why this pattern fits"}
  ],
  "query_analysis": "overall analysis of user intent"
}`;

    try {
      const response = await this.llmClient.chat(
        [
          {
            role: 'system',
            content:
              'You are an expert at analyzing user queries and mapping them to appropriate workflow patterns. Always respond with valid JSON.',
          },
          { role: 'user', content: prompt },
        ],
        {
          format: 'json',
        }
      );

      const analysis = JSON.parse(response.message.content);

      // Combine LLM insights with rule-based matches
      const enhancedMatches: WorkflowPatternMatch[] = [];

      for (const llmPattern of analysis.patterns || []) {
        const pattern = this.patterns.get(llmPattern.id);
        if (!pattern || llmPattern.confidence < 30) continue;

        // Find corresponding rule-based match or create new one
        const ruleMatch = ruleBasedMatches.find(m => m.pattern.id === llmPattern.id);

        // Combine rule-based and LLM confidence (weighted average)
        const ruleConfidence = ruleMatch ? ruleMatch.confidence : 0.1;
        const llmConfidence = llmPattern.confidence / 100;
        const combinedConfidence = ruleConfidence * 0.3 + llmConfidence * 0.7; // Favor LLM analysis

        enhancedMatches.push({
          pattern,
          confidence: combinedConfidence,
          matchedTriggers: ruleMatch?.matchedTriggers || [],
          extractedParameters: {
            ...this.extractParameters(originalQuery.toLowerCase(), pattern),
            llm_reasoning: llmPattern.reasoning,
            llm_confidence: llmConfidence,
            rule_confidence: ruleConfidence,
            combined_method: 'llm_enhanced',
          },
        });
      }

      logger.debug(`🤖 [LLM Pattern Detection] Enhanced ${enhancedMatches.length} patterns`);
      return enhancedMatches;
    } catch (error) {
      logger.debug(`LLM pattern detection failed: ${error}`);
      return ruleBasedMatches;
    }
  }

  /**
   * Plan workflow execution based on detected pattern
   */
  async planWorkflowExecution(
    pattern: WorkflowPattern,
    query: string,
    context: ConversationMemory
  ): Promise<WorkflowExecutionPlan> {
    const planId = `plan-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

    // Generate planned steps based on pattern strategy
    const steps = await this.generatePlannedSteps(pattern, query, context);

    // Estimate completion criteria
    const estimatedCompletion = this.estimateCompletion(pattern, steps, context);

    const plan: WorkflowExecutionPlan = {
      id: planId,
      pattern,
      steps,
      estimatedCompletion,
      createdAt: new Date(),
      adaptable:
        pattern.strategy.planning === 'dynamic' || pattern.strategy.planning === 'llm_guided',
    };

    logger.debug(
      `📋 [WorkflowOrchestrator] Created execution plan ${planId} with ${steps.length} steps`
    );
    return plan;
  }

  /**
   * Evaluate a pattern against query and context
   */
  private async evaluatePattern(
    pattern: WorkflowPattern,
    normalizedQuery: string,
    projectContext?: ProjectContext
  ): Promise<WorkflowPatternMatch | null> {
    const matchedTriggers: WorkflowTriggerMatch[] = [];
    let totalScore = 0;
    let totalWeight = 0;

    // Evaluate each trigger
    for (const trigger of pattern.triggers) {
      const triggerMatch = await this.evaluateTrigger(trigger, normalizedQuery, projectContext);
      if (triggerMatch && triggerMatch.score > 0) {
        matchedTriggers.push(triggerMatch);
        totalScore += triggerMatch.score * trigger.weight;
        totalWeight += trigger.weight;
      }
    }

    // Calculate confidence as weighted average
    const confidence = totalWeight > 0 ? totalScore / totalWeight : 0;

    if (confidence > 0 && matchedTriggers.length > 0) {
      return {
        pattern,
        confidence,
        matchedTriggers,
        extractedParameters: this.extractParameters(normalizedQuery, pattern),
      };
    }

    return null;
  }

  /**
   * Evaluate individual trigger against query and context
   */
  private async evaluateTrigger(
    trigger: WorkflowTrigger,
    normalizedQuery: string,
    projectContext?: ProjectContext
  ): Promise<WorkflowTriggerMatch | null> {
    let score = 0;
    const matchedElements: string[] = [];

    switch (trigger.type) {
      case 'keywords':
        score = this.evaluateKeywordTrigger(trigger, normalizedQuery, matchedElements);
        break;
      case 'intent':
        score = this.evaluateIntentTrigger(trigger, normalizedQuery, matchedElements);
        break;
      case 'project_context':
        score = this.evaluateProjectContextTrigger(trigger, projectContext, matchedElements);
        break;
      case 'composite':
        score = this.evaluateCompositeTrigger(
          trigger,
          normalizedQuery,
          projectContext,
          matchedElements
        );
        break;
    }

    if (score > 0) {
      return {
        trigger,
        score,
        matchedElements,
      };
    }

    return null;
  }

  /**
   * Evaluate keyword-based trigger
   */
  private evaluateKeywordTrigger(
    trigger: WorkflowTrigger,
    normalizedQuery: string,
    matchedElements: string[]
  ): number {
    const keywords = trigger.criteria.keywords || [];
    if (keywords.length === 0) {
      return 0;
    }

    let totalScore = 0;
    let matchedKeywords = 0;

    for (const keyword of keywords) {
      const keywordLower = keyword.toLowerCase();
      let score = 0;

      // Check for exact phrase match (highest score)
      if (normalizedQuery.includes(keywordLower)) {
        score = 1.0;
        matchedElements.push(keyword);
        matchedKeywords++;
      } else {
        // Check for individual word matches (partial score)
        const keywordWords = keywordLower.split(/\s+/);
        const queryWords = normalizedQuery.split(/\s+/);
        let matchedWords = 0;

        for (const keywordWord of keywordWords) {
          if (
            queryWords.some(
              queryWord =>
                queryWord.length > 2 &&
                (queryWord.includes(keywordWord) || keywordWord.includes(queryWord))
            )
          ) {
            matchedWords++;
          }
        }

        // Score based on proportion of words matched
        if (matchedWords > 0) {
          score = (matchedWords / keywordWords.length) * 0.8; // Increased partial match score
          matchedElements.push(keyword);
          matchedKeywords++;
        }
      }

      totalScore += score;
    }

    // Boost confidence if multiple keywords match
    const baseScore = keywords.length > 0 ? totalScore / keywords.length : 0;
    const matchRatio = matchedKeywords / keywords.length;

    // Exponential boost for higher match ratios
    return baseScore * (1 + matchRatio * 0.5);
  }

  /**
   * Evaluate intent-based trigger (simplified for Phase 1)
   */
  private evaluateIntentTrigger(
    trigger: WorkflowTrigger,
    normalizedQuery: string,
    matchedElements: string[]
  ): number {
    const intentTypes = trigger.criteria.intentTypes || [];

    // Simplified intent detection based on query patterns
    const detectedIntents: string[] = [];

    if (
      normalizedQuery.includes('analyze') ||
      normalizedQuery.includes('understand') ||
      normalizedQuery.includes('structure') ||
      normalizedQuery.includes('overview')
    ) {
      detectedIntents.push('project_understanding');
    }

    if (
      (normalizedQuery.includes('api') && normalizedQuery.includes('endpoint')) ||
      normalizedQuery.includes('routes') ||
      normalizedQuery.includes('find endpoints')
    ) {
      detectedIntents.push('api_discovery');
    }

    if (
      normalizedQuery.includes('todo') ||
      normalizedQuery.includes('fixme') ||
      normalizedQuery.includes('issues') ||
      normalizedQuery.includes('problems')
    ) {
      detectedIntents.push('quality_analysis');
    }

    let matchedCount = 0;
    for (const intentType of intentTypes) {
      if (detectedIntents.includes(intentType)) {
        matchedElements.push(intentType);
        matchedCount++;
      }
    }

    return intentTypes.length > 0 ? matchedCount / intentTypes.length : 0;
  }

  /**
   * Evaluate project context trigger
   */
  private evaluateProjectContextTrigger(
    trigger: WorkflowTrigger,
    projectContext: ProjectContext | undefined,
    matchedElements: string[]
  ): number {
    if (!projectContext) {
      return 0;
    }

    const projectPatterns = trigger.criteria.projectPatterns || [];
    let matchedCount = 0;

    for (const pattern of projectPatterns) {
      let matches = false;

      // Check project type
      if (pattern === projectContext.type) {
        matches = true;
      }

      // Check package manager
      if (pattern === projectContext.packageManager) {
        matches = true;
      }

      // Check config files
      if (projectContext.configFiles.some(file => file.includes(pattern))) {
        matches = true;
      }

      // Check dependencies
      if (projectContext.dependencies.some(dep => dep.includes(pattern))) {
        matches = true;
      }

      if (matches) {
        matchedElements.push(pattern);
        matchedCount++;
      }
    }

    return projectPatterns.length > 0 ? matchedCount / projectPatterns.length : 0;
  }

  /**
   * Evaluate composite trigger (combines multiple criteria)
   */
  private evaluateCompositeTrigger(
    trigger: WorkflowTrigger,
    normalizedQuery: string,
    projectContext: ProjectContext | undefined,
    matchedElements: string[]
  ): number {
    let totalScore = 0;
    let criteriaCount = 0;

    // Check keywords if present
    if (trigger.criteria.keywords) {
      const keywordScore = this.evaluateKeywordTrigger(trigger, normalizedQuery, matchedElements);
      totalScore += keywordScore;
      criteriaCount++;
    }

    // Check intents if present
    if (trigger.criteria.intentTypes) {
      const intentScore = this.evaluateIntentTrigger(trigger, normalizedQuery, matchedElements);
      totalScore += intentScore;
      criteriaCount++;
    }

    // Check project context if present
    if (trigger.criteria.projectPatterns && projectContext) {
      const contextScore = this.evaluateProjectContextTrigger(
        trigger,
        projectContext,
        matchedElements
      );
      totalScore += contextScore;
      criteriaCount++;
    }

    return criteriaCount > 0 ? totalScore / criteriaCount : 0;
  }

  /**
   * Extract parameters from query based on pattern
   */
  private extractParameters(
    normalizedQuery: string,
    pattern: WorkflowPattern
  ): Record<string, any> {
    const parameters: Record<string, any> = {
      originalQuery: normalizedQuery,
      patternId: pattern.id,
    };

    // Extract file extensions mentioned
    const extensionMatches = normalizedQuery.match(/\.(ts|js|py|json|md|tsx|jsx)\b/g);
    if (extensionMatches) {
      parameters.fileExtensions = extensionMatches.map(ext => ext.substring(1));
    }

    // Extract directory references
    const directoryMatches = normalizedQuery.match(
      /(src|components|routes|api|lib|utils|tests?)\b/g
    );
    if (directoryMatches) {
      parameters.directories = directoryMatches;
    }

    return parameters;
  }

  /**
   * Generate planned steps based on pattern and context
   */
  private async generatePlannedSteps(
    pattern: WorkflowPattern,
    query: string,
    context: ConversationMemory
  ): Promise<PlannedWorkflowStep[]> {
    const steps: PlannedWorkflowStep[] = [];

    // Generate steps based on pattern's tool sequence
    for (let i = 0; i < pattern.toolSequence.length; i++) {
      const toolName = pattern.toolSequence[i];
      if (!toolName) {
        continue; // Skip undefined tool names
      }

      const stepId = `step-${i + 1}-${toolName.replace(/\./g, '-')}`;

      const plannedArgs = this.generateStepArguments(toolName, query, pattern, i, context);

      steps.push({
        id: stepId,
        stepNumber: i + 1,
        toolName,
        plannedArguments: plannedArgs,
        conditions: this.generateStepConditions(toolName, pattern, i),
      });
    }

    return steps;
  }

  /**
   * Generate arguments for a planned step
   */
  private generateStepArguments(
    toolName: string,
    query: string,
    pattern: WorkflowPattern,
    stepIndex: number,
    _context: ConversationMemory // Prefix with underscore to indicate intentionally unused for now
  ): Record<string, any> {
    const args: Record<string, any> = {};

    if (toolName === 'internal.files') {
      if (stepIndex === 0) {
        // First step - determine operation and path based on query intent and pattern
        if (pattern.id === 'project_analysis') {
          args.operation = 'list';
          args.path = '.';
          args.recursive = true;
        } else {
          // Use dynamic operation detection based on query semantics
          const operation = this.detectIntendedOperation(query);
          args.operation = operation;

          // Use dynamic path extraction or let LLM decide
          const extractedPath = this.extractPathFromQuery(query);
          if (extractedPath) {
            args.path = extractedPath;
          } else {
            // Let LLM determine appropriate path based on context
            args.path = 'TO_BE_DETERMINED_BY_LLM';
          }
        }
      } else {
        // Subsequent steps - adapt based on previous results stored in context
        args.operation = 'TO_BE_DETERMINED_BY_CONTEXT';
        args.path = 'TO_BE_DETERMINED_BY_PREVIOUS_RESULTS';
      }
    }

    return args;
  }

  /**
   * Detect intended operation from query semantics
   */
  private detectIntendedOperation(query: string): string {
    const normalizedQuery = query.toLowerCase();

    if (
      normalizedQuery.includes('list') ||
      normalizedQuery.includes('find') ||
      normalizedQuery.includes('show me all') ||
      normalizedQuery.includes('discover')
    ) {
      return 'list';
    } else if (
      normalizedQuery.includes('read') ||
      normalizedQuery.includes('show me') ||
      normalizedQuery.includes('display') ||
      normalizedQuery.includes('content')
    ) {
      return 'read';
    } else if (
      normalizedQuery.includes('search') ||
      normalizedQuery.includes('grep') ||
      normalizedQuery.includes('look for')
    ) {
      return 'search';
    } else {
      // Default to list for exploratory queries
      return 'list';
    }
  }

  /**
   * Generate conditions for step execution
   */
  private generateStepConditions(
    _toolName: string, // Will be used for tool-specific conditions in future
    _pattern: WorkflowPattern, // Will be used for pattern-specific conditions in future
    stepIndex: number
  ): WorkflowStepCondition[] {
    const conditions: WorkflowStepCondition[] = [];

    // Add error threshold condition for all steps
    conditions.push({
      type: 'error_threshold',
      parameters: { maxErrors: 2 },
      required: true,
    });

    // Add result check for steps after the first
    if (stepIndex > 0) {
      conditions.push({
        type: 'result_check',
        parameters: { requireSuccessfulPreviousStep: true },
        required: true,
      });
    }

    return conditions;
  }

  /**
   * Estimate workflow completion metrics
   */
  private estimateCompletion(
    pattern: WorkflowPattern,
    steps: PlannedWorkflowStep[],
    _context: ConversationMemory
  ): WorkflowCompletionEstimate {
    const estimatedSteps = Math.min(steps.length, pattern.completionCriteria.maxSteps);
    const estimatedDuration = estimatedSteps * 3; // 3 seconds per step estimate

    return {
      estimatedSteps,
      estimatedDuration,
      confidence: 0.7, // Medium confidence for initial implementation
      milestones: this.generateMilestones(pattern),
    };
  }

  /**
   * Generate milestones for pattern
   */
  private generateMilestones(pattern: WorkflowPattern): string[] {
    const milestones: string[] = [];

    switch (pattern.id) {
      case 'project_analysis':
        milestones.push(
          'Project structure discovered',
          'Framework identified',
          'Key files analyzed'
        );
        break;
      case 'api_mapping':
        milestones.push('Routes discovered', 'Endpoints extracted', 'API documented');
        break;
      case 'quality_analysis':
        milestones.push('Issues identified', 'Context analyzed', 'Recommendations generated');
        break;
      default:
        milestones.push('Initial analysis', 'Data gathered', 'Results summarized');
    }

    return milestones;
  }

  /**
   * Extract file path from query
   */
  private extractPathFromQuery(query: string): string | null {
    // Look for file paths, extensions, or directory references
    const pathMatches = query.match(
      /((?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+\.[a-zA-Z]+|src\/[^\s]*|[a-zA-Z0-9_-]+\/)/
    );
    return pathMatches ? pathMatches[0] : null;
  }

  /**
   * Initialize built-in workflow patterns
   */
  private initializeBuiltInPatterns(): void {
    this.registerPattern(this.createProjectAnalysisPattern());
    this.registerPattern(this.createApiMappingPattern());
    this.registerPattern(this.createQualityAnalysisPattern());
    this.registerPattern(this.createFileExplorationPattern());

    logger.debug(`🎯 [WorkflowOrchestrator] Initialized ${this.patterns.size} built-in patterns`);
  }

  /**
   * Register a workflow pattern
   */
  private registerPattern(pattern: WorkflowPattern): void {
    this.patterns.set(pattern.id, pattern);
  }

  /**
   * Create project analysis pattern
   */
  private createProjectAnalysisPattern(): WorkflowPattern {
    return {
      id: 'project_analysis',
      name: 'Project Discovery & Architecture Analysis',
      description: 'Comprehensive project structure and framework detection',
      triggers: [
        {
          type: 'keywords',
          criteria: {
            keywords: [
              'analyze project',
              'understand codebase',
              'project structure',
              'architecture',
              'overview',
            ],
          },
          weight: 0.8,
        },
        {
          type: 'intent',
          criteria: { intentTypes: ['project_understanding', 'architecture_analysis'] },
          weight: 0.9,
        },
      ],
      strategy: {
        mode: 'sequential',
        planning: 'llm_guided',
        errorRecovery: 'continue',
        contextPropagation: [
          {
            from: 'file_list',
            to: 'project_context',
            extractors: ['framework_detection', 'entry_points'],
          },
          {
            from: 'file_content',
            to: 'dependency_analysis',
            extractors: ['package_deps', 'imports'],
          },
        ],
      },
      toolSequence: ['internal.files', 'internal.files', 'internal.files'],
      completionCriteria: {
        minSteps: 3,
        maxSteps: 8,
        requiredFindings: ['project_type', 'main_entry', 'dependencies'],
        successIndicators: ['framework_identified', 'structure_mapped'],
        qualityThresholds: { context_coverage: 0.7, finding_relevance: 0.8 },
      },
    };
  }

  /**
   * Create API mapping pattern
   */
  private createApiMappingPattern(): WorkflowPattern {
    return {
      id: 'api_mapping',
      name: 'API Endpoint Discovery & Documentation',
      description: 'Systematic discovery and documentation of API endpoints',
      triggers: [
        {
          type: 'keywords',
          criteria: {
            keywords: [
              'api endpoints',
              'routes',
              'document api',
              'find endpoints',
              'api documentation',
            ],
          },
          weight: 0.9,
        },
        {
          type: 'project_context',
          criteria: { projectPatterns: ['express', 'fastify', 'koa', 'nestjs', 'flask', 'django'] },
          weight: 0.8,
        },
      ],
      strategy: {
        mode: 'conditional',
        planning: 'dynamic',
        errorRecovery: 'alternative_path',
        contextPropagation: [
          {
            from: 'search_results',
            to: 'endpoint_map',
            extractors: ['route_patterns', 'http_methods'],
          },
          { from: 'file_content', to: 'api_docs', extractors: ['route_handlers', 'middleware'] },
        ],
      },
      toolSequence: ['internal.files', 'internal.files', 'internal.files'],
      completionCriteria: {
        minSteps: 4,
        maxSteps: 10,
        requiredFindings: ['endpoint_list', 'http_methods', 'route_handlers'],
        successIndicators: ['complete_api_map', 'documented_params'],
        qualityThresholds: { endpoint_coverage: 0.85, documentation_completeness: 0.7 },
      },
    };
  }

  /**
   * Create quality analysis pattern
   */
  private createQualityAnalysisPattern(): WorkflowPattern {
    return {
      id: 'quality_analysis',
      name: 'Code Quality Assessment & Issue Detection',
      description: 'Systematic discovery and analysis of code quality issues',
      triggers: [
        {
          type: 'keywords',
          criteria: {
            keywords: [
              'find issues',
              'code quality',
              'todos',
              'review code',
              'find problems',
              'technical debt',
            ],
          },
          weight: 0.8,
        },
        {
          type: 'composite',
          criteria: {
            keywords: ['todo', 'fixme', 'hack', 'warning'],
            contextRequirements: { multiple_files: true },
          },
          weight: 0.9,
        },
      ],
      strategy: {
        mode: 'adaptive',
        planning: 'llm_guided',
        errorRecovery: 'continue',
        contextPropagation: [
          {
            from: 'search_results',
            to: 'issue_map',
            extractors: ['issue_patterns', 'severity_indicators'],
          },
          {
            from: 'file_content',
            to: 'context_analysis',
            extractors: ['surrounding_code', 'impact_assessment'],
          },
        ],
      },
      toolSequence: ['internal.files', 'internal.files', 'internal.files'],
      completionCriteria: {
        minSteps: 3,
        maxSteps: 12,
        requiredFindings: ['issue_list', 'context_analysis', 'recommendations'],
        successIndicators: ['prioritized_issues', 'actionable_suggestions'],
        qualityThresholds: { issue_relevance: 0.8, suggestion_quality: 0.7 },
      },
    };
  }

  /**
   * Create file exploration pattern
   */
  private createFileExplorationPattern(): WorkflowPattern {
    return {
      id: 'file_exploration',
      name: 'File System Exploration & Analysis',
      description: 'General file system exploration and content analysis',
      triggers: [
        {
          type: 'keywords',
          criteria: {
            keywords: ['list files', 'show me', 'read', 'find', 'explore', 'look at'],
          },
          weight: 0.7,
        },
      ],
      strategy: {
        mode: 'sequential',
        planning: 'static',
        errorRecovery: 'retry',
        contextPropagation: [
          {
            from: 'file_list',
            to: 'file_context',
            extractors: ['file_types', 'directory_structure'],
          },
          {
            from: 'file_content',
            to: 'content_analysis',
            extractors: ['key_content', 'file_purpose'],
          },
        ],
      },
      toolSequence: ['internal.files'],
      completionCriteria: {
        minSteps: 1,
        maxSteps: 5,
        requiredFindings: ['file_content'],
        successIndicators: ['content_retrieved'],
        qualityThresholds: { content_relevance: 0.6 },
      },
    };
  }
}

/**
 * Internal type for tracking workflow execution history
 */
interface WorkflowExecution {
  id: string;
  pattern: WorkflowPattern;
  startTime: Date;
  endTime?: Date;
  success: boolean;
  stepsExecuted: number;
}
