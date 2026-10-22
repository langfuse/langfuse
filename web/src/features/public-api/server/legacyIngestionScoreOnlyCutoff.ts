import { logger, recordIncrement } from "@langfuse/shared/src/server";

import { env } from "@/src/env.mjs";

const LEGACY_INGESTION_NON_SCORE_REJECTED_METRIC =
  "langfuse.public_api.legacy_ingestion_non_score_rejected";

/**
 * isLegacyIngestionScoreOnlyOrg reports whether this organization takes the
 * v4 events_only ingestion path. An unset cutoff, a missing
 * organizationCreatedAt, or a timestamp that does not parse leaves ingestion
 * unchanged. Organizations created at the cutoff instant are included.
 */
export function isLegacyIngestionScoreOnlyOrg(
  organizationCreatedAt: string | null | undefined,
): boolean {
  const cutoff = env.LANGFUSE_LEGACY_INGESTION_SCORE_ONLY_ORG_CREATED_CUTOFF;
  if (!cutoff || !organizationCreatedAt) return false;

  const createdAtMs = Date.parse(organizationCreatedAt);
  const cutoffMs = Date.parse(cutoff);
  if (Number.isNaN(createdAtMs) || Number.isNaN(cutoffMs)) return false;
  return createdAtMs >= cutoffMs;
}

/** recordLegacyIngestionScoreOnlyRejection counts events the organization cutoff rejected. `route` is the only tag. */
export function recordLegacyIngestionScoreOnlyRejection(params: {
  route: string;
  count: number;
  orgId?: string;
  projectId?: string;
}): void {
  if (params.count <= 0) return;

  recordIncrement(LEGACY_INGESTION_NON_SCORE_REJECTED_METRIC, params.count, {
    route: params.route,
  });
  logger.info(
    "Rejected legacy ingestion writes for organization created at or after cutoff",
    {
      route: params.route,
      rejectedEventCount: params.count,
      orgId: params.orgId,
      projectId: params.projectId,
    },
  );
}
