#!/usr/bin/env node

/* eslint-disable no-console */

/**
 * QCode CLI - Command-line interface for the QCode AI coding assistant
 */

import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import { loadConfigWithOverrides } from './config/manager.js';
import { Config, PartialConfig, QCodeError } from './types.js';
import { OllamaClient } from './core/client.js';
import { ToolRegistry } from './core/registry.js';
import { QCodeEngine } from './core/engine.js';
import { FilesTool } from './tools/files.js';
import { WorkspaceSecurity } from './security/workspace.js';
import { initializeLogger } from './utils/logger.js';

/**
 * CLI options interface
 */
interface CLIOptions {
  config?: string;
  workspace?: string;
  verbose?: boolean;
  debug?: boolean;
  model?: string;
  stream?: boolean;
  timeout?: number;
}

/**
 * QCode CLI Application class
 */
class QCodeCLI {
  private config?: Config;
  private options: CLIOptions = {};
  private engine?: QCodeEngine;
  private ollamaClient?: OllamaClient;
  private toolRegistry?: ToolRegistry;
  private workspaceSecurity?: WorkspaceSecurity;

  /**
   * Initialize the CLI application with configuration
   */
  async initialize(options: CLIOptions): Promise<void> {
    this.options = options;

    try {
      // Determine working directory
      const workingDirectory = options.workspace ? path.resolve(options.workspace) : process.cwd();

      // Build configuration overrides from CLI options
      const cliOverrides: PartialConfig = {
        workingDirectory,
      };

      // Apply Ollama overrides if provided
      if (options.model || options.stream !== undefined || options.timeout) {
        cliOverrides.ollama = {};
        if (options.model) cliOverrides.ollama.model = options.model;
        if (options.stream !== undefined) cliOverrides.ollama.stream = options.stream;
        if (options.timeout) cliOverrides.ollama.timeout = options.timeout;
      }

      // Apply logging overrides based on verbosity
      if (options.verbose || options.debug) {
        cliOverrides.logging = {
          level: options.debug ? 'debug' : options.verbose ? 'info' : 'warn',
          console: true,
          colors: true,
          timestamp: options.debug,
        };
      }

      // Load configuration with CLI overrides
      const configResult = await loadConfigWithOverrides(workingDirectory, cliOverrides);
      this.config = configResult.config;

      // Initialize logger with the loaded configuration
      initializeLogger(this.config.logging);

      // Display configuration warnings if in verbose mode
      if (options.verbose && configResult.warnings.length > 0) {
        console.warn(chalk.yellow('⚠️  Configuration warnings:'));
        configResult.warnings.forEach(warning => console.warn(chalk.yellow(`   • ${warning}`)));
      }

      // Display configuration errors (non-fatal)
      if (configResult.errors.length > 0) {
        console.warn(chalk.red('❌ Configuration errors:'));
        configResult.errors.forEach(error => console.warn(chalk.red(`   • ${error}`)));
      }

      // Display loaded config sources in debug mode
      if (options.debug) {
        console.log(chalk.gray('📁 Configuration loaded from:'));
        configResult.sources.forEach(source => {
          const label = source.path || source.type;
          console.log(chalk.gray(`   • ${source.type}: ${label}`));
        });
        console.log();
      }

      // Initialize engine components
      await this.initializeEngine();
    } catch (error) {
      throw this.handleError(error, 'Failed to initialize QCode CLI');
    }
  }

  /**
   * Initialize the QCode engine and its components
   */
  private async initializeEngine(): Promise<void> {
    if (!this.config) {
      throw new QCodeError('Configuration not loaded', 'CONFIG_NOT_LOADED');
    }

    try {
      // Initialize Ollama client
      this.ollamaClient = new OllamaClient(this.config.ollama);

      // Initialize workspace security
      this.workspaceSecurity = new WorkspaceSecurity(
        this.config.security,
        this.config.workingDirectory
      );

      // Initialize tool registry
      this.toolRegistry = new ToolRegistry(this.config.security, this.config.workingDirectory);

      // Register internal FilesTool
      const filesTool = new FilesTool(this.workspaceSecurity);
      this.toolRegistry.registerInternalTool(
        'files',
        filesTool.definition,
        filesTool.execute.bind(filesTool)
      );

      // Initialize QCode engine
      this.engine = new QCodeEngine(this.ollamaClient, this.toolRegistry, this.config, {
        workingDirectory: this.config.workingDirectory,
        enableStreaming: this.config.ollama.stream,
        debug: this.options.debug || false,
      });

      // Validate engine health in debug mode
      if (this.options.debug) {
        console.log(chalk.gray('🔧 Initializing engine components...'));
        const status = await this.engine.getStatus();
        if (!status.healthy) {
          console.warn(chalk.yellow('⚠️  Engine health check warnings:'));
          status.errors.forEach(error => console.warn(chalk.yellow(`   • ${error}`)));
        } else {
          console.log(chalk.gray('✅ Engine components initialized successfully'));
        }
        console.log();
      }
    } catch (error) {
      throw this.handleError(error, 'Failed to initialize QCode engine');
    }
  }

