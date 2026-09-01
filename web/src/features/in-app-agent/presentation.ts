export type InAppAgentDock = "sidebar" | "detached";

export const IN_APP_AGENT_DOCK_STORAGE_KEY = "langfuse:in-app-ai-agent-dock";

export function parseInAppAgentDock(value: unknown): InAppAgentDock {
  return value === "detached" ? "detached" : "sidebar";
}
