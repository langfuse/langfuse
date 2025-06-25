export interface RulerConfig {
  default_agents?: string[];
  mcp?: {
    enabled?: boolean;
    merge_strategy?: 'merge' | 'overwrite';
  };
  gitignore?: {
    enabled?: boolean;
  };
  agents?: {
    [agentName: string]: AgentConfig;
  };
}

export interface AgentConfig {
  enabled?: boolean;
  output_path?: string;
  output_path_instructions?: string;
  output_path_config?: string;
  mcp?: {
    enabled?: boolean;
    merge_strategy?: 'merge' | 'overwrite';
  };
}

export interface McpServer {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface McpConfig {
  mcpServers: Record<string, McpServer>;
}

export interface AgentDefinition {
  name: string;
  enabled: boolean;
  outputPath?: string;
  outputPathInstructions?: string;
  outputPathConfig?: string;
  mcpEnabled?: boolean;
  mcpMergeStrategy?: 'merge' | 'overwrite';
}

export interface ApplyOptions {
  projectRoot: string;
  agents?: string[];
  config?: string;
  mcp?: boolean;
  mcpOverwrite?: boolean;
  gitignore?: boolean;
  verbose?: boolean;
}

export const DEFAULT_AGENTS: Record<string, AgentDefinition> = {
  copilot: {
    name: 'copilot',
    enabled: true,
    outputPath: '.github/copilot-instructions.md',
    mcpEnabled: false,
  },
  claude: {
    name: 'claude',
    enabled: true,
    outputPath: 'CLAUDE.md',
    mcpEnabled: false,
  },
  codex: {
    name: 'codex',
    enabled: true,
    outputPath: 'AGENTS.md',
    mcpEnabled: false,
  },
  cursor: {
    name: 'cursor',
    enabled: true,
    outputPath: '.cursor/rules/ruler_cursor_instructions.md',
    mcpEnabled: true,
    mcpMergeStrategy: 'merge',
  },
  windsurf: {
    name: 'windsurf',
    enabled: true,
    outputPath: '.windsurf/rules/ruler_windsurf_instructions.md',
    mcpEnabled: true,
    mcpMergeStrategy: 'merge',
  },
  cline: {
    name: 'cline',
    enabled: true,
    outputPath: '.clinerules',
    mcpEnabled: false,
  },
  aider: {
    name: 'aider',
    enabled: true,
    outputPathInstructions: 'ruler_aider_instructions.md',
    outputPathConfig: '.aider.conf.yml',
    mcpEnabled: false,
  },
  firebase: {
    name: 'firebase',
    enabled: true,
    outputPath: '.idx/airules.md',
    mcpEnabled: false,
  },
  openhands: {
    name: 'openhands',
    enabled: true,
    outputPath: '.openhands/microagents/repo.md',
    outputPathConfig: '.openhands/config.toml',
    mcpEnabled: false,
  },
};