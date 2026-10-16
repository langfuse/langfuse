import { env } from "../env";

export const getProjectSize = (projectId: string): "large" | "unknown" =>
  env.LANGFUSE_LARGE_PROJECT_IDS?.has(projectId) ? "large" : "unknown";
