type AgentsTool = {
  /** The tool, as the agent names it: Read, Edit, Bash. */
  name: string;
  /** How long it ran, from 0 to 1 of the longest call: the length of its warm time bar. */
  share?: number;
};

type AgentsAgent = {
  /** As its CLI names itself: claude-code, codex. */
  name: string;
  /** Its mark, drawn on the block in its own colours in place of `>_`; left out, the block shows `>_`. */
  logo?: AgentLogo;
};

/** The coding agents the scene has a mark for. */
export type AgentLogo = "claude" | "openai" | "opencode" | "pi";

export type AgentsContent = {
  /** The agents the raised block shows, one per run. */
  agents: AgentsAgent[];
  /** Which agent to show; left out, the block moves to the next one each run. */
  active?: number;
  /** One span per tool call, up to three. */
  tools: AgentsTool[];
};

/** Characters per slot before an ellipsis; the frame is sized for these. */
export const AGENTS_LIMITS = {
  agent: 12,
  tool: 5,
  agents: 6,
  tools: 3,
} as const;

export const AGENTS_DEFAULTS: AgentsContent = {
  agents: [
    { name: "claude-code", logo: "claude" },
    { name: "codex", logo: "openai" },
    { name: "opencode", logo: "opencode" },
    { name: "pi", logo: "pi" },
  ],
  tools: [
    { name: "Read", share: 0.12 },
    { name: "Edit", share: 0.3 },
    { name: "Bash", share: 1 },
  ],
};
