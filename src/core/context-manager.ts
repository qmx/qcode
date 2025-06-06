import {
  StructuredToolResult,
  ConversationMemory,
  ResultExtractionStrategy,
  ContextSizeConfig,
  ToolResult,
} from '../types.js';

/**
 * Default context size configuration
 */
export const DEFAULT_CONTEXT_CONFIG: ContextSizeConfig = {
  maxTotalSize: 8000, // 8KB context limit
  maxResultSize: 2000, // 2KB per individual result
  alwaysPreserveSteps: 3, // Always keep last 3 steps
  compressionThreshold: 6000, // Start compression at 6KB
  minContextSize: 1000, // Never go below 1KB
};

/**
 * Result extraction strategies for different tool result types
 */
export const EXTRACTION_STRATEGIES: Record<string, ResultExtractionStrategy> = {
  file_content: {
    type: 'file_content',
    maxSummaryLength: 200,
    extractionPatterns: ['class', 'function', 'export', 'import', 'interface', 'type'],
    extractKeyFindings: (data: any): string[] => {
      const findings: string[] = [];
      if (data?.content) {
        const content = data.content as string;
        // Extract key code patterns
        const classMatches = content.match(/class\s+(\w+)/g) || [];
        const functionMatches = content.match(/function\s+(\w+)/g) || [];
        const exportMatches = content.match(/export\s+(?:class|function|const|let)\s+(\w+)/g) || [];

        findings.push(...classMatches);
        findings.push(...functionMatches);
        findings.push(...exportMatches);
      }
      return findings.slice(0, 10); // Limit to top 10 findings
    },
    createNextStepContext: (data: any): Record<string, any> => ({
      filePath: data?.path,
      fileType: data?.path?.split('.').pop(),
      hasClasses: data?.content?.includes('class'),
      hasFunctions: data?.content?.includes('function'),
      lineCount: data?.lines,
    }),
  },

  file_list: {
    type: 'file_list',
    maxSummaryLength: 150,
    extractionPatterns: ['.ts', '.js', '.json', '.md', '.py', '.java'],
    extractKeyFindings: (data: any): string[] => {
      const findings: string[] = [];
      if (data?.files && Array.isArray(data.files)) {
        // Group files by extension
        const extensions = new Map<string, number>();
        const importantFiles: string[] = [];

        data.files.forEach((file: any) => {
          const ext = file.relativePath?.split('.').pop() || 'unknown';
          extensions.set(ext, (extensions.get(ext) || 0) + 1);

          // Identify important files
          if (file.relativePath?.match(/(index|main|app|server|config)\..*$/)) {
            importantFiles.push(file.relativePath);
          }
        });

        // Add extension summary
        Array.from(extensions.entries()).forEach(([ext, count]) => {
          findings.push(`${count} .${ext} files`);
        });

        // Add important files
        findings.push(...importantFiles);
      }
      return findings.slice(0, 8);
    },
    createNextStepContext: (data: any): Record<string, any> => ({
      totalFiles: data?.count || 0,
      directory: data?.path,
      hasPackageJson: data?.files?.some((f: any) => f.relativePath === 'package.json'),
      hasTsConfig: data?.files?.some((f: any) => f.relativePath === 'tsconfig.json'),
      mainFiles:
        data?.files
          ?.filter((f: any) => f.relativePath?.match(/(index|main|app|server)\..*$/))
          ?.map((f: any) => f.relativePath) || [],
    }),
  },

  search_results: {
    type: 'search_results',
    maxSummaryLength: 180,
    extractionPatterns: ['TODO', 'FIXME', 'function', 'class', 'import'],
    extractKeyFindings: (data: any): string[] => {
      const findings: string[] = [];
      if (data?.matches && Array.isArray(data.matches)) {
        // Extract unique file paths
        const files = new Set(data.matches.map((m: any) => m.file));
        findings.push(`Found in ${files.size} files`);

        // Extract common patterns
        const patterns = new Map<string, number>();
        data.matches.forEach((match: any) => {
          const text = match.match || '';
          if (text.includes('TODO')) patterns.set('TODO', (patterns.get('TODO') || 0) + 1);
          if (text.includes('FIXME')) patterns.set('FIXME', (patterns.get('FIXME') || 0) + 1);
          if (text.includes('function'))
            patterns.set('function', (patterns.get('function') || 0) + 1);
        });

        Array.from(patterns.entries()).forEach(([pattern, count]) => {
          findings.push(`${count} ${pattern} matches`);
        });
      }
      return findings.slice(0, 6);
    },
    createNextStepContext: (data: any): Record<string, any> => ({
      searchQuery: data?.query,
      totalMatches: data?.totalMatches || 0,
      filesSearched: data?.filesSearched || 0,
      matchingFiles:
        data?.matches
          ?.map((m: any) => m.file)
          .filter((f: string, i: number, arr: string[]) => arr.indexOf(f) === i)
          .slice(0, 10) || [],
    }),
  },

  error: {
    type: 'error',
    maxSummaryLength: 100,
    extractionPatterns: ['Error', 'Failed', 'Exception'],
    extractKeyFindings: (data: any): string[] => [data?.error || 'Unknown error occurred'],
    createNextStepContext: (data: any): Record<string, any> => ({
      errorType: data?.error?.split(':')[0] || 'Unknown',
      hasError: true,
    }),
  },

  analysis: {
    type: 'analysis',
    maxSummaryLength: 250,
    extractionPatterns: ['recommendation', 'issue', 'pattern', 'structure'],
    extractKeyFindings: (data: any): string[] => {
      // For analysis results, extract key recommendations or findings
      const text = JSON.stringify(data);
      const findings: string[] = [];

      if (text.includes('recommendation')) findings.push('Has recommendations');
      if (text.includes('issue')) findings.push('Issues found');
      if (text.includes('pattern')) findings.push('Patterns detected');

      return findings;
    },
    createNextStepContext: (data: any): Record<string, any> => ({
      analysisType: 'general',
      hasRecommendations: JSON.stringify(data).includes('recommendation'),
    }),
  },
};

