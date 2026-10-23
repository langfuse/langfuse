import { CATEGORY_COUNTS, integrationOf } from "../../integrations/catalog";

/** One block of a coding agent's plugin setup, as its guide gives it: commands to run, or config to add. */
type InstallBlock = { kind: "command" | "config"; title: string; code: string };

/** A coding agent's plugin setup, written by hand from its guide so a regenerated catalog can't cut it short. */
export type AgentInstall = {
  blocks: InstallBlock[];
  /** What the blocks leave out that a first run trips on; `null` when nothing does. */
  note: string | null;
};

type CodingAgent = {
  /** Its integration in the catalog. */
  slug: string;
  /** How the agents scene names and draws it. */
  cli: string;
  logo: string;
  label: string;
  install: AgentInstall;
};

/** The coding agents offered by name, with their plugin setup from langfuse-docs content/integrations/developer-tools. */
export const CODING_AGENTS = [
  {
    slug: "claude-code",
    cli: "claude-code",
    logo: "claude",
    label: "Claude Code",
    install: {
      blocks: [
        {
          kind: "command",
          title: "Install the plugin",
          code: "claude plugin marketplace add langfuse/Claude-Observability-Plugin\nclaude plugin install langfuse-observability@langfuse-observability",
        },
      ],
      note: 'Needs Python 3.9+ with pip install "langfuse>=4.0,<5". Restart Claude Code; enabling the plugin asks for your keys.',
    },
  },
  {
    slug: "codex",
    cli: "codex",
    logo: "openai",
    label: "Codex",
    install: {
      blocks: [
        {
          kind: "command",
          title: "Install the plugin",
          code: "codex plugin marketplace add langfuse/codex-observability-plugin\ncodex plugin add tracing@codex-observability-plugin",
        },
        {
          kind: "config",
          title: "Turn it on in ~/.codex/config.toml",
          code: '[features]\nhooks = true\n\n[plugins."tracing@codex-observability-plugin"]\nenabled = true',
        },
      ],
      note: 'Set TRACE_TO_LANGFUSE="true" with your keys, restart Codex and approve the Langfuse Stop hook when it asks.',
    },
  },
  {
    slug: "opencode",
    cli: "opencode",
    logo: "opencode",
    label: "OpenCode",
    install: {
      blocks: [
        {
          kind: "config",
          title: "Add the plugin to opencode.json",
          code: '{\n  "plugins": ["@langfuse/opencode-observability-plugin@latest"]\n}',
        },
      ],
      note: "That's OpenCode 2; from 1.18.29 to 2 the key is plugin, not plugins. Restart OpenCode after.",
    },
  },
  {
    slug: "pi-agent",
    cli: "pi",
    logo: "pi",
    label: "Pi",
    install: {
      blocks: [
        {
          kind: "command",
          title: "Install the extension",
          code: "pi install npm:@langfuse/pi-observability-plugin",
        },
      ],
      note: "Needs Node.js 22 or newer, and a model login (/login in pi).",
    },
  },
] as const satisfies readonly CodingAgent[];

/** How many coding agents the catalog has beyond the ones offered by name. */
export const MORE_AGENTS =
  (CATEGORY_COUNTS["developer-tools"] ?? 0) - CODING_AGENTS.length;

/** A coding agent's integration: one whose traces are an agent's own turns, not an app's. */
export function codingAgentOf(slug: string) {
  const integration = integrationOf(slug);
  return integration?.category === "developer-tools" ? integration : undefined;
}

/** The hand-written plugin setup of a coding agent offered by name; `null` for the rest, whose guide has it. */
export function agentInstallOf(slug: string): AgentInstall | null {
  return CODING_AGENTS.find((agent) => agent.slug === slug)?.install ?? null;
}
