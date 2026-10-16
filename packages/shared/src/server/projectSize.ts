import { env } from "../env";

const largeProjectIds = new Set(env.LANGFUSE_LARGE_PROJECT_IDS ?? []);

export const getProjectSize = (projectId: string): "large" | "unknown" =>
  largeProjectIds.has(projectId) ? "large" : "unknown";