  /**
   * Process a one-shot query (main functionality)
   */
  async processQuery(query: string): Promise<void> {
    if (!this.config) {
      throw new QCodeError('CLI not initialized', 'CLI_NOT_INITIALIZED');
    }

    try {
      console.log(chalk.blue('🤖 QCode AI Coding Assistant'));

      if (this.options.debug) {
        console.log(chalk.gray('🔍 [DEBUG] Starting query processing...'));
        console.log(chalk.gray(`🔍 [DEBUG] Query: "${query}"`));
        console.log(chalk.gray(`🔍 [DEBUG] Working directory: ${this.config.workingDirectory}`));
        console.log(
          chalk.gray(`🔍 [DEBUG] Config loaded: ${JSON.stringify(this.config, null, 2)}`)
        );
        console.log(chalk.gray(`🔍 [DEBUG] CLI options: ${JSON.stringify(this.options, null, 2)}`));
      }

      if (this.options.verbose) {
        console.log(chalk.gray(`📂 Working directory: ${this.config.workingDirectory}`));
        console.log(chalk.gray(`🧠 Model: ${this.config.ollama.model}`));
        console.log(chalk.gray(`🔗 Ollama URL: ${this.config.ollama.url}`));
        console.log(chalk.gray(`📝 Processing query: "${query}"`));
        console.log();
      }

      // Show processing indicator
      const spinner = this.createSpinner('Processing query');

      try {
        // Process with real engine
        if (!this.engine) {
          throw new QCodeError('Engine not initialized', 'ENGINE_NOT_INITIALIZED');
        }

        if (this.options.debug) {
          console.log(chalk.gray('🔍 [DEBUG] Calling engine.processQuery()...'));
        }

        const result = await this.engine.processQuery(query);

        if (this.options.debug) {
          console.log(chalk.gray('🔍 [DEBUG] Engine result received:'));
          console.log(chalk.gray(JSON.stringify(result, null, 2)));
        }

        this.stopSpinner(spinner, '✅ Query processed successfully');
        this.displayQueryResult(result);
      } catch (error) {
        this.stopSpinner(spinner, '❌ Query processing failed');
        if (this.options.debug) {
          console.log(chalk.gray('🔍 [DEBUG] Query processing error:'));
          console.log(chalk.gray(error instanceof Error ? error.stack : JSON.stringify(error)));
        }
        throw error;
      }
    } catch (error) {
      throw this.handleError(error, 'Failed to process query');
    }
  }

  /**
   * Start interactive mode (placeholder for Phase 4)
   */
  async startInteractiveMode(): Promise<void> {
    if (!this.config) {
      throw new QCodeError('CLI not initialized', 'CLI_NOT_INITIALIZED');
    }

    console.log(chalk.blue('🤖 QCode AI Coding Assistant'));
    console.log(chalk.cyan('💬 Interactive Mode'));
    console.log();
    console.log(chalk.yellow('Interactive mode will be implemented in Phase 4'));
    console.log(chalk.gray('For now, please use one-shot mode:'));
    console.log(chalk.gray('  qcode "your query here"'));
    console.log();
    console.log(chalk.gray('Examples:'));
    console.log(chalk.gray('  qcode "list files in src/"'));
    console.log(chalk.gray('  qcode "show me the main function"'));
    console.log(chalk.gray('  qcode "explain this project structure"'));
  }

