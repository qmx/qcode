#!/usr/bin/env node

/**
 * QCode CLI - Command-line interface for the QCode AI coding assistant
 */

import { Command } from 'commander';
import chalk from 'chalk';

const program = new Command();

program
  .name('qcode')
  .description('Enterprise-grade TypeScript-based AI coding assistant')
  .version('1.0.0');

program
  .argument('[query]', 'Query to process with QCode')
  .option('-c, --config <path>', 'Path to configuration file')
  .option('-w, --workspace <path>', 'Workspace directory path')
  .option('-v, --verbose', 'Enable verbose output')
  .option('-d, --debug', 'Enable debug mode')
  .action(async (query: string, _options) => {
    try {
      // eslint-disable-next-line no-console
      console.log(chalk.blue('🤖 QCode AI Coding Assistant'));

      if (!query) {
        // eslint-disable-next-line no-console
        console.log(chalk.yellow('No query provided. Starting interactive mode...'));
        // eslint-disable-next-line no-console
        console.log(chalk.gray('Interactive mode will be implemented in Phase 4'));
        return;
      }

      // eslint-disable-next-line no-console
      console.log(chalk.green(`Processing query: ${query}`));
      // eslint-disable-next-line no-console
      console.log(chalk.gray('Core engine will be implemented in Phase 1'));

      // Implementation will come in Phase 1
      // Note: options will be used when core engine is implemented
      throw new Error('Core engine not yet implemented');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program.parse();

export default program;
