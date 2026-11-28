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

/** What identifies a stored row: project, trace, span and start time. */
type RowId = [
  projectId: string,
  traceId: string,
  spanId: string,
  startTime: string,
];

/** One sampled batch waiting for its rows to be compared. */
type Sample = {
  projectId: string;
  fileKey: string;
  rows: RowId[];
  queuedAt: number;
};

/**
 * Rows of several files that one query reads. Each row id leads with the
 * 1-based position of its file, so a row matches only in its own file.
 */
type Read = {
  idFields: [filePosition: number, ...RowId][][];
  fileKeys: string[];
};

/** Counts are UInt32 in the query: JSON carries those as numbers, UInt64 as strings. */
type Comparison = {
  file: string;
  found: number;
  missing_ts: number;
  missing_rust: number;
  different: number;
  changedColumns: string[];
  exampleSpanIds: string[];
  readError?: string;
};

const METRIC = "langfuse.ingestion.otel.shadow.rows";
/** Both writers flush on an interval, so rows are read once they had time to land. */
const SETTLE_MS = 20_000;
/**
 * Row ids and file names travel as form fields, which ClickHouse caps at
 * 128 KiB each (http_max_field_value_size). A read carries a few fields of
 * row ids: about 3,500 rows of OTEL-sized ids.
 */
const FIELD_BYTES = 100_000;
const ID_FIELDS_PER_READ = 4;
const READ_TIMEOUT_S = 60;
/**
 * A batch is sampled only while fewer rows than this wait to be compared, so
 * sampling slows down to what the comparison keeps up with.
 */
const MAX_WAITING_ROWS = 10_000;
/** Reads take at most about this share of a worker's time. */
const READ_TIME_SHARE = 0.1;

const pending: Sample[] = [];
let pendingRows = 0;
/** The batches being compared: their reads still to run and what the finished ones found. */
let current:
  | { samples: Sample[]; rows: number; reads: Read[]; found: Comparison[] }
  | undefined;

/** Whether the comparison has room for the rows of another batch. */
export const hasComparisonCapacity = (): boolean =>
  pendingRows + (current?.rows ?? 0) < MAX_WAITING_ROWS;

/** Queue the rows both implementations wrote for one batch. */
export function queueRowVerification(sample: {
  projectId: string;
  fileKey: string;
  rows: ShadowRowKey[];
}): void {
  const rows = new Map<string, RowId>();
  let unreadable = 0;
  for (const { traceId, spanId, startTime } of sample.rows) {
    const stored = storedStartTime(startTime);
    if (stored === undefined) {
      unreadable++;
      continue;
    }
    rows.set(`${traceId}\u0000${spanId}\u0000${stored}`, [
      sample.projectId,
      traceId,
      spanId,
      stored,
    ]);
  }
  if (unreadable > 0) {
    recordIncrement(METRIC, unreadable, { outcome: "unverified" });
  }
  if (rows.size === 0) return;
  pendingRows += rows.size;
  pending.push({
    projectId: sample.projectId,
    fileKey: sample.fileKey,
    rows: [...rows.values()],
    queuedAt: Date.now(),
  });
}

/** The start time as ClickHouse stores it: UTC with six fractional digits. */
export function storedStartTime(startTime: string): string | undefined {
  const match =
    /^(\d{4}-\d\d-\d\d)[ T](\d\d:\d\d:\d\d)(?:\.(\d{1,9}))?Z?$/.exec(startTime);
  return match
    ? `${match[1]} ${match[2]}.${(match[3] ?? "").padEnd(6, "0").slice(0, 6)}`
    : undefined;
}

/**
 * Compares the rows of sampled batches in the background. One query reads the
 * rows of many batches, and reads are paced to a small share of the worker's
 * time.
 */
export class OtelShadowRowVerifier extends PeriodicRunner {
  private stopped = false;

  constructor() {
    super("otel_shadow_row_verifier");
  }

