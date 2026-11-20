import {
  convertDateToClickhouseDateTime,
  logger,
  queryClickhouse,
} from "@langfuse/shared/src/server";
import { env } from "../../env";
import { BaseChunkTodo } from "./backfillBase";

/**
 * While a deployment runs the `dual` write mode, every legacy write also
 * reaches the events tables: directly (compatible SDKs) or through the
 * propagation job (older SDKs). Copying those legacy rows again duplicates the
 * direct writes, whose span tree differs from the backfill's (no virtual
 * `t-<trace_id>` root, real parent of the app root), so ReplacingMergeTree
 * cannot collapse them.
 *
 * The historic backfill therefore copies legacy rows only if they were created
 * before that live-write period, plus an overlap that covers workers still
 * writing legacy-only during a rolling switch. Inside the overlap a row is
 * copied only when no live row with the same key exists. Rows are judged by
 * `created_at`, which later updates (e.g. bookmarking in the UI) keep.
 * Projects the propagation job skips are always copied in full.
 */
const OVERLAP_MS = 60 * 60 * 1000;
/** A live row can be flushed shortly after its legacy twin. */
const LOOKUP_SLACK_MS = 60 * 60 * 1000;
/**
 * Propagated rows reach the events tables up to ~15 minutes after their legacy
 * row, so the newest hours are not yet conclusive for gap detection.
 */
const SETTLING_MS = 2 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/** Window bounds as ISO strings, persisted with each chunk todo. */
interface LiveWriteWindow {
  /** First event_ts of the current, uninterrupted live-write period. */
  start: string;
  /** Legacy rows created at or after this are not copied. */
  overlapEnd: string;
  /** Upper created_at bound of the live rows the overlap is checked against. */
  lookupEnd: string;
  /** Projects excluded from propagation, whose legacy rows are all copied. */
  exemptProjectIds?: string[];
}

/**
 * Chunk todo carrying the window resolved when the chunks were enumerated, so
 * every chunk and every resume uses the same bounds. Todos enumerated before
 * the window existed carry none and copy every legacy row.
 */
export interface LiveWriteChunkTodo extends BaseChunkTodo {
  liveWriteWindow?: LiveWriteWindow | null;
}

interface HourlyLiveWrites {
  /** Start of the hour, epoch milliseconds. */
  hourMs: number;
  /** Earliest live event_ts within the hour, epoch milliseconds. */
  firstEventMs: number;
}

interface HourlyLegacyWrites {
  hourMs: number;
  rows: number;
}

/**
 * Returns the first live event_ts after the most recent gap — a settled hour
 * with legacy writes but no live writes, i.e. a stretch where the deployment
 * did not write to the events tables (e.g. dual write toggled off, or an
 * earlier stint on v3). Without the gap check, live rows from such an earlier
 * stint would move the cutoff into the past and silently drop every legacy
 * row written since. Returns null when no live period follows the last gap.
 */
export function findLiveWriteStart(params: {
  live: HourlyLiveWrites[];
  legacy: HourlyLegacyWrites[];
  nowMs: number;
}): number | null {
  const liveHours = new Set(params.live.map((h) => h.hourMs));
  const settledBefore = params.nowMs - SETTLING_MS;

  let lastGapMs = Number.NEGATIVE_INFINITY;
  for (const hour of params.legacy) {
    if (
      hour.rows > 0 &&
      hour.hourMs + HOUR_MS <= settledBefore &&
      !liveHours.has(hour.hourMs) &&
      hour.hourMs > lastGapMs
    ) {
      lastGapMs = hour.hourMs;
    }
  }

  let start: number | null = null;
  for (const hour of params.live) {
    if (
      hour.hourMs > lastGapMs &&
      (start === null || hour.firstEventMs < start)
    ) {
      start = hour.firstEventMs;
    }
  }
  return start;
}

/** The scans read whole tables once per backfill step; never cap them. */
const UNBOUNDED_QUERY = {
  clickhouseConfigs: { request_timeout: 30 * 60 * 1000 },
  clickhouseSettings: { max_execution_time: 0 },
};

/**
 * Resolves the live-write window from the events tables and the legacy
 * `observations` table (only ingestion writes it, so every row written during
 * dual write has a live counterpart). Without a live period on record, a
 * deployment that writes the events tables now starts it at this moment, as
 * the backfill may run long after dual write was switched on. Returns null in
 * `legacy` write mode with no live period, in which case every legacy row is
 * copied.
 */