/**
 * Context Manager for intelligent conversation and result management
 */
export class ContextManager {
  private config: ContextSizeConfig;

  constructor(config: ContextSizeConfig = DEFAULT_CONTEXT_CONFIG) {
    this.config = config;
  }

  /**
   * Convert a raw ToolResult into a StructuredToolResult
   */
  createStructuredResult(toolName: string, result: ToolResult): StructuredToolResult {
    // Determine result type based on tool name and content
    const resultType = this.determineResultType(toolName, result);

    // Get extraction strategy for this result type - ensure we always have a strategy
    const strategy = EXTRACTION_STRATEGIES[resultType] ?? EXTRACTION_STRATEGIES['analysis'];
    if (!strategy) {
      throw new Error(`No extraction strategy found for result type: ${resultType}`);
    }

    // Extract key findings using the strategy
    const keyFindings = strategy.extractKeyFindings(result.data || {});

    // Create summary based on result type and size
    const summary = this.createSummary(result, strategy);

    // Extract context for next step
    const contextForNextStep = strategy.createNextStepContext(result.data || {});

    // Calculate sizes
    const originalSize = this.calculateDataSize(result.data);
    const truncated = originalSize > this.config.maxResultSize;

    // Extract file paths and patterns
    const filePaths = this.extractFilePaths(result.data);
    const patterns = this.extractPatterns(result.data, strategy.extractionPatterns);
    const errors = result.success ? [] : [result.error || 'Unknown error'];

    const structuredResult: StructuredToolResult = {
      toolName,
      success: result.success,
      duration: result.duration,
      type: resultType,
      summary,
      keyFindings,
      fullData: result.data,
      truncated,
      contextForNextStep,
      filePaths,
      patterns,
      errors,
    };

    // Only include originalSize if it's greater than 0
    if (originalSize > 0) {
      structuredResult.originalSize = originalSize;
    }

    return structuredResult;
  }