  /** Samples not yet reported are dropped: the clients they read through close next. */
  public override stop(): void {
    this.stopped = true;
    super.stop();
  }

  protected get name(): string {
    return "OtelShadowRowVerifier";
  }

  protected get defaultIntervalMs(): number {
    return 5_000;
  }

  /**
   * Run one read of the batches being compared and report them once their
   * last read is done. The next run waits long enough to keep reads at
   * READ_TIME_SHARE of the worker's time.
   *
   * A group gives up its place when its last read is taken, whatever happens
   * to that read or to the report: a group that stayed would hold back every
   * later one, and sampling would stay throttled until a restart.
   */
  protected async execute(): Promise<number | void> {
    if (!current) current = nextGroup(Date.now());
    if (!current) return;
    const group = current;
    const startedAt = performance.now();
    try {
      const read = group.reads.shift();
      if (read) group.found.push(...(await compare(read)));
    } finally {
      if (group.reads.length === 0) {
        current = undefined;
        if (!this.stopped) reportGroup(group.samples, group.found);
      }
    }
    const readMs = performance.now() - startedAt;
    return Math.max(this.defaultIntervalMs, readMs * (1 / READ_TIME_SHARE - 1));
  }
}

/** The settled samples as the next group to compare, with the reads they need. */
function nextGroup(now: number): typeof current {
  const samples = takeSettled(now);
  if (samples.length === 0) return undefined;
  return {
    samples,
    rows: samples.reduce((sum, { rows }) => sum + rows.length, 0),
    reads: packRowsIntoReads(samples),
    found: [],
  };
}

/** Take the samples whose rows had time to land, one per file. */
function takeSettled(now: number): Sample[] {
  const unsettled = pending.findIndex((s) => now - s.queuedAt < SETTLE_MS);
  const due = pending.splice(0, unsettled < 0 ? pending.length : unsettled);
  pendingRows -= due.reduce((sum, { rows }) => sum + rows.length, 0);
  // A retried job queues its file again; one comparison covers it.
  return [...new Map(due.map((sample) => [sample.fileKey, sample])).values()];
}

/**
 * Split the samples' rows into reads that ClickHouse accepts.
 *
 * Row ids and file names are sent as query parameters, and ClickHouse rejects
 * a parameter above 128 KiB. A read therefore carries its row ids in up to
 * ID_FIELDS_PER_READ parameters of at most FIELD_BYTES each, and its file
 * names in one more. A full parameter starts the next one, and a full read
 * starts the next read, so a large file's rows can span several reads.
 */
function packRowsIntoReads(samples: Sample[]): Read[] {
  const reads: Read[] = [];
  let read: Read = { idFields: [[]], fileKeys: [] };
  let idBytes = 0;
  let fileBytes = 0;
  for (const { fileKey, rows } of samples) {
    const fileSize = Buffer.byteLength(fileKey) + 4;
    for (const id of rows) {
      // Quotes, commas, brackets and the file position around the values.
      const idSize = Buffer.byteLength(id.join("")) + 24;
      const isNewFile = () => read.fileKeys.at(-1) !== fileKey;
      const idFieldFull = idBytes > 0 && idBytes + idSize > FIELD_BYTES;
      const readFull =
        (idFieldFull && read.idFields.length === ID_FIELDS_PER_READ) ||
        (isNewFile() && fileBytes + fileSize > FIELD_BYTES);
      if (readFull) {
        reads.push(read);
        read = { idFields: [[]], fileKeys: [] };
        idBytes = 0;
        fileBytes = 0;
      } else if (idFieldFull) {
        read.idFields.push([]);
        idBytes = 0;
      }
      if (isNewFile()) {
        read.fileKeys.push(fileKey);
        fileBytes += fileSize;
      }
      read.idFields[read.idFields.length - 1].push([
        read.fileKeys.length,
        ...id,
      ]);
      idBytes += idSize;
    }
  }
  if (read.fileKeys.length > 0) reads.push(read);
  return reads;
}

