import { PreparedEvent } from "@langfuse/native";
import {
  logger,
  queryClickhouse,
  recordIncrement,
  TupleParam,
} from "@langfuse/shared/src/server";
import { classifyJobFailure } from "../../../queues/jobFailureReason";
import { PeriodicRunner } from "../../../utils/PeriodicRunner";

export type ShadowRowKey = {
  traceId: string;
  spanId: string;
  startTime: string;
};

/** One sampled batch waiting for its rows to be compared. */
type Sample = {
  projectId: string;
  fileKey: string;
  inputBytes: number;
  /** (trace id, start minute) pairs: the primary key prefix of the rows to read. */
  keys: [traceId: string, startMinute: string][];
  /** Spans under those keys. */
  spans: number;
  queuedAt: number;
};

const METRIC = "langfuse.ingestion.otel.shadow.rows";
/** Both writers flush on an interval, so rows are read once they had time to land. */
const SETTLE_MS = 20_000;
/** Read once this much sampled input has settled, or once the oldest sample is this old. */
const FLUSH_INPUT_BYTES = 64 * 1024 * 1024;
const MAX_AGE_MS = 60_000;
const MAX_BYTES_TO_READ = 1024 * 1024 * 1024;
/**
 * Each key reads at least one events_full granule, up to 64 MiB, so a read
 * takes this many keys and a file contributes only a few of them. Spans
 * outside that budget count as unverified.
 */
const KEYS_PER_READ = 8;
const KEYS_PER_FILE = 2;
const MAX_PENDING_SAMPLES = 1_000;

const pending: Sample[] = [];

/** Queue the rows both implementations wrote for one batch. */
export function queueRowVerification(sample: {
  projectId: string;
  fileKey: string;
  inputBytes: number;
  rows: ShadowRowKey[];
}): void {
  const keys = new Map<string, Sample["keys"][number]>();
  const spans = new Set<string>();
  const spansToRead = new Set<string>();
  for (const { traceId, spanId, startTime } of sample.rows) {
    const span = `${traceId}\u0000${spanId}`;
    spans.add(span);
    // The writers spell UTC start times differently; the minute is all the key needs.
    const minute = /^(\d{4}-\d\d-\d\d)[ T](\d\d:\d\d)/.exec(startTime);
    if (!minute) continue;
    const startMinute = `${minute[1]} ${minute[2]}:00`;
    const key = `${traceId}\u0000${startMinute}`;
    if (keys.size < KEYS_PER_FILE || keys.has(key)) {
      keys.set(key, [traceId, startMinute]);
      spansToRead.add(span);
    }
  }
  if (pending.length >= MAX_PENDING_SAMPLES) spansToRead.clear();
  if (spans.size > spansToRead.size) {
    recordIncrement(METRIC, spans.size - spansToRead.size, {
      outcome: "unverified",
    });
  }
  if (spansToRead.size === 0) return;
  pending.push({
    projectId: sample.projectId,
    fileKey: sample.fileKey,
    inputBytes: sample.inputBytes,
    keys: [...keys.values()],
    spans: spansToRead.size,
    queuedAt: Date.now(),
  });
}

// Maps hold the same entries in a different order on each side.
const sortedMaps = PreparedEvent.columns()
  .filter(({ columnType }) => columnType.startsWith("Map("))
  .map(({ name }) => `mapSort(${name}) AS ${name}`)
  .join(", ");
// The write-time clocks always differ, and event_bytes follows from the other columns.
const comparedColumns = `* EXCEPT (created_at, updated_at, event_ts, event_bytes) REPLACE (${sortedMaps})`;

// tuple() keeps column names only while the select list renames none of them.
const side = (name: "ts" | "rust", table: string) => `
    SELECT '${name}' AS side, blob_storage_file_path AS file, trace_id, span_id, event_ts,
      mapFromArrays(
        tupleNames(tuple(${comparedColumns})),
        [${comparedColumns} APPLY (x -> sipHash64(tuple(x)))]
      ) AS hashes
    FROM ${table}
    WHERE (project_id, toStartOfMinute(start_time), xxHash32(trace_id)) IN
        (SELECT k.1, toStartOfMinute(k.3), xxHash32(k.2) FROM (SELECT arrayJoin(keys) AS k))
      AND blob_storage_file_path IN {files: Array(String)}`;

/**
 * One row per sampled file. Both tables are read by primary key, the rows of a
 * span are paired, and only counts, column names and span ids come back.
 */
