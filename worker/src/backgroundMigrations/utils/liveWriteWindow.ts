import {
  convertDateToClickhouseDateTime,
  logger,
  queryClickhouse,
} from "@langfuse/shared/src/server";
import { BaseChunkTodo } from "./backfillBase";

/**
 * While a deployment runs the `dual` write mode, every legacy write also
 * reaches the events tables: directly (compatible SDKs) or through the
 * propagation job (older SDKs). Copying those legacy rows again duplicates the
 * direct writes, whose span tree differs from the backfill's (no virtual
 * `t-<trace_id>` root, real parent of the app root), so ReplacingMergeTree
 * cannot collapse them.
 *
 * The historic backfill therefore copies legacy rows only up to the start of
 * that live-write period, plus an overlap that covers workers still writing
 * legacy-only during a rolling switch. Inside the overlap a row is copied only
 * when no live row with the same key exists.
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
  /** Legacy rows written at or after this are not copied. */
  overlapEnd: string;
  /** Upper event_ts bound of the live rows the overlap is checked against. */
  lookupEnd: string;
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

/**
 * Resolves the live-write window from the events tables and the legacy
 * `observations` table (only ingestion writes it, so every row written during
 * dual write has a live counterpart). Returns null when nothing was written to
 * the events tables yet, in which case every legacy row is copied.
 */
export async function resolveLiveWriteWindow(
  logPrefix: string,
): Promise<LiveWriteWindow | null> {
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
      tags: {
        surface: "worker",
        route: "background-migration.resolveLiveWriteWindow.live",
      },
    })
  ).map((r) => ({
    hourMs: Number(r.hour_ms),
    firstEventMs: Number(r.first_event_ms),
  }));

  if (live.length === 0) {
    logger.info(
      `${logPrefix} No live writes in the events tables; copying all legacy rows`,
    );
    return null;
  }

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
        GROUP BY hour_ms
      `,
      params: {
        firstLiveHour: convertDateToClickhouseDateTime(
          new Date(firstLiveHourMs),
        ),
      },
      tags: {
        surface: "worker",
        route: "background-migration.resolveLiveWriteWindow.legacy",
      },
    })
  ).map((r) => ({ hourMs: Number(r.hour_ms), rows: Number(r.legacy_rows) }));

  const startMs = findLiveWriteStart({ live, legacy, nowMs: Date.now() });
  if (startMs === null) {
    logger.info(
      `${logPrefix} Live writes stopped before the latest legacy-only stretch; copying all legacy rows`,
    );
    return null;
  }

  const window: LiveWriteWindow = {
    start: new Date(startMs).toISOString(),
    overlapEnd: new Date(startMs + OVERLAP_MS).toISOString(),
    lookupEnd: new Date(startMs + OVERLAP_MS + LOOKUP_SLACK_MS).toISOString(),
  };
  logger.info(
    `${logPrefix} Live writes started at ${window.start}; copying legacy rows before ${window.overlapEnd}, deduplicating against live rows from ${window.start}`,
  );
  return window;
}

/** Query parameters for the window, formatted as ClickHouse DateTime64(3). */
export function liveWriteWindowParams(
  window: LiveWriteWindow,
): Record<string, string> {
  return {
    liveWriteStart: convertDateToClickhouseDateTime(new Date(window.start)),
    liveWriteOverlapEnd: convertDateToClickhouseDateTime(
      new Date(window.overlapEnd),
    ),
    liveWriteLookupEnd: convertDateToClickhouseDateTime(
      new Date(window.lookupEnd),
    ),
  };
}

/**
 * SQL predicate keeping the legacy rows the backfill should copy: everything
 * written before the live-write period, plus overlap rows whose key has no
 * live row. `liveKeyColumns` must line up with `rowKey`; `liveRowsWhere`
 * narrows the live-row scan (e.g. to the chunk's partitions).
 */
export function buildLiveWriteFilter(params: {
  eventTsColumn: string;
  rowKey: string;
  liveKeyColumns: string;
  liveRowsWhere?: string;
}): string {
  return `(
    ${params.eventTsColumn} < {liveWriteStart: DateTime64(3)}
    OR (
      ${params.eventTsColumn} < {liveWriteOverlapEnd: DateTime64(3)}
      AND ${params.rowKey} NOT IN (
        SELECT ${params.liveKeyColumns}
        FROM events_core
        WHERE source NOT LIKE '%-backfill'
          AND event_ts >= {liveWriteStart: DateTime64(3)}
          AND event_ts < {liveWriteLookupEnd: DateTime64(3)}
          ${params.liveRowsWhere ? `AND ${params.liveRowsWhere}` : ""}
      )
    )
  )`;
}
