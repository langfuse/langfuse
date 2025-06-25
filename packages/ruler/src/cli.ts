#!/usr/bin/env node

import { Command } from 'commander';
import { Ruler } from './ruler.js';
import { ApplyOptions } from './types.js';
import { error } from './utils.js';

const program = new Command();

program
  .name('ruler')
  .description('Centralise Your AI Coding Assistant Instructions')
  .version('0.2.3');

program
  .command('init')
  .description('Initialize Ruler in the current project')
  .option('--project-root <path>', 'Path to your project root', process.cwd())
  .action(async (options) => {
    try {
      const ruler = new Ruler();
      await ruler.init(options.projectRoot);
    } catch (err) {
      error(`Failed to initialize: ${err instanceof Error ? err.message : 'Unknown error'}`);
      process.exit(1);
    }
  });

program
  .command('apply')
  .description('Apply rules to AI agents')
  .option('--project-root <path>', 'Path to your project root', process.cwd())
  .option('--agents <agents>', 'Comma-separated list of agent names to target')
  .option('--config <path>', 'Path to a custom ruler.toml configuration file')
  .option('--mcp, --with-mcp', 'Enable applying MCP server configurations', true)
  .option('--no-mcp', 'Disable applying MCP server configurations')
  .option('--mcp-overwrite', 'Overwrite native MCP config entirely instead of merging', false)
  .option('--gitignore', 'Enable automatic .gitignore updates', true)
  .option('--no-gitignore', 'Disable automatic .gitignore updates')
  .option('--verbose, -v', 'Display detailed output during execution', false)
  .action(async (options) => {
    try {
      const applyOptions: ApplyOptions = {
        projectRoot: options.projectRoot,
        agents: options.agents ? options.agents.split(',').map((s: string) => s.trim()) : undefined,
        config: options.config,
        mcp: options.mcp,
        mcpOverwrite: options.mcpOverwrite,
        gitignore: options.gitignore,
        verbose: options.verbose,
      };

      const ruler = new Ruler(options.verbose);
      await ruler.apply(applyOptions);
    } catch (err) {
      error(`Failed to apply: ${err instanceof Error ? err.message : 'Unknown error'}`);
      process.exit(1);
    }
  });

// Handle unknown commands
program
  .command('*', { hidden: true })
  .action((cmd) => {
    error(`Unknown command: ${cmd}`);
    program.help();
  });

program.parse();