  /**
   * Format a StructuredToolResult for conversation context
   */
  formatResultForConversation(
    structuredResult: StructuredToolResult,
    stepContext?: ConversationMemory
  ): string {
    if (!structuredResult.success) {
      return `\nError in ${structuredResult.toolName}: ${structuredResult.errors?.[0] || 'Unknown error'}`;
    }

    // Format based on result type with size awareness
    switch (structuredResult.type) {
      case 'file_content':
        return this.formatFileContentResult(structuredResult, stepContext);
      case 'file_list':
        return this.formatFileListResult(structuredResult);
      case 'search_results':
        return this.formatSearchResult(structuredResult);
      case 'analysis':
        return this.formatAnalysisResult(structuredResult);
      default:
        return this.formatGenericResult(structuredResult);
    }
  }

  /**
   * Create a ConversationMemory for tracking workflow state
   */
  initializeConversationMemory(originalQuery: string, maxSteps: number = 10): ConversationMemory {
    return {
      originalQuery,
      stepNumber: 0,
      maxSteps,
      previousResults: [],
      extractedPatterns: {},
      workingMemory: {},
      totalContextSize: 0,
      maxContextSize: this.config.maxTotalSize,
    };
  }

  /**
   * Update conversation memory with a new result
   */
  updateConversationMemory(
    memory: ConversationMemory,
    structuredResult: StructuredToolResult
  ): ConversationMemory {
    const updatedMemory = { ...memory };

    // Increment step number
    updatedMemory.stepNumber++;

    // Add result to previous results
    updatedMemory.previousResults.push(structuredResult);

    // Update extracted patterns
    if (structuredResult.patterns) {
      structuredResult.patterns.forEach(pattern => {
        updatedMemory.extractedPatterns[pattern] =
          (updatedMemory.extractedPatterns[pattern] || 0) + 1;
      });
    }

    // Update working memory with context for next step
    Object.assign(updatedMemory.workingMemory, structuredResult.contextForNextStep);

    // Update total context size
    updatedMemory.totalContextSize += this.calculateStructuredResultSize(structuredResult);

    // Compress if needed
    if (updatedMemory.totalContextSize > this.config.compressionThreshold) {
      this.compressConversationMemory(updatedMemory);
    }

    return updatedMemory;
  }

  // =============================================================================
  // PRIVATE HELPER METHODS
  // =============================================================================

  private determineResultType(toolName: string, result: ToolResult): StructuredToolResult['type'] {
    if (!result.success) return 'error';

    if (toolName.includes('files')) {
      if (result.data?.content !== undefined) return 'file_content';
      if (result.data?.files && Array.isArray(result.data.files)) return 'file_list';
      if (result.data?.matches && Array.isArray(result.data.matches)) return 'search_results';
    }

    return 'analysis';
  }

  private createSummary(result: ToolResult, strategy: ResultExtractionStrategy): string {
    if (!result.success) {
      return `Error: ${result.error || 'Unknown error'}`.slice(0, strategy.maxSummaryLength);
    }

    const data = result.data;
    let summary = '';

    switch (strategy.type) {
      case 'file_content':
        summary = `File: ${data?.path || 'unknown'} (${data?.lines || 0} lines)`;
        if (data?.content) {
          const preview = data.content.slice(0, 100).replace(/\n/g, ' ');
          summary += ` - ${preview}${data.content.length > 100 ? '...' : ''}`;
        }
        break;

      case 'file_list':
        summary = `Found ${data?.count || 0} items in ${data?.path || 'directory'}`;
        if (data?.files) {
          const extensions = new Set(
            data.files.map((f: any) => f.relativePath?.split('.').pop()).filter(Boolean)
          );
          summary += `. Types: ${Array.from(extensions).slice(0, 3).join(', ')}`;
        }
        break;

      case 'search_results':
        summary = `Search "${data?.query || 'unknown'}" found ${data?.totalMatches || 0} matches in ${data?.filesSearched || 0} files`;
        break;

      default:
        summary = `Operation completed: ${JSON.stringify(data).slice(0, 100)}`;
    }

    return summary.slice(0, strategy.maxSummaryLength);
  }

