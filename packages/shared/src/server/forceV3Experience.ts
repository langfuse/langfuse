import { env } from "../env";

/**
 * Projects listed in LANGFUSE_FORCE_V3_EXPERIENCE keep the legacy (v3)
 * experience: the old eval experience (trace-level evaluator create/update
 * stays available) and none of the v4 migration/upgrade UI. Set only on Cloud
 * for projects instrumented via integration partners that have not upgraded to
 * OTEL ingestion yet.
 */
export function isForceV3ExperienceProject(projectId: string): boolean {
  return env.LANGFUSE_FORCE_V3_EXPERIENCE.includes(projectId);
}
