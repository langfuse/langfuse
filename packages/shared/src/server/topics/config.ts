import { env } from "../../env";

/** Deployment switch, shared by web and worker. */
export function isTopicsEnabled(): boolean {
  return env.LANGFUSE_TOPICS_ENABLED === "true";
}

export function isTopicsProjectEnabled(projectId: string): boolean {
  return (
    isTopicsEnabled() &&
    (env.LANGFUSE_TOPICS_ENABLED_PROJECT_IDS?.includes(projectId) ?? false)
  );
}
