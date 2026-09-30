import {
  buildLongMetadataValuesIssue,
  createAdminIssue,
  type EventRecordInsertType,
  LONG_METADATA_VALUE_THRESHOLD,
  logger,
  redis,
} from "@langfuse/shared/src/server";

const ISSUE_NAME = "Long metadata values";
/** A project gets at most one issue per window, across all workers. */
export const REPORT_WINDOW_MS = 24 * 60 * 60 * 1000;
export const MAX_KEYS_PER_ISSUE = 50;
const MAX_TRACKED_PROJECTS = 10_000;
const FLUSH_INTERVAL_MS = 10_000;

export type PendingLongMetadataValues = {
  projectId: string;
  keys: Map<string, number>;
  exampleTraceId: string;
  exampleObservationId: string;
};

/** Returns each metadata key with a value over the threshold, mapped to its longest value length in characters. */
export function findLongMetadataValues(
  names: string[],
  values: string[],
): Map<string, number> {
  const result = new Map<string, number>();
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    // UTF-16 length is an upper bound of the character count.
    if (!value || value.length <= LONG_METADATA_VALUE_THRESHOLD) continue;
    const length = Array.from(value).length;
    const key = names[i];
    if (length <= LONG_METADATA_VALUE_THRESHOLD || key === undefined) continue;
    result.set(key, Math.max(result.get(key) ?? 0, length));
  }
  return result;
}

/**
 * Collects metadata keys with long values per project and reports them as
 * one admin issue per project per window. Projects reported in this process
 * skip the metadata scan until the window ends.
 */
export class LongMetadataValueTracker {
  private readonly reportedUntil = new Map<string, number>();
  private pending = new Map<string, PendingLongMetadataValues>();
  private intervalId: NodeJS.Timeout | null = null;
  private activeFlush: Promise<void> | null = null;

  /** `report` resolves to the time the project's window ends, or undefined when it failed. */
  constructor(
    private readonly report: (
      pending: PendingLongMetadataValues,
    ) => Promise<number | undefined>,
    private readonly options: { now?: () => number; autoFlush?: boolean } = {},
  ) {}

  record(eventRecord: EventRecordInsertType): void {
    try {
      this.recordUnsafe(eventRecord);
    } catch (error) {
      logger.warn("Failed to track long metadata values", { error });
    }
  }

  private recordUnsafe(eventRecord: EventRecordInsertType): void {
    if (eventRecord.metadata_values.length === 0) return;
    const projectId = eventRecord.project_id;
    const pending = this.pending.get(projectId);
    if (!pending && this.isReported(projectId)) return;

    const offenders = findLongMetadataValues(
      eventRecord.metadata_names,
      eventRecord.metadata_values,
    );
    if (offenders.size === 0) return;

    const entry = pending ?? {
      projectId,
      keys: new Map<string, number>(),
      exampleTraceId: eventRecord.trace_id,
      exampleObservationId: eventRecord.span_id,
    };
    for (const [key, length] of offenders) {
      const known = entry.keys.get(key);
      if (known === undefined && entry.keys.size >= MAX_KEYS_PER_ISSUE) {
        continue;
      }
      entry.keys.set(key, Math.max(known ?? 0, length));
    }
    if (!pending) {
      this.pending.set(projectId, entry);
      this.markReported(projectId, this.now() + REPORT_WINDOW_MS);
      this.ensureStarted();
    }
  }

  private isReported(projectId: string): boolean {
    const reportedUntil = this.reportedUntil.get(projectId);
    return reportedUntil !== undefined && this.now() < reportedUntil;
  }

  private markReported(projectId: string, until: number): void {
    this.reportedUntil.delete(projectId);
    this.reportedUntil.set(projectId, until);
    if (this.reportedUntil.size > MAX_TRACKED_PROJECTS) {
      const oldest = this.reportedUntil.keys().next().value;
      if (oldest !== undefined) this.reportedUntil.delete(oldest);
    }
  }

  async flush(): Promise<void> {
    if (this.activeFlush) await this.activeFlush;
    if (this.pending.size === 0) return;

    const entries = [...this.pending.values()];
    this.pending = new Map();

    this.activeFlush = this.reportAll(entries);
    try {
      await this.activeFlush;
    } finally {
      this.activeFlush = null;
    }
  }

  private async reportAll(entries: PendingLongMetadataValues[]): Promise<void> {
    await Promise.all(
      entries.map(async (entry) => {
        let reportedUntil: number | undefined;
        try {
          reportedUntil = await this.report(entry);
        } catch (error) {
          logger.warn("Failed to report long metadata values", {
            error,
            projectId: entry.projectId,
          });
        }
        if (reportedUntil === undefined) {
          // Let the next occurrence in this project retry.
          this.reportedUntil.delete(entry.projectId);
        } else {
          this.markReported(entry.projectId, reportedUntil);
        }
      }),
    );
  }

  private ensureStarted(): void {
    if (this.intervalId || this.options.autoFlush === false) return;
    this.intervalId = setInterval(() => {
      this.flush().catch((error) =>
        logger.warn("Failed to flush long metadata values", { error }),
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

const reportClaimKey = (projectId: string) =>
  `langfuse:admin-issues:long-metadata-values:${projectId}`;

/**
 * Creates the admin issue unless a worker already claimed the project's
 * window in Redis. Resolves to the time the window ends, or undefined when
 * the issue could not be written.
 */
export async function reportLongMetadataValues(
  pending: PendingLongMetadataValues,
): Promise<number | undefined> {
  if (!redis) return undefined;
  const key = reportClaimKey(pending.projectId);
  const claimed = await redis.set(key, "1", "PX", REPORT_WINDOW_MS, "NX");
  if (claimed !== "OK") {
    const remainingMs = await redis.pttl(key);
    // A claim that expired after the SET retries on the next occurrence.
    return remainingMs > 0 ? Date.now() + remainingMs : undefined;
  }

  const created = await createAdminIssue({
    projectId: pending.projectId,
    name: ISSUE_NAME,
    issue: buildLongMetadataValuesIssue({
      projectId: pending.projectId,
      keys: [...pending.keys].map(([key, maxValueLength]) => ({
        key,
        maxValueLength,
      })),
      exampleTraceId: pending.exampleTraceId,
      exampleObservationId: pending.exampleObservationId,
    }),
  });
  if (created === undefined) {
    await redis.del(key);
    return undefined;
  }
  return Date.now() + REPORT_WINDOW_MS;
}

export const longMetadataValueTracker = new LongMetadataValueTracker(
  reportLongMetadataValues,
);
