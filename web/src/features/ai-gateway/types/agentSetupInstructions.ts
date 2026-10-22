import type { GatewayProvider } from "@/src/features/ai-gateway/types/gatewayProvider";

/** What the snippets are rendered from; the secret key is deliberately not part of it. */
export type AgentSetupContext = {
  /** Gateway origin without a path, e.g. `https://staging.langfuse.com`. */
  gatewayOrigin: string;
  /** Sent as `langfuse-user-id`; already safe to embed in shell, TOML and JSON strings. */
  userId: string;
  /** Providers with an enabled connection in the organization. */
  providers: GatewayProvider[];
};

export type AgentSetupStep = {
  title: string;
  description?: string;
  language: "sh" | "toml" | "json";
  code: string;
};

export type AgentSetupInstructions = {
  id: "api" | "claude-code" | "codex" | "opencode";
  label: string;
  /** First line of the "Copy for agent" Markdown. */
  heading: string;
  summary: string;
  docsUrl: string;
  /** Set when the organization lacks a provider connection the tool needs. */
  warning?: string;
  steps: AgentSetupStep[];
};
