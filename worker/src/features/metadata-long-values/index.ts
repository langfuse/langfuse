import { prisma } from "@langfuse/shared/src/db";
import {
  type EventRecordInsertType,
  logger,
  recordIncrement,
} from "@langfuse/shared/src/server";

import { env } from "../../env";

/** events_core keeps only this many code points of each metadata value. */
export const METADATA_VALUE_LENGTH_LIMIT = 200;
export const MAX_KEYS_PER_PROJECT = 100;
/** Longer keys are not tracked; keeps stored keys below the Postgres btree entry size limit. */
const MAX_STORED_KEY_LENGTH = 500;
const REPORT_TTL_MS = 60 * 60 * 1000;
const MAX_TRACKED_PAIRS = 10_000;
const FLUSH_INTERVAL_MS = 10_000;

export type LongMetadataValueKeyRow = {
  projectId: string;
  key: string;
  maxValueLength: number;
  exampleTraceId: string;
  exampleObservationId: string;
};

/** Returns each metadata key with a value over the limit, mapped to its longest value length in code points. */
export function findLongMetadataValues(
  names: string[],
  values: string[],
): Map<string, number> {
  const result = new Map<string, number>();
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    // UTF-16 length is an upper bound of the code point count.
    if (!value || value.length <= METADATA_VALUE_LENGTH_LIMIT) continue;
    const codePoints = countCodePoints(value);
    if (codePoints <= METADATA_VALUE_LENGTH_LIMIT) continue;
    const key = names[i];
    if (key === undefined) continue;
    result.set(key, Math.max(result.get(key) ?? 0, codePoints));
  }
  return result;
}

function countCodePoints(value: string): number {
  let count = 0;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < value.length) {
      const next = value.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) i++;
    }
    count++;
  }
  return count;
}

const toPairId = (projectId: string, key: string) => `${projectId}\u0000${key}`;

/**
 * Collects metadata keys with over-limit values and persists them in batches.
 * Each (project, key) pair is reported at most once per TTL per process.
 */
export class LongMetadataValueTracker {
  private readonly reportedAt = new Map<string, number>();
  private pending = new Map<string, LongMetadataValueKeyRow>();
  private pendingPerProject = new Map<string, number>();
  private intervalId: NodeJS.Timeout | null = null;
  private activeFlush: Promise<void> | null = null;

  constructor(
    private readonly persist: (
      rows: LongMetadataValueKeyRow[],
    ) => Promise<number>,
    private readonly options: {
      enabled: boolean;
      now?: () => number;
      autoFlush?: boolean;
    },
  ) {}

  record(eventRecord: EventRecordInsertType): void {
    if (!this.options.enabled) return;
    try {
      this.recordUnsafe(eventRecord);
    } catch (error) {
      logger.warn("Failed to track long metadata values", { error });
    }
  }

  private recordUnsafe(eventRecord: EventRecordInsertType): void {
    if (eventRecord.metadata_values.length === 0) return;
    const offenders = findLongMetadataValues(
      eventRecord.metadata_names,
      eventRecord.metadata_values,
    );
    if (offenders.size === 0) return;

    const projectId = eventRecord.project_id;
    const now = this.now();
    for (const [key, length] of offenders) {
      if (key.length > MAX_STORED_KEY_LENGTH) continue;
      const pairId = toPairId(projectId, key);

      const existing = this.pending.get(pairId);
      if (existing) {
        if (length > existing.maxValueLength) {
          existing.maxValueLength = length;
          existing.exampleTraceId = eventRecord.trace_id;
          existing.exampleObservationId = eventRecord.span_id;
        }
        continue;
      }

      const reportedAt = this.reportedAt.get(pairId);
      if (reportedAt !== undefined && now - reportedAt < REPORT_TTL_MS) {
        continue;
      }

      const projectPending = this.pendingPerProject.get(projectId) ?? 0;
      if (projectPending >= MAX_KEYS_PER_PROJECT) return;

      this.pending.set(pairId, {
        projectId,
        key,
        maxValueLength: length,
        exampleTraceId: eventRecord.trace_id,
        exampleObservationId: eventRecord.span_id,
      });
      this.pendingPerProject.set(projectId, projectPending + 1);
      this.markReported(pairId, now);
    }

    this.ensureStarted();
  }

