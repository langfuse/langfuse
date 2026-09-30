import { type Observation } from "@langfuse/shared";
import { logger } from "@langfuse/shared/src/server";
import { env } from "../../env";

export function processTraceliftTrace(
  observations: readonly Observation[],
): void {
  const first = observations[0];
  if (!first?.traceId) return;
  if (
    env.LANGFUSE_TRACELIFT_ENABLED !== "true" ||
    !env.LANGFUSE_TRACELIFT_ENABLED_PROJECT_IDS.includes(first.projectId)
  )
    return;

  logger.info("Tracelift processing trace", {
    projectId: first.projectId,
    traceId: first.traceId,
  });
}