  /**
   * Display current configuration information
   */
  displayConfigInfo(): void {
    if (!this.config) {
      console.error(chalk.red('❌ CLI not initialized'));
      return;
    }

    console.log(chalk.blue('🔧 QCode Configuration'));
    console.log();

    console.log(chalk.cyan('📋 General Settings:'));
    console.log(`   Working Directory: ${chalk.white(this.config.workingDirectory)}`);
    console.log(`   Config Files: ${chalk.white(this.config.configFiles.join(', ') || 'None')}`);
    console.log();

    console.log(chalk.cyan('🧠 Ollama Settings:'));
    console.log(`   URL: ${chalk.white(this.config.ollama.url)}`);
    console.log(`   Model: ${chalk.white(this.config.ollama.model)}`);
    console.log(`   Timeout: ${chalk.white(this.config.ollama.timeout + 'ms')}`);
    console.log(`   Streaming: ${chalk.white(this.config.ollama.stream ? 'enabled' : 'disabled')}`);
    console.log(`   Temperature: ${chalk.white(this.config.ollama.temperature)}`);
    console.log();

    console.log(chalk.cyan('🔒 Security Settings:'));
    console.log(
      `   Allowed Workspace Paths: ${chalk.white(this.config.security.workspace.allowedPaths.length)}`
    );
    console.log(
      `   Allow Outside Workspace: ${chalk.white(this.config.security.workspace.allowOutsideWorkspace ? 'yes' : 'no')}`
    );
    console.log(
      `   Allowed Commands: ${chalk.white(this.config.security.commands.allowedCommands.length)}`
    );
    console.log(
      `   Allow Arbitrary Commands: ${chalk.white(this.config.security.commands.allowArbitraryCommands ? 'yes' : 'no')}`
    );
    console.log();

    const mcpServerCount = Object.keys(this.config.mcpServers).length;
    console.log(chalk.cyan('🔌 MCP Servers:'));
    if (mcpServerCount > 0) {
      Object.entries(this.config.mcpServers).forEach(([id, config]) => {
        const endpoint = config.command || config.url || 'Unknown';
        console.log(`   ${chalk.white(id)}: ${chalk.gray(endpoint)}`);
      });
    } else {
      console.log(`   ${chalk.gray('None configured')}`);
    }
    console.log();

    console.log(chalk.cyan('📊 Logging Settings:'));
    console.log(`   Level: ${chalk.white(this.config.logging.level)}`);
    console.log(`   Console: ${chalk.white(this.config.logging.console ? 'enabled' : 'disabled')}`);
    console.log(`   Colors: ${chalk.white(this.config.logging.colors ? 'enabled' : 'disabled')}`);
    console.log(
      `   Timestamps: ${chalk.white(this.config.logging.timestamp ? 'enabled' : 'disabled')}`
    );
    if (this.config.logging.file) {
      console.log(`   Log File: ${chalk.white(this.config.logging.file)}`);
    }
  }

  /**
   * Display version and system information
   */
  displayVersion(): void {
    console.log(chalk.blue('🤖 QCode AI Coding Assistant'));
    console.log(`Version: ${chalk.white('1.0.0')}`);
    console.log('Enterprise-grade TypeScript-based AI coding assistant');
    console.log();
    console.log(chalk.gray('Features:'));
    console.log(chalk.gray('  • Zero API costs with local Ollama integration'));
    console.log(chalk.gray('  • Full privacy control with local processing'));
    console.log(chalk.gray('  • MCP (Model Context Protocol) support'));
    console.log(chalk.gray('  • Advanced security and workspace isolation'));
    console.log(chalk.gray('  • Extensible tool system'));
  }

  /**
   * Display the results of a query processing
   */
  private displayQueryResult(result: any): void {
    console.log();

    // Display the main response
    if (result.response) {
      console.log(chalk.white(result.response));
    }

    // Display tool execution information in verbose mode
    if (this.options.verbose && result.toolsExecuted?.length > 0) {
      console.log();
      console.log(chalk.cyan('🔧 Tools executed:'));
      result.toolsExecuted.forEach((tool: string) => {
        console.log(chalk.gray(`   • ${tool}`));
      });
    }

    // Display timing information in verbose mode
    if (this.options.verbose && result.processingTime) {
      console.log();
      console.log(chalk.gray(`⏱️  Processing time: ${result.processingTime}ms`));
    }

    // Display errors if any
    if (result.errors && result.errors.length > 0) {
      console.log();
      console.log(chalk.yellow('⚠️  Warnings/Errors:'));
      result.errors.forEach((error: any) => {
        console.log(chalk.yellow(`   • ${error.message}`));
      });
    }

    // Show file operation results
    if (result.toolResults && result.toolResults.length > 0) {
      const fileResults = result.toolResults.filter((tr: any) => tr.toolName?.includes('files'));
      if (fileResults.length > 0 && this.options.verbose) {
        console.log();
        console.log(chalk.gray('📋 File operation details:'));
        fileResults.forEach((tr: any) => {
          console.log(chalk.gray(`   • ${tr.toolName}: ${tr.success ? 'success' : 'failed'}`));
        });
      }
    }

    console.log();
  }

