/**
 * Cloud-only rollout rule for automatic direct OTel event writes (LFE-14536).
 *
 * Organizations created on or after the cutoff are past the point where the v4
 * preview is force-enabled and cannot be switched off, so the events table is
 * the only surface they read. Without `x-langfuse-ingestion-version: 4` their
 * OTLP traffic would take the dual-write path and appear with up to ~10 minutes
 * of delay — a broken first experience for an exporter that is otherwise set up
 * correctly. For those organizations every batch arriving on the OTel endpoint
 * is routed straight to the events table, regardless of which SDK (or none)
 * produced it: they have no prior expectation of the dual-write shape, so the
 * direct path simply is the correct experience.
 *
 * Deliberately date-based: there is no per-organization or per-project v4
 * column, only `User.v4BetaEnabled`, so signup date is the only cohort signal
 * available. It mirrors `V4_DEFAULT_ENABLED_FROM_AT`, which gates the UI-side
 * rollout, but keys on the single organization owning the API key rather than
 * the oldest organization a user belongs to — ingestion has no user context.
 */
export const isOrgPastOtelDirectWriteCutoff = (params: {
  /** Organization signup date; nullish when the API-key cache entry predates the field. */
  orgCreatedAt: string | Date | null | undefined;
  /** ISO date (YYYY-MM-DD), interpreted as midnight UTC. Unset disables the rule. */
  cutoff: string | undefined;
  isLangfuseCloud: boolean;
}): boolean => {
  const { orgCreatedAt, cutoff, isLangfuseCloud } = params;

  // Self-hosted deployments flip the whole deployment at once via
  // LANGFUSE_MIGRATION_V4_NATIVE_OTEL_BEHAVIOUR=direct; rolling a tenant cohort
  // forward is a Cloud-only concern.
  if (!isLangfuseCloud || !cutoff || !orgCreatedAt) {
    return false;
  }

  const cutoffMs = Date.parse(`${cutoff}T00:00:00.000Z`);
  const orgCreatedAtMs =
    orgCreatedAt instanceof Date
      ? orgCreatedAt.getTime()
      : Date.parse(orgCreatedAt);

  // A malformed cutoff is rejected by env validation, but the organization date
  // arrives via the Redis cache. Treat anything unparseable as "age unknown"
  // and keep the pre-cutoff behaviour rather than guessing.
  if (isNaN(cutoffMs) || isNaN(orgCreatedAtMs)) {
    return false;
  }

  return orgCreatedAtMs >= cutoffMs;
};
