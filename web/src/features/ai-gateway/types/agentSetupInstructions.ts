import type { GatewayProvider } from "@/src/features/ai-gateway/types/gatewayProvider";

/** What the snippets are rendered from; the secret key is deliberately not part of it. */
export type AgentSetupContext = {
  /** Gateway origin without a path, e.g. `https://gateway.staging.langfuse.com`. */
  gatewayOrigin: string;
  /** Providers with an enabled connection in the organization. */
  providers: GatewayProvider[];
};

export type AgentSetupStep = {
  title: string;
  description?: string;
  /** External docs link shown after the description. */
  link?: { label: string; href: string };
} & (
  | { language: "sh" | "toml" | "json" | "text"; code: string }
  /** A step done in a settings UI, with nothing to paste. */
  | { language?: never; code?: never }
);

export type AgentSetupInstructions = {
  id:
    | "api"
    | "claude-desktop"
    | "claude-code"
    | "codex"
    | "opencode"
    | "copilot-cli"
    | "copilot-desktop";
  label: string;
  /** First line of the "Copy for agent" Markdown. */
  heading: string;
  summary: string;
  docsUrl: string;
  /** Set when the organization lacks a provider connection the tool needs. */
  warning?: string;
  steps: AgentSetupStep[];
};
