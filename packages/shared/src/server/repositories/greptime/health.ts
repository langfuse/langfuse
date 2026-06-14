import { greptimeQuery } from "../../greptime/client";
import { greptimeTsParam, notDeleted } from "./queryHelpers";

/**
 * GreptimeDB readiness probe (04-read-path.md, P5). Replaces the ClickHouse health-check reads on
 * `traces` / `observations` (legacy mode) and `events_core` (events_only mode). On the merged
 * projection there is no `events_core`, so the events_only probe collapses to the same projection
 * reads — GreptimeWriter always populates the projections regardless of the migration write mode.
 *
 * Cross-project probe (no projectId): a live row in the [cutoff, now] window means ingestion is
 * flowing. `now` is supplied by the caller to avoid app/DB clock skew.
 */
export const probeRecentTracingActivity = async ({
  now,
  windowMinutes = 3,
}: {
  now: Date;
  windowMinutes?: number;
}): Promise<{ hasTrace: boolean; hasObservation: boolean }> => {
  const params = {
    now: greptimeTsParam(now),
    cutoff: greptimeTsParam(new Date(now.getTime() - windowMinutes * 60_000)),
  };

  const [traces, observations] = await Promise.all([
    greptimeQuery<{ id: string }>({
      query: `
        SELECT id FROM traces
        WHERE timestamp <= :now AND timestamp >= :cutoff AND ${notDeleted()}
        LIMIT 1`,
      params,
      readOnly: true,
    }),
    greptimeQuery<{ id: string }>({
      query: `
        SELECT id FROM observations
        WHERE start_time <= :now AND start_time >= :cutoff AND ${notDeleted()}
        LIMIT 1`,
      params,
      readOnly: true,
    }),
  ]);

  return {
    hasTrace: traces.length > 0,
    hasObservation: observations.length > 0,
  };
};
