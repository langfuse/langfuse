import { env } from "../../env";

export function isTopicsEnabled(): boolean {
  return env.LANGFUSE_TOPICS_ENABLED === "true";
}

export function getTopicsModelConfig() {
  return {
    summaryModel: env.LANGFUSE_TOPICS_SUMMARY_MODEL,
    embeddingModel: env.LANGFUSE_TOPICS_EMBEDDING_MODEL,
  };
}

export function isTopicsProjectEnabled(projectId: string): boolean {
  return (
    isTopicsEnabled() &&
    (env.LANGFUSE_TOPICS_ENABLED_PROJECT_IDS?.includes(projectId) ?? false)
  );
}
