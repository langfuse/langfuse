import { env } from "../../env";

export function isTopicsEnabled(): boolean {
  return (env.LANGFUSE_TOPICS_ENABLED_PROJECT_IDS?.length ?? 0) > 0;
}

export function isTopicsProjectEnabled(projectId: string): boolean {
  return env.LANGFUSE_TOPICS_ENABLED_PROJECT_IDS?.includes(projectId) ?? false;
}