  /**
   * Handle errors with proper formatting and context
   */
  private handleError(error: unknown, context: string): QCodeError {
    if (error instanceof QCodeError) {
      return error;
    }

    if (error instanceof Error) {
      return new QCodeError(`${context}: ${error.message}`, 'CLI_ERROR', {
        originalError: error.message,
        context,
      });
    }

    return new QCodeError(`${context}: Unknown error occurred`, 'CLI_UNKNOWN_ERROR', {
      context,
      error,
    });
  }

  /**
   * Create a spinner for progress indication
   */
  private createSpinner(message: string): { interval: NodeJS.Timeout } {
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let i = 0;

    const interval = setInterval(() => {
      process.stdout.write(`\r${chalk.cyan(frames[i])} ${message}...`);
      i = (i + 1) % frames.length;
    }, 100);

    return { interval };
  }

  /**
   * Stop the spinner and show completion status
   */
  private stopSpinner(spinner: { interval: NodeJS.Timeout }, message: string): void {
    clearInterval(spinner.interval);
    process.stdout.write(`\r${message}\n`);
  }
}

/**
 * Main CLI program setup using Commander.js
 */
const program = new Command();

program
  .name('qcode')
  .description('Enterprise-grade TypeScript-based AI coding assistant')
  .version('1.0.0');

// Main command: process query
program
  .argument('[query]', 'Query to process with QCode')
  .option('-c, --config <path>', 'Path to configuration file')
  .option('-w, --workspace <path>', 'Workspace directory path')
  .option('-v, --verbose', 'Enable verbose output')
  .option('-d, --debug', 'Enable debug mode')
  .option('-m, --model <model>', 'Ollama model to use (overrides config)')
  .option('--no-stream', 'Disable streaming responses')
  .option('--timeout <ms>', 'Request timeout in milliseconds', parseInt)
  .action(async (query: string | undefined, options: CLIOptions) => {
    const cli = new QCodeCLI();

    try {
      await cli.initialize(options);

      if (!query) {
        await cli.startInteractiveMode();
      } else {
        await cli.processQuery(query);
      }
    } catch (error) {
      console.error();
      if (error instanceof QCodeError) {
        console.error(chalk.red('❌ Error:'), error.message);

        if (options.debug && error.context) {
          console.error(chalk.gray('🔍 Debug context:'));
          console.error(chalk.gray(JSON.stringify(error.context, null, 2)));
        }

        if (error.retryable) {
          console.error(chalk.yellow('🔄 This error might be retryable. Please try again.'));
        }
      } else {
        console.error(chalk.red('💥 Unexpected error:'), error);
      }

      process.exit(1);
    }
  });

// Config command: display configuration
program
  .command('config')
  .description('Display current configuration settings')
  .option('-c, --config <path>', 'Path to configuration file')
  .option('-w, --workspace <path>', 'Workspace directory path')
  .option('-d, --debug', 'Enable debug mode')
  .option('-m, --model <model>', 'Ollama model to use (overrides config)')
  .action(async (options: CLIOptions) => {
    const cli = new QCodeCLI();

    try {
      await cli.initialize(options);
      cli.displayConfigInfo();
    } catch (error) {
      if (error instanceof QCodeError) {
        console.error(chalk.red('❌ Error:'), error.message);
      } else {
        console.error(chalk.red('💥 Unexpected error:'), error);
      }
      process.exit(1);
    }
  });

// Version command: show version information
program
  .command('version')
  .description('Display version information')
  .action(() => {
    const cli = new QCodeCLI();
    cli.displayVersion();
  });

// Parse command line arguments
program.parse();

export default program;
