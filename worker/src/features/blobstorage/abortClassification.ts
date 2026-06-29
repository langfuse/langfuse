/**
 * Blob-export abort classification (LFE-10063 / LFE-10388).
 *
 * A table export runs two concurrent stages joined by a Node `stream.pipeline`:
 * the ClickHouse read pipeline and the S3/object-storage upload. When either
 * stage fails, the shared pipeline tears down and *every other* stage then
 * surfaces a generic teardown error ("aborted", "Premature close") — so the
 * worker logs a bare `aborted` and the originating cause is lost.
 *
 * This module records the error each stage observed (with a monotonic
 * timestamp) and picks the originating cause: a concrete fault (a ClickHouse
 * server exception, a named S3 error, a shutdown) outranks a generic teardown
 * signature, and ties are broken by recency. The result is a single
 * `abortReason` that is filterable in Datadog plus the full cause chain for the
 * log line, so one log answers "why did this abort?" without spelunking
 * traces / ClickHouse / host logs.
 */

// The stage that observed an error. "ch-read" is the ClickHouse read pipeline
// (its `stream.pipeline` callback), "upload" is the object-storage upload,
// "shutdown" is a graceful SIGTERM teardown, "unknown" is anything else.
export type BlobExportAbortStage =
  | "ch-read"
  | "upload"
  | "shutdown"
  | "unknown";

// Coarse failure class, tagged on logs/metrics/spans for filtering.
export type BlobExportAbortReason =
  | "ch-error"
  | "upload-error"
  | "stall"
  | "shutdown"
  | "unknown";

export interface BlobExportAbortOrigin {
  reason: BlobExportAbortReason;
  stage: BlobExportAbortStage;
  // Whether the originating error was a concrete fault (vs. a generic teardown
  // signature we could only attribute by stage). Surfaced so the log can flag
  // a best-effort attribution.
  concrete: boolean;
  // Full cause chain of the originating error, for the human-readable log line.
  chain: string;
}

interface RecordedStageError {
  stage: BlobExportAbortStage;
  error: unknown;
  at: number;
}

// Generic teardown signatures: a stream/socket being aborted tells us *that* the
// pipeline collapsed, not *why*. These never count as a concrete fault.
const GENERIC_TEARDOWN_PATTERNS = [
  "aborted",
  "premature close",
  "operation was aborted",
  "econnreset",
  "connection reset",
  "socket hang up",
  "epipe",
  "broken pipe",
];

// ClickHouse server-side exceptions: a real CH fault (timeout, memory, etc.).
const CH_EXCEPTION_PATTERN =
  /db::exception|code:\s*\d+|memory_limit_exceeded|timeout_exceeded|too_many_simultaneous_queries|socket_timeout|cannot_schedule_task/;

// Concrete S3 / object-storage faults (named SDK errors / HTTP conditions).
const UPLOAD_FAULT_PATTERN =
  /slowdown|access denied|accessdenied|nosuchupload|nosuchbucket|entitytoolarge|requesttimeout|invalidpart|signaturedoesnotmatch|notimplemented|preconditionfailed/;

// Stall / lock-lapse markers (LFE-10063). Rarely surfaced into this code path
// (a BullMQ stall re-enqueues rather than throwing here), but classified when
// it does.
const STALL_PATTERN = /stalled|missing lock|lock.*(lapse|renew)/;

/**
 * Flatten an error's `cause` chain into a single string of messages, codes, and
 * names. Cycle-safe. A `query_id` appended by the ClickHouse repository survives
 * here, so the log retains the pointer into `system.query_log`.
 */
export function errorChainText(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  const seen = new Set<unknown>();
  while (current != null && !seen.has(current)) {
    seen.add(current);
    if (current instanceof Error) {
      if (current.message) parts.push(current.message);
      const code = (current as NodeJS.ErrnoException).code;
      if (code) parts.push(String(code));
      if (current.name && current.name !== "Error") parts.push(current.name);
      current = current.cause;
    } else {
      parts.push(String(current));
      break;
    }
  }
  return parts.join(" caused by ");
}

function classifyOne(rec: RecordedStageError): {
  reason: BlobExportAbortReason;
  concrete: boolean;
} {
  const text = errorChainText(rec.error).toLowerCase();

  // Shutdown is known from the caller's stage, not the message.
  if (rec.stage === "shutdown" || text.includes("sigterm")) {
    return { reason: "shutdown", concrete: true };
  }
  if (STALL_PATTERN.test(text)) {
    return { reason: "stall", concrete: true };
  }
  // A real ClickHouse exception wins regardless of which stage observed it —
  // the wrapped upload error carries the CH cause in its chain.
  if (CH_EXCEPTION_PATTERN.test(text)) {
    return { reason: "ch-error", concrete: true };
  }
  // A concrete object-storage fault.
  if (UPLOAD_FAULT_PATTERN.test(text)) {
    return { reason: "upload-error", concrete: true };
  }

  // Only generic teardown signatures left: attribute by the observing stage but
  // mark non-concrete (we saw the collapse, not the trigger).
  const generic = GENERIC_TEARDOWN_PATTERNS.some((p) => text.includes(p));
  if (generic) {
    if (rec.stage === "ch-read") return { reason: "ch-error", concrete: false };
    if (rec.stage === "upload")
      return { reason: "upload-error", concrete: false };
    return { reason: "unknown", concrete: false };
  }

  // Some other message with real content — attribute by stage, treat as
  // concrete (it is not a bare teardown).
  if (rec.stage === "ch-read") return { reason: "ch-error", concrete: true };
  if (rec.stage === "upload") return { reason: "upload-error", concrete: true };
  return { reason: "unknown", concrete: false };
}

/**
 * Accumulates the errors observed across an export's concurrent stages and
 * resolves the originating cause. One instance per table export.
 */
export class BlobExportAbortTracker {
  private readonly records: RecordedStageError[] = [];

  // `now` is injectable for deterministic tests; defaults to performance.now().
  record(
    stage: BlobExportAbortStage,
    error: unknown,
    now: number = performance.now(),
  ): void {
    if (error == null) return;
    this.records.push({ stage, error, at: now });
  }

  hasErrors(): boolean {
    return this.records.length > 0;
  }

  /**
   * Pick the originating cause. Concrete faults outrank generic teardown
   * signatures; among equally-concrete candidates the earliest wins (the stage
   * that failed first tore down the rest). Returns undefined if nothing was
   * recorded.
   */
  origin(): BlobExportAbortOrigin | undefined {
    if (this.records.length === 0) return undefined;

    const classified = this.records.map((rec) => ({
      rec,
      ...classifyOne(rec),
    }));

    classified.sort((a, b) => {
      if (a.concrete !== b.concrete) return a.concrete ? -1 : 1;
      return a.rec.at - b.rec.at;
    });

    const winner = classified[0];
    return {
      reason: winner.reason,
      stage: winner.rec.stage,
      concrete: winner.concrete,
      chain: errorChainText(winner.rec.error),
    };
  }
}

/**
 * Classify a single already-caught error with no per-stage context — used by
 * the outer catch when the tracker recorded nothing (e.g. a failure before the
 * pipeline started). `stage` defaults to "unknown".
 */
export function classifyBlobExportError(
  error: unknown,
  stage: BlobExportAbortStage = "unknown",
): BlobExportAbortOrigin {
  const { reason, concrete } = classifyOne({ stage, error, at: 0 });
  return { reason, stage, concrete, chain: errorChainText(error) };
}
