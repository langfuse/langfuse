import { env } from "../../env";

/** Deployment switch, shared by web and worker; Topics is then on for every project. */
export function isTopicsEnabled(): boolean {
  return env.LANGFUSE_TOPICS_ENABLED === "true";
}
