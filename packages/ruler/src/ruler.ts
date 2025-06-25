import path from 'path';
import * as yaml from 'yaml';
import { ApplyOptions, AgentDefinition } from './types.js';
import { ConfigManager } from './config.js';
import { McpManager } from './mcp.js';
import { GitignoreManager } from './gitignore.js';
import {
  fileExists,
  readFile,
  writeFile,
  ensureDir,
  findMarkdownFiles,
  concatenateMarkdownFiles,
  backupFile,
  log,
  info,
  error,
} from './utils.js';

export class Ruler {
  private configManager: ConfigManager;
  private mcpManager: McpManager;
  private gitignoreManager: GitignoreManager;

  constructor(verbose: boolean = false) {
    this.configManager = new ConfigManager(verbose);
    this.mcpManager = new McpManager(verbose);
    this.gitignoreManager = new GitignoreManager(verbose);
  }

  async init(projectRoot: string = process.cwd()): Promise<void> {
    info('Initializing Ruler in project...');

    const rulerDir = path.join(projectRoot, '.ruler');
    await ensureDir(rulerDir);

    // Create instructions.md
    const instructionsPath = path.join(rulerDir, 'instructions.md');
    if (!(await fileExists(instructionsPath))) {
      const instructionsContent = `# Project Instructions

## Coding Style

- Follow consistent coding patterns throughout the project
- Use meaningful variable and function names
- Add comments for complex logic

## Architecture

- Describe your project's architecture and key components here
- Document important design decisions
- Explain how different modules interact

## Security

- Always validate user input
- Follow security best practices for your technology stack
- Be mindful of potential vulnerabilities

## Testing

- Write comprehensive tests for new functionality
- Maintain good test coverage
- Use descriptive test names

## Documentation

- Keep documentation up to date
- Document public APIs and interfaces
- Provide examples where helpful
`;
      await writeFile(instructionsPath, instructionsContent);
      info(`Created: ${path.relative(projectRoot, instructionsPath)}`);
    }

    // Create ruler.toml
    const configPath = path.join(rulerDir, 'ruler.toml');
    if (!(await fileExists(configPath))) {
      const configContent = `# Default agents to run when --agents is not specified
# Uses case-insensitive substring matching
default_agents = ["copilot", "claude", "cursor"]

# --- Global MCP Server Configuration ---
[mcp]
# Enable/disable MCP propagation globally (default: true)
enabled = true
# Global merge strategy: 'merge' or 'overwrite' (default: 'merge')
merge_strategy = "merge"

# --- Global .gitignore Configuration ---
[gitignore]
# Enable/disable automatic .gitignore updates (default: true)
enabled = true

# --- Agent-Specific Configurations ---
[agents.copilot]
enabled = true
output_path = ".github/copilot-instructions.md"

[agents.claude]
enabled = true
output_path = "CLAUDE.md"

[agents.cursor]
enabled = true
output_path = ".cursor/rules/ruler_cursor_instructions.md"

# Agent-specific MCP configuration
[agents.cursor.mcp]
enabled = true
merge_strategy = "merge"

# Disable specific agents by setting enabled = false
# [agents.windsurf]
# enabled = false
`;
      await writeFile(configPath, configContent);
      info(`Created: ${path.relative(projectRoot, configPath)}`);
    }

    // Create mcp.json
    const mcpPath = path.join(rulerDir, 'mcp.json');
    if (!(await fileExists(mcpPath))) {
      const mcpContent = {
        mcpServers: {
          filesystem: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem', projectRoot],
          },
          git: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-git', '--repository', '.'],
          },
        },
      };
      await writeFile(mcpPath, JSON.stringify(mcpContent, null, 2));
      info(`Created: ${path.relative(projectRoot, mcpPath)}`);
    }

    info('Ruler initialization complete!');
    info('Next steps:');
    info('1. Edit .ruler/instructions.md with your project-specific rules');
    info('2. Customize .ruler/ruler.toml if needed');
    info('3. Run "ruler apply" to distribute rules to AI agents');
  }

  async apply(options: ApplyOptions): Promise<void> {
    try {
      log('Starting Ruler apply operation', options.verbose || false);

      // Load configuration
      await this.configManager.loadConfig(options.config, options.projectRoot);
      
      // Load MCP configuration if needed
      const mcpConfig = options.mcp !== false 
        ? await this.configManager.loadMcpConfig(options.projectRoot)
        : null;

      // Get enabled agents
      const agents = this.configManager.getEnabledAgents(options);
      
      if (agents.length === 0) {
        info('No enabled agents found. Check your configuration.');
        return;
      }

      info(`Processing ${agents.length} agents: ${agents.map(a => a.name).join(', ')}`);

      // Load and concatenate rule files
      const rulerDir = path.join(options.projectRoot, '.ruler');
      const ruleFiles = await findMarkdownFiles(rulerDir);
      
      if (ruleFiles.length === 0) {
        error('No rule files (*.md) found in .ruler directory');
        return;
      }

      const concatenatedRules = await concatenateMarkdownFiles(ruleFiles, rulerDir);
      log(`Concatenated ${ruleFiles.length} rule files`, options.verbose || false);

      // Apply rules to each agent
      for (const agent of agents) {
        await this.applyAgentRules(agent, concatenatedRules, options.projectRoot, options.verbose || false);
        
        // Apply MCP configuration if enabled
        if (mcpConfig) {
          await this.mcpManager.applyMcpConfig(agent, mcpConfig, options.projectRoot);
        }
      }

      // Update .gitignore if enabled
      if (this.configManager.isGitignoreEnabled(options)) {
        await this.gitignoreManager.updateGitignore(agents, options.projectRoot);
      }

      info('Ruler apply completed successfully!');
    } catch (err) {
      error(`Failed to apply ruler configuration: ${err instanceof Error ? err.message : 'Unknown error'}`);
      throw err;
    }
  }

  private async applyAgentRules(
    agent: AgentDefinition,
    rules: string,
    projectRoot: string,
    verbose: boolean
  ): Promise<void> {
    log(`Applying rules for agent: ${agent.name}`, verbose);

    // Handle agents with instruction files
    if (agent.outputPath) {
      const outputPath = path.join(projectRoot, agent.outputPath);
      await backupFile(outputPath);
      await writeFile(outputPath, rules);
      log(`Written rules to: ${agent.outputPath}`, verbose);
    }

    if (agent.outputPathInstructions) {
      const outputPath = path.join(projectRoot, agent.outputPathInstructions);
      await backupFile(outputPath);
      await writeFile(outputPath, rules);
      log(`Written rules to: ${agent.outputPathInstructions}`, verbose);
    }

    // Handle agent-specific config files
    if (agent.outputPathConfig) {
      await this.writeAgentConfig(agent, projectRoot, verbose);
    }
  }

  private async writeAgentConfig(
    agent: AgentDefinition,
    projectRoot: string,
    verbose: boolean
  ): Promise<void> {
    if (!agent.outputPathConfig) return;

    const configPath = path.join(projectRoot, agent.outputPathConfig);
    
    switch (agent.name) {
      case 'aider':
        await this.writeAiderConfig(configPath, verbose);
        break;
      case 'openhands':
        await this.writeOpenHandsConfig(configPath, verbose);
        break;
      default:
        log(`No specific config handling for agent: ${agent.name}`, verbose);
    }
  }

  private async writeAiderConfig(configPath: string, verbose: boolean): Promise<void> {
    const aiderConfig = {
      'auto-commits': false,
      'dirty-commits': false,
      verbose: true,
    };

    await backupFile(configPath);
    await writeFile(configPath, yaml.stringify(aiderConfig));
    log(`Written Aider config to: ${configPath}`, verbose);
  }

  private async writeOpenHandsConfig(configPath: string, verbose: boolean): Promise<void> {
    const openHandsConfig = {
      workspace_base: '.',
      persist_sandbox: false,
      runtime: 'eventstream',
    };

    await backupFile(configPath);
    await writeFile(configPath, yaml.stringify(openHandsConfig));
    log(`Written OpenHands config to: ${configPath}`, verbose);
  }
}