  private markReported(pairId: string, now: number): void {
    this.reportedAt.delete(pairId);
    this.reportedAt.set(pairId, now);
    if (this.reportedAt.size > MAX_TRACKED_PAIRS) {
      const oldest = this.reportedAt.keys().next().value;
      if (oldest !== undefined) this.reportedAt.delete(oldest);
    }
  }

  async flush(): Promise<void> {
    if (this.activeFlush) await this.activeFlush;
    if (this.pending.size === 0) return;

    const rows = [...this.pending.values()];
    this.pending = new Map();
    this.pendingPerProject = new Map();

    this.activeFlush = this.persistRows(rows);
    try {
      await this.activeFlush;
    } finally {
      this.activeFlush = null;
    }
  }

  private async persistRows(rows: LongMetadataValueKeyRow[]): Promise<void> {
    try {
      const written = await this.persist(rows);
      recordIncrement("langfuse.ingestion.metadata_long_value_keys", written);
    } catch (error) {
      // Let the next occurrence of each pair retry the write.
      for (const row of rows) {
        this.reportedAt.delete(toPairId(row.projectId, row.key));
      }
      logger.warn("Failed to persist long metadata value keys", {
        error,
        rows: rows.length,
      });
    }
  }

  private ensureStarted(): void {
    if (this.intervalId || this.options.autoFlush === false) return;
    this.intervalId = setInterval(() => {
      this.flush().catch((error) =>
        logger.warn("Failed to flush long metadata value keys", { error }),
      );
    }, FLUSH_INTERVAL_MS);
    this.intervalId.unref();
  }

  async shutdown(): Promise<void> {
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = null;
    await this.flush();
  }

  private now(): number {
    return this.options.now ? this.options.now() : Date.now();
  }
}

/**
 * Upserts rows while a project holds fewer than MAX_KEYS_PER_PROJECT keys;
 * already stored keys are always refreshed. The cap is soft: one statement
 * can overshoot it by its own new rows. Returns the number of rows written.
 */
export async function persistLongMetadataValueKeys(
  rows: LongMetadataValueKeyRow[],
): Promise<number> {
  if (rows.length === 0) return 0;

  return prisma.$executeRaw`
    WITH input AS (
      SELECT *
      FROM unnest(
        ${rows.map((row) => row.projectId)}::text[],
        ${rows.map((row) => row.key)}::text[],
        ${rows.map((row) => row.maxValueLength)}::int[],
        ${rows.map((row) => row.exampleTraceId)}::text[],
        ${rows.map((row) => row.exampleObservationId)}::text[]
      ) AS i(project_id, key, max_value_length, example_trace_id, example_observation_id)
    )
    INSERT INTO metadata_long_value_keys AS t (
      project_id, key, max_value_length, example_trace_id, example_observation_id, first_seen_at, last_seen_at
    )
    SELECT i.project_id, i.key, i.max_value_length, i.example_trace_id, i.example_observation_id, now(), now()
    FROM input i
    JOIN projects p ON p.id = i.project_id AND p.deleted_at IS NULL
    WHERE EXISTS (
        SELECT 1 FROM metadata_long_value_keys e
        WHERE e.project_id = i.project_id AND e.key = i.key
      )
      OR (
        SELECT count(*) FROM metadata_long_value_keys e
        WHERE e.project_id = i.project_id
      ) < ${MAX_KEYS_PER_PROJECT}
    ORDER BY i.project_id, i.key
    ON CONFLICT (project_id, key) DO UPDATE SET
      last_seen_at = EXCLUDED.last_seen_at,
      max_value_length = GREATEST(t.max_value_length, EXCLUDED.max_value_length),
      example_trace_id = CASE WHEN EXCLUDED.max_value_length > t.max_value_length
        THEN EXCLUDED.example_trace_id ELSE t.example_trace_id END,
      example_observation_id = CASE WHEN EXCLUDED.max_value_length > t.max_value_length
        THEN EXCLUDED.example_observation_id ELSE t.example_observation_id END
  `;
}

export const longMetadataValueTracker = new LongMetadataValueTracker(
  persistLongMetadataValueKeys,
  { enabled: env.LANGFUSE_METADATA_LONG_VALUE_TRACKING_ENABLED === "true" },
);
