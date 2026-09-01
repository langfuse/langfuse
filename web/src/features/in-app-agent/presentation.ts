export const IN_APP_AGENT_DOCKS = ["sidebar", "detached"] as const;

export type InAppAgentDock = (typeof IN_APP_AGENT_DOCKS)[number];

export type InAppAgentPresentation = InAppAgentDock | "fullscreen";

export const IN_APP_AGENT_DOCK_STORAGE_KEY = "langfuse:in-app-ai-agent-dock";

export function parseInAppAgentDock(value: unknown): InAppAgentDock {
  return value === "detached" ? "detached" : "sidebar";
}