  private calculateDataSize(data: any): number {
    return JSON.stringify(data || {}).length;
  }

  private calculateStructuredResultSize(result: StructuredToolResult): number {
    return result.summary.length + result.keyFindings.join('').length;
  }

  private extractFilePaths(data: any): string[] {
    const paths: string[] = [];

    if (data?.path) paths.push(data.path);
    if (data?.files && Array.isArray(data.files)) {
      paths.push(...data.files.map((f: any) => f.relativePath).filter(Boolean));
    }
    if (data?.matches && Array.isArray(data.matches)) {
      paths.push(...data.matches.map((m: any) => m.file).filter(Boolean));
    }

    // Remove duplicates and limit
    return [...new Set(paths)].slice(0, 20);
  }

  private extractPatterns(data: any, extractionPatterns: string[]): string[] {
    const content = JSON.stringify(data || {});
    return extractionPatterns.filter(
      pattern =>
        pattern &&
        typeof pattern === 'string' &&
        content &&
        content.toLowerCase().includes(pattern.toLowerCase())
    );
  }

  private formatFileContentResult(
    result: StructuredToolResult,
    stepContext?: ConversationMemory
  ): string {
    const data = result.fullData;
    const filePath = data?.path || 'unknown file';
    const lines = data?.lines ? ` (${data.lines} lines)` : '';
    const size = data?.size ? ` (${data.size} bytes)` : '';
    const truncated = result.truncated ? ' [truncated for context]' : '';

    // For conversation context, show summary + key findings instead of full content
    if (stepContext && result.originalSize && result.originalSize > 1000) {
      return `\n📄 **${filePath}**${lines}${size}${truncated}\n**Summary:** ${result.summary}\n**Key findings:** ${result.keyFindings.join(', ')}`;
    }

    // For smaller files, show full content
    const content = data?.content || '[No content]';
    return `\n📄 **${filePath}**${lines}${size}${truncated}\n\`\`\`\n${content}\n\`\`\``;
  }

  private formatFileListResult(result: StructuredToolResult): string {
    const data = result.fullData;
    const path = data?.path || 'directory';
    const count = data?.count || 0;

    // Always use summary for file lists to avoid overwhelming context
    return `\n📂 **Files in ${path}** (${count} items)\n**Summary:** ${result.summary}\n**Key findings:** ${result.keyFindings.join(', ')}`;
  }

  private formatSearchResult(result: StructuredToolResult): string {
    const data = result.fullData;
    const query = data?.query || 'unknown';
    const totalMatches = data?.totalMatches || 0;
    const filesSearched = data?.filesSearched || 0;

    return `\n🔍 **Search results for "${query}"** (${totalMatches} matches in ${filesSearched} files)\n**Summary:** ${result.summary}\n**Key findings:** ${result.keyFindings.join(', ')}`;
  }

  private formatAnalysisResult(result: StructuredToolResult): string {
    // Special handling for project analysis results
    if (result.toolName === 'internal:project' && result.fullData) {
      return this.formatProjectAnalysisResult(result);
    }
    
    // Fallback to generic analysis formatting
    return `\n✅ **${result.toolName}** completed\n**Summary:** ${result.summary}\n**Key findings:** ${result.keyFindings.join(', ')}`;
  }

