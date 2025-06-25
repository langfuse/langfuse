import path from 'path';
import * as yaml from 'yaml';
import { McpConfig, AgentDefinition } from './types.js';
import { fileExists, readFile, writeFile, backupFile, log } from './utils.js';

export class McpManager {
  private verbose: boolean = false;

  constructor(verbose: boolean = false) {
    this.verbose = verbose;
  }

  async applyMcpConfig(
    agent: AgentDefinition,
    mcpConfig: McpConfig | null,
    projectRoot: string
  ): Promise<void> {
    if (!agent.mcpEnabled || !mcpConfig) {
      log(`MCP not enabled for ${agent.name} or no MCP config found`, this.verbose);
      return;
    }

    log(`Applying MCP configuration for ${agent.name}`, this.verbose);

    switch (agent.name) {
      case 'cursor':
        await this.applyCursorMcp(mcpConfig, projectRoot, agent.mcpMergeStrategy || 'merge');
        break;
      case 'windsurf':
        await this.applyWindsurfMcp(mcpConfig, projectRoot, agent.mcpMergeStrategy || 'merge');
        break;
      default:
        log(`MCP not supported for agent: ${agent.name}`, this.verbose);
    }
  }

  private async applyCursorMcp(
    mcpConfig: McpConfig,
    projectRoot: string,
    mergeStrategy: 'merge' | 'overwrite'
  ): Promise<void> {
    const configPath = path.join(projectRoot, '.cursor', 'mcp.json');
    
    await this.applyJsonMcp(configPath, mcpConfig, mergeStrategy);
  }

  private async applyWindsurfMcp(
    mcpConfig: McpConfig,
    projectRoot: string,
    mergeStrategy: 'merge' | 'overwrite'
  ): Promise<void> {
    const configPath = path.join(projectRoot, '.windsurf', 'mcp.json');
    
    await this.applyJsonMcp(configPath, mcpConfig, mergeStrategy);
  }

  private async applyJsonMcp(
    configPath: string,
    mcpConfig: McpConfig,
    mergeStrategy: 'merge' | 'overwrite'
  ): Promise<void> {
    log(`Applying JSON MCP config to: ${configPath}`, this.verbose);

    let finalConfig = mcpConfig;

    if (mergeStrategy === 'merge' && await fileExists(configPath)) {
      await backupFile(configPath);
      
      try {
        const existingContent = await readFile(configPath);
        const existingConfig = JSON.parse(existingContent);
        
        // Merge configurations
        finalConfig = {
          mcpServers: {
            ...existingConfig.mcpServers,
            ...mcpConfig.mcpServers,
          },
        };
        
        log('Merged with existing MCP configuration', this.verbose);
      } catch (error) {
        log(`Warning: Could not parse existing MCP config, using new config only: ${error}`, this.verbose);
      }
    } else if (await fileExists(configPath)) {
      await backupFile(configPath);
    }

    await writeFile(configPath, JSON.stringify(finalConfig, null, 2));
    log(`MCP configuration written to: ${configPath}`, this.verbose);
  }

  private async applyYamlMcp(
    configPath: string,
    mcpConfig: McpConfig,
    mergeStrategy: 'merge' | 'overwrite'
  ): Promise<void> {
    log(`Applying YAML MCP config to: ${configPath}`, this.verbose);

    let finalConfig = mcpConfig;

    if (mergeStrategy === 'merge' && await fileExists(configPath)) {
      await backupFile(configPath);
      
      try {
        const existingContent = await readFile(configPath);
        const existingConfig = yaml.parse(existingContent);
        
        // Merge configurations
        finalConfig = {
          mcpServers: {
            ...existingConfig.mcpServers,
            ...mcpConfig.mcpServers,
          },
        };
        
        log('Merged with existing MCP configuration', this.verbose);
      } catch (error) {
        log(`Warning: Could not parse existing MCP config, using new config only: ${error}`, this.verbose);
      }
    } else if (await fileExists(configPath)) {
      await backupFile(configPath);
    }

    await writeFile(configPath, yaml.stringify(finalConfig));
    log(`MCP configuration written to: ${configPath}`, this.verbose);
  }
}