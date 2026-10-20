import { env } from "../../env";

export function isTopicsEnabled(): boolean {
  return env.LANGFUSE_TOPICS_ENABLED === "true";
}

export function isTopicsProjectEnabled(projectId: string): boolean {
  return (
    isTopicsEnabled() &&
    (env.LANGFUSE_TOPICS_ENABLED_PROJECT_IDS?.includes(projectId) ?? false)
  );
}
