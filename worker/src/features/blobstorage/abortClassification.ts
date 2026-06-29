/**
 * Blob-export abort classification (LFE-10063 / LFE-10388).
 *
 * A table export joins two concurrent stages with a Node `stream.pipeline`: the
 * ClickHouse read and the S3/object-storage upload. When either fails the
 * pipeline tears down and *both* stages surface a generic "aborted" — so the
 * worker logged a bare `aborted` and lost the originating cause. This module
 * records each stage's error and picks the cause (a concrete fault outranks a
 * generic teardown; ties broken by recency), yielding a filterable
 * `abortReason` plus the full cause chain for the log line.
 */

// "ch-read" = the ClickHouse read pipeline (its `stream.pipeline` callback),
// "upload" = the object-storage upload, "shutdown" = graceful SIGTERM.
export type BlobExportAbortStage =
  | "ch-read"
  | "upload"
  | "shutdown"
  | "unknown";

export type BlobExportAbortReason =
  | "ch-error"
  | "upload-error"
  | "stall"
  | "shutdown"
  | "unknown";

export interface BlobExportAbortOrigin {
  reason: BlobExportAbortReason;
  stage: BlobExportAbortStage;
  // False when the cause was only a generic teardown attributed by stage; the
  // log flags this as best-effort.
  concrete: boolean;
  chain: string;
}

interface RecordedStageError {
  stage: BlobExportAbortStage;
  error: unknown;
  at: number;
}

// A teardown signature tells us the pipeline collapsed, not why — never concrete.
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

// `db::\w*exception` covers DB::Exception, DB::NetException, etc. A bare
// `code:\s*\d+` is excluded: it also matches S3/Azure "status code: 503" and
// would misclassify upload errors as ch-error.
const CH_EXCEPTION_PATTERN =
  /db::\w*exception|memory_limit_exceeded|timeout_exceeded|too_many_simultaneous_queries|socket_timeout|cannot_schedule_task/;

const UPLOAD_FAULT_PATTERN =
  /slowdown|access denied|accessdenied|nosuchupload|nosuchbucket|entitytoolarge|requesttimeout|invalidpart|signaturedoesnotmatch|notimplemented|preconditionfailed/;

// Rarely reaches this path (a BullMQ stall re-enqueues rather than throwing).
const STALL_PATTERN = /stalled|missing lock|lock.*(lapse|renew)/;

/**
 * Flatten an error's `cause` chain into one string. Cycle-safe. A `query_id`
 * appended by the ClickHouse repository survives here, keeping the pointer into
 * `system.query_log`.
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

  if (rec.stage === "shutdown" || text.includes("sigterm")) {
    return { reason: "shutdown", concrete: true };
  }
  if (STALL_PATTERN.test(text)) {
    return { reason: "stall", concrete: true };
  }
  // CH/upload faults win regardless of stage — the wrapped upload error carries
  // the CH cause in its chain.
  if (CH_EXCEPTION_PATTERN.test(text)) {
    return { reason: "ch-error", concrete: true };
  }
  if (UPLOAD_FAULT_PATTERN.test(text)) {
    return { reason: "upload-error", concrete: true };
  }

  // Only a generic teardown left: attribute by the observing stage, non-concrete.
  if (GENERIC_TEARDOWN_PATTERNS.some((p) => text.includes(p))) {
    if (rec.stage === "ch-read") return { reason: "ch-error", concrete: false };
    if (rec.stage === "upload")
      return { reason: "upload-error", concrete: false };
    return { reason: "unknown", concrete: false };
  }

  // Other real message (not a bare teardown): attribute by stage, concrete.
  if (rec.stage === "ch-read") return { reason: "ch-error", concrete: true };
  if (rec.stage === "upload") return { reason: "upload-error", concrete: true };
  return { reason: "unknown", concrete: false };
}

/** Collects per-stage errors for one table export and resolves the cause. */
export class BlobExportAbortTracker {
  private readonly records: RecordedStageError[] = [];

  // `now` is injectable for deterministic tests.
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
   * Concrete faults outrank generic teardowns; ties go to the earliest (the
   * stage that failed first tore down the rest). Undefined if nothing recorded.
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

/** Classify a single error with no per-stage context (tracker recorded nothing). */
export function classifyBlobExportError(
  error: unknown,
  stage: BlobExportAbortStage = "unknown",
): BlobExportAbortOrigin {
  const { reason, concrete } = classifyOne({ stage, error, at: 0 });
  return { reason, stage, concrete, chain: errorChainText(error) };
}