const QUERY = `
WITH {keys: Array(Tuple(String, String, DateTime64(6, 'UTC')))} AS keys
SELECT
  file,
  count() AS spans,
  countIf(ts_rows = 0) AS missing_ts,
  countIf(rust_rows = 0) AS missing_rust,
  countIf(notEmpty(changed)) AS different,
  groupUniqArrayArray(changed) AS changed_columns,
  groupArrayIf(3)(span_id, ts_rows = 0 OR rust_rows = 0 OR notEmpty(changed)) AS example_span_ids
FROM (
  SELECT
    file, trace_id, span_id,
    countIf(side = 'ts') AS ts_rows,
    countIf(side = 'rust') AS rust_rows,
    argMaxIf(hashes, event_ts, side = 'ts') AS ts,
    argMaxIf(hashes, event_ts, side = 'rust') AS rust,
    if(ts_rows > 0 AND rust_rows > 0,
       arrayFilter(name -> ts[name] != rust[name], mapKeys(ts)), []) AS changed
  FROM (${side("ts", "events_full")}
    UNION ALL${side("rust", "events_native_test")}
  )
  GROUP BY file, trace_id, span_id
)
GROUP BY file`;

type FileComparison = {
  file: string;
  spans: string;
  missing_ts: string;
  missing_rust: string;
  different: string;
  changed_columns: string[];
  example_span_ids: string[];
};

async function verify(samples: Sample[]): Promise<void> {
  const byFile = new Map(samples.map((sample) => [sample.fileKey, sample]));
  let rows: FileComparison[];
  try {
    rows = await queryClickhouse<FileComparison>({
      query: QUERY,
      params: {
        keys: samples.flatMap(({ projectId, keys }) =>
          keys.map((key) => new TupleParam([projectId, ...key])),
        ),
        files: [...byFile.keys()],
      },
      useMultipartParamsAuto: true,
      // Read where the rows were written, before replicas catch up.
      preferredClickhouseService: "ReadWrite",
      clickhouseSettings: {
        enable_named_columns_in_function_tuple: 1,
        max_threads: 2,
        max_execution_time: 10,
        max_bytes_to_read: String(MAX_BYTES_TO_READ),
      },
    });
  } catch (error) {
    recordIncrement(
      METRIC,
      samples.reduce((sum, { spans }) => sum + spans, 0),
      { outcome: "read_error" },
    );
    logger.warn("OTEL shadow row verification failed", {
      files: samples.length,
      error: classifyJobFailure(error),
    });
    return;
  }

  const found = new Map(rows.map((row) => [row.file, row]));
  for (const { projectId, fileKey, spans } of byFile.values()) {
    const row = found.get(fileKey);
    const read = Number(row?.spans ?? 0);
    const counts = {
      different: Number(row?.different ?? 0),
      missing_ts: Number(row?.missing_ts ?? 0),
      missing_rust: Number(row?.missing_rust ?? 0),
      // In neither table at the read.
      not_found: Math.max(0, spans - read),
    };
    const unmatched = Object.values(counts).reduce((sum, n) => sum + n, 0);
    const matched = read + counts.not_found - unmatched;
    for (const [outcome, count] of Object.entries({ ...counts, matched })) {
      if (count > 0) recordIncrement(METRIC, count, { outcome });
    }
    for (const column of row?.changed_columns ?? []) {
      recordIncrement(`${METRIC}.changed_column`, 1, { column });
    }
    if (unmatched > 0) {
      logger.warn("OTEL shadow rows differ", {
        projectId,
        fileKey,
        spans: read,
        ...counts,
        changedColumns: row?.changed_columns,
        exampleSpanIds: row?.example_span_ids,
      });
    }
  }
}

/** Compares the rows of sampled batches in the background, a few files per read. */
export class OtelShadowRowVerifier extends PeriodicRunner {
  constructor() {
    super("otel_shadow_row_verifier");
  }

  protected get name(): string {
    return "OtelShadowRowVerifier";
  }

  protected get defaultIntervalMs(): number {
    return 5_000;
  }

  protected async execute(): Promise<void> {
    const now = Date.now();
    const unsettled = pending.findIndex((s) => now - s.queuedAt < SETTLE_MS);
    const settled = pending.slice(0, unsettled < 0 ? undefined : unsettled);
    const inputBytes = settled.reduce((sum, s) => sum + s.inputBytes, 0);
    if (
      settled.length === 0 ||
      (inputBytes < FLUSH_INPUT_BYTES && now - settled[0].queuedAt < MAX_AGE_MS)
    ) {
      return;
    }
    pending.splice(0, settled.length);

    // One bounded read per flush; the remaining samples are not compared.
    const read: Sample[] = [];
    let keys = 0;
    let unverified = 0;
    for (const sample of settled) {
      if (keys + sample.keys.length > KEYS_PER_READ) {
        unverified += sample.spans;
        continue;
      }
      read.push(sample);
      keys += sample.keys.length;
    }
    if (unverified > 0)
      recordIncrement(METRIC, unverified, { outcome: "unverified" });
    await verify(read);
  }
}
