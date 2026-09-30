import { randomUUID } from "node:crypto";
import { type Observation } from "@langfuse/shared";
import { detectTraceIssues } from "@langfuse/shared/src/server";
import { env } from "../../env";
import { writeTraceliftIssues } from "./writeIssues";

export async function processTraceliftTrace(
  observations: readonly Observation[],
): Promise<void> {
  const first = observations[0];
  if (!first?.traceId) return;
  if (
    env.LANGFUSE_TRACELIFT_ENABLED !== "true" ||
    !env.LANGFUSE_TRACELIFT_ENABLED_PROJECT_IDS.includes(first.projectId)
  )
    return;

  const traceId = first.traceId;

  const issues = detectTraceIssues(observations);
  const timestamp = new Date();
  await writeTraceliftIssues(
    first.projectId,
    issues.map((issue) => ({
      id: randomUUID(),
      traceId,
      issues: issue,
      timestamp,
    })),
  );
}