  private formatProjectAnalysisResult(result: StructuredToolResult): string {
    const data = result.fullData as any;
    
    if (!data?.overview) {
      return `\n✅ **${result.toolName}** completed\n**Summary:** ${result.summary}\n**Key findings:** ${result.keyFindings.join(', ')}`;
    }

    let output = `\n✅ **Project Analysis Complete**\n\n`;
    
    // Project Overview
    output += `**📁 Project Overview**\n`;
    output += `• **Name**: ${data.overview.name}\n`;
    output += `• **Type**: ${data.overview.type}\n`;
    output += `• **Description**: ${data.overview.description}\n`;
    output += `• **Primary Language**: ${data.overview.primaryLanguage}\n\n`;
    
    // Technologies & Frameworks
    if (data.overview.technologies?.length > 0 || data.overview.frameworks?.length > 0) {
      output += `**🛠️ Technologies & Frameworks**\n`;
      if (data.overview.languages?.length > 0) {
        output += `• **Languages**: ${data.overview.languages.join(', ')}\n`;
      }
      if (data.overview.frameworks?.length > 0) {
        output += `• **Frameworks**: ${data.overview.frameworks.join(', ')}\n`;
      }
      if (data.overview.technologies?.length > 0) {
        output += `• **Tools**: ${data.overview.technologies.join(', ')}\n`;
      }
      output += '\n';
    }
    
    // Project Structure
    if (data.structure) {
      output += `**📂 Project Structure**\n`;
      if (data.structure.directories?.length > 0) {
        output += `• **Directories**: ${data.structure.directories.slice(0, 8).join(', ')}${data.structure.directories.length > 8 ? ', ...' : ''}\n`;
      }
      if (data.structure.entryPoints?.length > 0) {
        output += `• **Entry Points**: ${data.structure.entryPoints.join(', ')}\n`;
      }
      if (data.structure.configFiles?.length > 0) {
        output += `• **Config Files**: ${data.structure.configFiles.join(', ')}\n`;
      }
      output += '\n';
    }
    
    // Dependencies
    if (data.dependencies) {
      const prodCount = Object.keys(data.dependencies.production || {}).length;
      const devCount = Object.keys(data.dependencies.development || {}).length;
      if (prodCount > 0 || devCount > 0) {
        output += `**📦 Dependencies**\n`;
        output += `• **Package Manager**: ${data.dependencies.packageManager}\n`;
        if (prodCount > 0) output += `• **Production**: ${prodCount} packages\n`;
        if (devCount > 0) output += `• **Development**: ${devCount} packages\n`;
        output += '\n';
      }
    }
    
    // Architecture Patterns
    if (data.architecture?.patterns?.length > 0) {
      output += `**🏗️ Architecture Patterns**\n`;
      output += `• ${data.architecture.patterns.join(', ')}\n`;
      if (data.architecture.organization !== 'unknown') {
        output += `• **Organization**: ${data.architecture.organization}\n`;
      }
      output += '\n';
    }
    
    // Code Quality
    if (data.codeAnalysis?.quality) {
      output += `**🎯 Code Quality**\n`;
      output += `• **Score**: ${data.codeAnalysis.quality.score}/10\n`;
      if (data.codeAnalysis.quality.strengths?.length > 0) {
        output += `• **Strengths**: ${data.codeAnalysis.quality.strengths.join(', ')}\n`;
      }
    }
    
    return output;
  }

  private formatGenericResult(result: StructuredToolResult): string {
    return `\n✅ **${result.toolName}** completed\n**Summary:** ${result.summary}\n**Key findings:** ${result.keyFindings.join(', ')}`;
  }

  private compressConversationMemory(memory: ConversationMemory): void {
    // Keep the most recent steps (alwaysPreserveSteps)
    const keepSteps = this.config.alwaysPreserveSteps;
    if (memory.previousResults.length > keepSteps) {
      // Remove older results, but preserve their key findings in working memory
      const toRemove = memory.previousResults.slice(0, -keepSteps);
      toRemove.forEach(result => {
        // Preserve important findings in working memory
        if (result.keyFindings.length > 0) {
          memory.workingMemory[`archived_${result.toolName}_findings`] = result.keyFindings;
        }
      });

      // Keep only recent results
      memory.previousResults = memory.previousResults.slice(-keepSteps);
    }

    // Recalculate context size
    memory.totalContextSize = memory.previousResults.reduce(
      (total, result) => total + this.calculateStructuredResultSize(result),
      0
    );
  }
}