// Maps hold the same entries in a different order on each side.

const sortedMaps = PreparedEvent.columns()
  .filter(({ columnType }) => columnType.startsWith("Map("))
  .map(({ name }) => `mapSort(${name}) AS ${name}`)
  .join(", ");

// The write-time clocks always differ, and event_bytes follows from the other columns.
const comparedColumns = `* EXCEPT (created_at, updated_at, event_ts, event_bytes) REPLACE (${sortedMaps})`;

/**
 * A map from column name to a hash of the column's value, so a difference can
 * be named by column without reading a value. tuple() names its elements after
 * the columns only with enable_named_columns_in_function_tuple, and while no
 * alias in the select list reuses a compared column's name.
 */
const columnHashes = `mapFromArrays(
        tupleNames(tuple(${comparedColumns})),
        [${comparedColumns} APPLY (x -> sipHash64(tuple(x)))]
      )`;

/** The primary key prefix of the wanted rows, so only granules that can hold one are read. */
const inWantedGranules = `(project_id, toStartOfMinute(start_time), xxHash32(trace_id)) IN
        (SELECT id.2, toStartOfMinute(id.5), xxHash32(id.3) FROM (SELECT arrayJoin(ids) AS id))`;

/** Exactly the wanted rows. An id starts with its file's position in {files}. */
const isWantedRow = `(indexOf({files: Array(String)}, blob_storage_file_path), project_id, trace_id, span_id, start_time) IN ids`;

/** The wanted rows one table stores, each with its column hashes. */
const storedRows = (side: "ts" | "rust", table: string) => `
    SELECT '${side}' AS side, blob_storage_file_path AS file,
      trace_id, span_id, start_time, event_ts,
      ${columnHashes} AS hashes
    FROM ${table}
    WHERE ${inWantedGranules}
      AND ${isWantedRow}`;

/**
 * Reads the given rows of many files from both tables in one pass and returns
 * one row per file: counts, column names and span ids.
 *
 * - `ids`: the wanted rows, sent as a few array parameters.
 * - `ts_stored`, `rust_stored`: what each table stores of them.
 * - `paired`: one row per file, trace, span and start time, with how many
 *   copies each side has and the columns whose hashes differ.
 *
 * A row has a counterpart only under the same file, trace, span and start
 * time, so `different` always means that the two sides stored different
 * values for the same row.
 */
const query = (idFields: number) => `
WITH
  arrayConcat(${Array.from(
    { length: idFields },
    (_, field) =>
      `{ids${field}: Array(Tuple(UInt64, String, String, String, DateTime64(6, 'UTC')))}`,
  ).join(", ")}) AS ids,
  ts_stored AS (${storedRows("ts", "events_full")}
  ),
  rust_stored AS (${storedRows("rust", "events_native_test")}
  ),
  paired AS (
    SELECT
      file, trace_id, span_id, start_time,
      countIf(side = 'ts') AS ts_rows,
      countIf(side = 'rust') AS rust_rows,
      argMaxIf(hashes, event_ts, side = 'ts') AS ts,
      argMaxIf(hashes, event_ts, side = 'rust') AS rust,
      if(ts_rows > 0 AND rust_rows > 0,
         arrayFilter(name -> ts[name] != rust[name], mapKeys(ts)), []) AS changed
    FROM (SELECT * FROM ts_stored UNION ALL SELECT * FROM rust_stored)
    GROUP BY file, trace_id, span_id, start_time
  )
SELECT
  file,
  toUInt32(count()) AS found,
  toUInt32(countIf(ts_rows = 0)) AS missing_ts,
  toUInt32(countIf(rust_rows = 0)) AS missing_rust,
  toUInt32(countIf(notEmpty(changed))) AS different,
  groupUniqArrayArray(changed) AS changedColumns,
  groupArrayIf(3)(span_id, ts_rows = 0 OR rust_rows = 0 OR notEmpty(changed)) AS exampleSpanIds
FROM paired
GROUP BY file`;

