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
    } catch (error) {
      throw this.handleError(error, 'Failed to initialize QCode CLI');
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
        // TODO: This will be replaced with actual engine implementation in section 1.9
        // For now, simulate the processing to demonstrate the CLI functionality
        await this.simulateQueryProcessing(query);

        // Future implementation will be:
        // const engine = new QCodeEngine(this.config);
        // const result = await engine.processQuery(query);
        // this.displayQueryResult(result);

        this.stopSpinner(spinner, '✅ Query processed successfully');
      } catch (error) {
        this.stopSpinner(spinner, '❌ Query processing failed');
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
   * Simulate query processing (placeholder until engine is implemented)
   */
  private async simulateQueryProcessing(query: string): Promise<void> {
    // Simulate realistic processing time
    const processingTime = 800 + Math.random() * 1200;
    await new Promise(resolve => setTimeout(resolve, processingTime));

    if (this.options.verbose) {
      console.log();
      console.log(chalk.gray('🔄 Simulated processing steps:'));
      console.log(chalk.gray('   1. Parse query and extract intent'));
      console.log(chalk.gray('   2. Initialize tool registry with security config'));
      console.log(chalk.gray('   3. Connect to Ollama model'));
      console.log(chalk.gray('   4. Execute query with available tools'));
      console.log(chalk.gray('   5. Format and return response'));
      console.log();
    }

    // Display placeholder response
    console.log(chalk.green(`✅ Successfully processed query: "${query}"`));
    console.log();
    console.log(chalk.yellow('📝 Note: This is a placeholder response.'));
    console.log(chalk.gray('   Full query processing will be available after implementing:'));
    console.log(chalk.gray('   • Section 1.7: Internal File Operations Tool'));
    console.log(chalk.gray('   • Section 1.9: Core Engine'));
    console.log();
    console.log(chalk.cyan('💡 Try these commands to test the CLI:'));
    console.log(chalk.gray('   qcode config           # View configuration'));
    console.log(chalk.gray('   qcode version          # Show version info'));
    console.log(chalk.gray('   qcode --verbose "test" # Verbose output'));
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