export async function resolveLiveWriteWindow(
  logPrefix: string,
): Promise<LiveWriteWindow | null> {
  const exemptProjectIds = env.LANGFUSE_EVENT_PROPAGATION_EXCLUDE_PROJECT_IDS;
  const live = (
    await queryClickhouse<{ hour_ms: string; first_event_ms: string }>({
      query: `
        SELECT
          toUnixTimestamp(toStartOfHour(event_ts)) * 1000 AS hour_ms,
          toUnixTimestamp64Milli(min(event_ts)) AS first_event_ms
        FROM events_core
        WHERE source NOT LIKE '%-backfill'
        GROUP BY hour_ms
      `,
      ...UNBOUNDED_QUERY,
      tags: {
        surface: "worker",
        route: "background-migration.resolveLiveWriteWindow.live",
      },
    })
  ).map((r) => ({
    hourMs: Number(r.hour_ms),
    firstEventMs: Number(r.first_event_ms),
  }));

  let startMs: number | null = null;
  if (live.length > 0) {
    const firstLiveHourMs = live.reduce(
      (min, h) => Math.min(min, h.hourMs),
      Number.POSITIVE_INFINITY,
    );
    const legacy = (
      await queryClickhouse<{ hour_ms: string; legacy_rows: string }>({
        query: `
          SELECT
            toUnixTimestamp(toStartOfHour(event_ts)) * 1000 AS hour_ms,
            count() AS legacy_rows
          FROM observations
          WHERE event_ts >= {firstLiveHour: DateTime64(3)}
            ${exemptProjectIds.length > 0 ? "AND project_id NOT IN {exemptProjectIds: Array(String)}" : ""}
          GROUP BY hour_ms
        `,
        params: {
          firstLiveHour: convertDateToClickhouseDateTime(
            new Date(firstLiveHourMs),
          ),
          exemptProjectIds,
        },
        ...UNBOUNDED_QUERY,
        tags: {
          surface: "worker",
          route: "background-migration.resolveLiveWriteWindow.legacy",
        },
      })
    ).map((r) => ({ hourMs: Number(r.hour_ms), rows: Number(r.legacy_rows) }));
    startMs = findLiveWriteStart({ live, legacy, nowMs: Date.now() });
  }

  if (startMs === null && env.LANGFUSE_MIGRATION_V4_WRITE_MODE !== "legacy") {
    startMs = Date.now();
  }
  if (startMs === null) {
    logger.info(
      `${logPrefix} No current live-write period and legacy write mode; copying all legacy rows`,
    );
    return null;
  }

  const window: LiveWriteWindow = {
    start: new Date(startMs).toISOString(),
    overlapEnd: new Date(startMs + OVERLAP_MS).toISOString(),
    lookupEnd: new Date(startMs + OVERLAP_MS + LOOKUP_SLACK_MS).toISOString(),
    exemptProjectIds,
  };
  logger.info(
    `${logPrefix} Live writes started at ${window.start}; copying legacy rows created before ${window.overlapEnd}, deduplicating against live rows from ${window.start}${exemptProjectIds.length > 0 ? `, and every row of ${exemptProjectIds.length} projects excluded from propagation` : ""}`,
  );
  return window;
}

/** Query parameters for `buildLiveWriteFilter`; empty without a window. */
export function liveWriteWindowParams(
  window: LiveWriteWindow | null | undefined,
): Record<string, unknown> {
  if (!window) return {};
  return {
    liveWriteStart: convertDateToClickhouseDateTime(new Date(window.start)),
    liveWriteOverlapEnd: convertDateToClickhouseDateTime(
      new Date(window.overlapEnd),
    ),
    liveWriteLookupEnd: convertDateToClickhouseDateTime(
      new Date(window.lookupEnd),
    ),
    liveWriteExemptProjectIds: window.exemptProjectIds ?? [],
  };
}

/**
 * `AND` clause keeping the legacy rows the backfill should copy: rows matching
 * `alwaysKeep`, rows of exempt projects, rows created before the live-write
 * period, and overlap rows whose key has no live row. `liveKeyColumns` must
 * line up with `rowKey`; `liveRowsWhere` narrows the live-row scan (e.g. to the
 * chunk's partitions). Empty without a window.
 */
export function buildLiveWriteFilter(
  window: LiveWriteWindow | null | undefined,
  columns: {
    projectId: string;
    createdAt: string;
    rowKey: string;
    liveKeyColumns: string;
    liveRowsWhere?: string;
    alwaysKeep?: string;
  },
): string {
  if (!window) return "";
  return `AND (
    ${columns.alwaysKeep ? `${columns.alwaysKeep} OR` : ""}
    ${window.exemptProjectIds?.length ? `${columns.projectId} IN {liveWriteExemptProjectIds: Array(String)} OR` : ""}
    ${columns.createdAt} < {liveWriteStart: DateTime64(3)}
    OR (
      ${columns.createdAt} < {liveWriteOverlapEnd: DateTime64(3)}
      AND ${columns.rowKey} NOT IN (
        SELECT ${columns.liveKeyColumns}
        FROM events_core
        WHERE source NOT LIKE '%-backfill'
          AND created_at >= {liveWriteStart: DateTime64(3)}
          AND created_at < {liveWriteLookupEnd: DateTime64(3)}
          ${columns.liveRowsWhere ? `AND ${columns.liveRowsWhere}` : ""}
      )
    )
  )`;
}
