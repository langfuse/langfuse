/**
 * Redis-backed v4 transition usage reads for deprecated public API and
 * experiment POST /dataset-run-items checks.
 *
 * Both paths are worker-maintained Redis only (including when the pipeline
 * heartbeat is stale). A missing entry means no usage; the request path never
 * scans `system.query_log`.
 */
import {
  readExperimentPostUsageCache,
  readLegacyApiUsageCache,
  V4_TRANSITION_DETECTION_WINDOW_MS,
  type CachedLegacyApiUsageRow,
} from "@/src/features/v4/server/v4TransitionCache";

export type LegacyApiUsageSummaryByProjectResultRow = {
  projectId: string;
  entrypoint: string;
  count: number;
  lastSeen: string;
  callers?: CachedLegacyApiUsageRow["callers"];
};

/**
 * Read-time aging-out rule: drop entries whose last activity left the trailing
 * detection window (same rule as the SDK path).
 */
const isWithinDetectionWindow = (lastSeen: string, nowMs: number): boolean =>
  Date.parse(lastSeen) >= nowMs - V4_TRANSITION_DETECTION_WINDOW_MS;

export const trimLegacyApiUsageRows = (
  rows: CachedLegacyApiUsageRow[],
  nowMs: number,
): CachedLegacyApiUsageRow[] =>
  rows.filter((row) => isWithinDetectionWindow(row.lastSeen, nowMs));

/**
 * Whether each project called `POST /api/public/dataset-run-items` within the
 * detection window. Redis-only: serve worker-maintained entries (including
 * when the heartbeat is stale) and treat a miss as no usage. No `query_log`
 * fallback on the request path.
 */
export const getExperimentPostUsageByProject = async ({
  projectIds,
  nowMs,
}: {
  projectIds: string[];
  nowMs: number;
}): Promise<Map<string, boolean | "check_failed">> => {
  const usageByProject = new Map<string, boolean | "check_failed">();
  const cachedBlobs = await readExperimentPostUsageCache(projectIds);
  projectIds.forEach((projectId, index) => {
    const blob = cachedBlobs[index];
    if (!blob) {
      usageByProject.set(projectId, false);
      return;
    }
    const stillInWindow =
      blob.lastSeen == null
        ? blob.used
        : blob.used && isWithinDetectionWindow(blob.lastSeen, nowMs);
    usageByProject.set(projectId, stillInWindow);
  });
  return usageByProject;
};

/**
 * Deprecated public API usage per project. Redis-only: serve worker-maintained
 * entries (including when the heartbeat is stale) and treat a miss as no
 * usage. The always-mounted sidebar never calls this procedure.
 */
export const getLegacyApiUsageSummaries = async ({
  projectIds,
}: {
  projectIds: string[];
}): Promise<LegacyApiUsageSummaryByProjectResultRow[]> => {
  if (projectIds.length === 0) return [];

  const nowMs = Date.now();
  const cachedBlobs = await readLegacyApiUsageCache(projectIds);
  const rows: LegacyApiUsageSummaryByProjectResultRow[] = [];
  projectIds.forEach((projectId, index) => {
    const blob = cachedBlobs[index];
    if (!blob) return;
    rows.push(
      ...trimLegacyApiUsageRows(blob.rows, nowMs).map((row) => ({
        projectId,
        ...row,
      })),
    );
  });

  return rows.sort(
    (left, right) =>
      left.projectId.localeCompare(right.projectId) ||
      left.entrypoint.localeCompare(right.entrypoint),
  );
};
