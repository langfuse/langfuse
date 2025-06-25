import path from 'path';
import { RulerConfig, AgentDefinition, DEFAULT_AGENTS, ApplyOptions, McpConfig } from './types.js';
import { fileExists, readFile, parseToml, normalizeAgentName, matchesAgent, log } from './utils.js';

export class ConfigManager {
  private config: RulerConfig = {};
  private verbose: boolean = false;

  constructor(verbose: boolean = false) {
    this.verbose = verbose;
  }

  async loadConfig(configPath?: string, projectRoot: string = process.cwd()): Promise<void> {
    const rulerConfigPath = configPath || path.join(projectRoot, '.ruler', 'ruler.toml');
    
    log(`Loading configuration from: ${rulerConfigPath}`, this.verbose);
    
    if (await fileExists(rulerConfigPath)) {
      try {
        const content = await readFile(rulerConfigPath);
        this.config = parseToml(content);
        log('Configuration loaded successfully', this.verbose);
      } catch (error) {
        throw new Error(`Failed to load configuration from ${rulerConfigPath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    } else {
      log('No configuration file found, using defaults', this.verbose);
      this.config = {};
    }
  }

  async loadMcpConfig(projectRoot: string): Promise<McpConfig | null> {
    const mcpConfigPath = path.join(projectRoot, '.ruler', 'mcp.json');
    
    if (await fileExists(mcpConfigPath)) {
      try {
        const content = await readFile(mcpConfigPath);
        return JSON.parse(content);
      } catch (error) {
        throw new Error(`Failed to load MCP configuration from ${mcpConfigPath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
    
    return null;
  }

  getEnabledAgents(options: ApplyOptions): AgentDefinition[] {
    const agents: AgentDefinition[] = [];
    
    // Determine which agents to process
    const targetAgents = options.agents || this.config.default_agents || Object.keys(DEFAULT_AGENTS);
    
    log(`Target agents: ${targetAgents.join(', ')}`, this.verbose);
    
    for (const [agentName, defaultAgent] of Object.entries(DEFAULT_AGENTS)) {
      // Check if this agent is targeted
      const isTargeted = targetAgents.some(target => matchesAgent(agentName, target));
      if (!isTargeted) {
        continue;
      }
      
      // Get agent-specific config
      const agentConfig = this.config.agents?.[agentName] || {};
      
      // Check if agent is enabled
      const enabled = agentConfig.enabled !== false && defaultAgent.enabled;
      if (!enabled) {
        log(`Agent ${agentName} is disabled`, this.verbose);
        continue;
      }
      
      // Create agent definition with merged config
      const agent: AgentDefinition = {
        name: agentName,
        enabled: true,
        outputPath: agentConfig.output_path || defaultAgent.outputPath,
        outputPathInstructions: agentConfig.output_path_instructions || defaultAgent.outputPathInstructions,
        outputPathConfig: agentConfig.output_path_config || defaultAgent.outputPathConfig,
        mcpEnabled: this.getMcpEnabled(agentName, options),
        mcpMergeStrategy: this.getMcpMergeStrategy(agentName, options),
      };
      
      agents.push(agent);
      log(`Added agent: ${agentName}`, this.verbose);
    }
    
    return agents;
  }

  private getMcpEnabled(agentName: string, options: ApplyOptions): boolean {
    // CLI options take precedence
    if (options.mcp !== undefined) {
      return options.mcp;
    }
    
    // Agent-specific config
    const agentConfig = this.config.agents?.[agentName];
    if (agentConfig?.mcp?.enabled !== undefined) {
      return agentConfig.mcp.enabled;
    }
    
    // Global config
    if (this.config.mcp?.enabled !== undefined) {
      return this.config.mcp.enabled;
    }
    
    // Default from agent definition
    return DEFAULT_AGENTS[agentName]?.mcpEnabled || false;
  }

  private getMcpMergeStrategy(agentName: string, options: ApplyOptions): 'merge' | 'overwrite' {
    // CLI options take precedence
    if (options.mcpOverwrite) {
      return 'overwrite';
    }
    
    // Agent-specific config
    const agentConfig = this.config.agents?.[agentName];
    if (agentConfig?.mcp?.merge_strategy) {
      return agentConfig.mcp.merge_strategy;
    }
    
    // Global config
    if (this.config.mcp?.merge_strategy) {
      return this.config.mcp.merge_strategy;
    }
    
    // Default
    return DEFAULT_AGENTS[agentName]?.mcpMergeStrategy || 'merge';
  }

  isGitignoreEnabled(options: ApplyOptions): boolean {
    // CLI options take precedence
    if (options.gitignore !== undefined) {
      return options.gitignore;
    }
    
    // Global config
    if (this.config.gitignore?.enabled !== undefined) {
      return this.config.gitignore.enabled;
    }
    
    // Default
    return true;
  }

  getConfig(): RulerConfig {
    return this.config;
  }
}