const nothingFound = (file: string): Comparison => ({
  file,
  found: 0,
  missing_ts: 0,
  missing_rust: 0,
  different: 0,
  changedColumns: [],
  exampleSpanIds: [],
});

/** Run one read. A failed read answers for each of its files with the failure class. */
async function compare({ idFields, fileKeys }: Read): Promise<Comparison[]> {
  try {
    return await queryClickhouse<Comparison>({
      query: query(idFields.length),
      params: {
        ...Object.fromEntries(
          idFields.map((ids, field) => [
            `ids${field}`,
            ids.map((id) => new TupleParam(id)),
          ]),
        ),
        files: fileKeys,
      },
      useMultipartParamsAuto: true,
      // Read where the rows were written, before replicas catch up.
      preferredClickhouseService: "ReadWrite",
      // The client waits longer than the server limit, so that limit is what ends a slow read.
      clickhouseConfigs: { request_timeout: (READ_TIMEOUT_S + 10) * 1000 },
      clickhouseSettings: {
        enable_named_columns_in_function_tuple: 1,
        // Columns ClickHouse derives follow from the compared ones.
        asterisk_include_alias_columns: 0,
        asterisk_include_materialized_columns: 0,
        max_threads: 2,
        max_execution_time: READ_TIMEOUT_S,
        timeout_overflow_mode: "throw",
      },
    });
  } catch (error) {
    const readError = classifyJobFailure(error);
    return fileKeys.map((file) => ({ ...nothingFound(file), readError }));
  }
}

function reportGroup(samples: Sample[], found: Comparison[]): void {
  const totals = totalsByFile(found);
  for (const sample of samples) {
    reportFile(
      sample,
      totals.get(sample.fileKey) ?? nothingFound(sample.fileKey),
    );
  }
}

/** Sum what the reads found for each file. */
function totalsByFile(found: Comparison[]): Map<string, Comparison> {
  const totals = new Map<string, Comparison>();
  for (const read of found) {
    const total = totals.get(read.file) ?? nothingFound(read.file);
    totals.set(read.file, {
      file: read.file,
      found: total.found + read.found,
      missing_ts: total.missing_ts + read.missing_ts,
      missing_rust: total.missing_rust + read.missing_rust,
      different: total.different + read.different,
      changedColumns: total.changedColumns.concat(read.changedColumns),
      exampleSpanIds: total.exampleSpanIds.concat(read.exampleSpanIds),
      readError: total.readError ?? read.readError,
    });
  }
  return totals;
}

function reportFile(
  { projectId, fileKey, rows }: Sample,
  total: Comparison,
): void {
  const unread = rows.length - total.found;
  const counts = {
    different: total.different,
    missing_ts: total.missing_ts,
    missing_rust: total.missing_rust,
    // Rows in neither table at the read.
    not_found: total.readError === undefined ? unread : 0,
    read_error: total.readError === undefined ? 0 : unread,
  };
  const unmatched = Object.values(counts).reduce((sum, n) => sum + n, 0);
  const matched = rows.length - unmatched;
  for (const [outcome, count] of Object.entries({ ...counts, matched })) {
    if (count > 0) recordIncrement(METRIC, count, { outcome });
  }
  const changedColumns = [...new Set(total.changedColumns)];
  for (const column of changedColumns) {
    recordIncrement(`${METRIC}.changed_column`, 1, { column });
  }
  if (unmatched > 0) {
    logger.warn("OTEL shadow rows differ", {
      projectId,
      fileKey,
      rows: rows.length,
      ...counts,
      readError: total.readError,
      changedColumns,
      exampleSpanIds: total.exampleSpanIds.slice(0, 3),
    });
  }
}
