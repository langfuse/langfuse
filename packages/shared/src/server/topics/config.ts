import { env } from "../../env";

/** Deployment switch: Langfuse Cloud only for now, so self-hosted instances never enable Topics. */
export function isTopicsEnabled(): boolean {
  return (
    env.LANGFUSE_TOPICS_ENABLED === "true" &&
    Boolean(env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION)
  );
}

export function isTopicsProjectEnabled(projectId: string): boolean {
  return (
    isTopicsEnabled() &&
    (env.LANGFUSE_TOPICS_ENABLED_PROJECT_IDS?.includes(projectId) ?? false)
  );
}
