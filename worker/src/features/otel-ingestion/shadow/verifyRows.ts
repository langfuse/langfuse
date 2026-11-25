import { createHash } from "node:crypto";
import { xxh32 } from "@node-rs/xxhash";
import {
  logger,
  queryClickhouse,
  recordIncrement,
  TupleParam,
} from "@langfuse/shared/src/server";
import { shadowJobId, shadowRowKey, shadowStoredTime } from "./rowKey";
import type { OtelShadowRowLocator } from "./rowKey";

// Keep the multi-granule read bounded; a failed chunk is accounted for without
// preventing later chunks in the same flush.
const CHUNK = 64;
const FLUSH_BYTES = 64 * 1024 * 1024;
const SETTLE_MS = 5_000;
const MAX_AGE_MS = 30_000;
const TICK_MS = 5_000;
const MAX_ROWS = 16_384;
const MAX_BYTES = 8 * 1024 * 1024;
const METRIC = "langfuse.ingestion.otel.shadow.row_verification";
const READ_ERROR = "langfuse.ingestion.otel.shadow.verification_read_error";

type Side = "primary" | "shadow";
type Key = [string, string, string, string, string];
type EnqueuedRows = {
  projectId: string;
  fileKey: string;
  jobId?: string;
  inputBytes: number;
  primary: readonly OtelShadowRowLocator[];
  shadow: readonly OtelShadowRowLocator[];
};
type Locator = {
  key: Key;
  jobId?: string;
  primaryEnqueued: number;
  shadowEnqueued: number;
  finalRead?: boolean;
  multipleBatches: boolean;
};
type Stored = {
  side: Side;
  position: number;
  copies: number | string;
  fields: Record<string, string>;
  sortedMaps: string[];
};

type ShadowRowDifference = {
  outcome: string;
  rowKey: ReturnType<typeof shadowRowKey>;
  jobId?: string;
  primaryEnqueued: number;
  shadowEnqueued: number;
  primaryCopies: number;
  shadowCopies: number;
  changedColumns?: string[];
  orderOnlyColumns?: string[];
};

const sides = ["primary", "shadow"] as const;
const maps = [
  "provided_usage_details",
  "usage_details",
  "provided_cost_details",
  "cost_details",
  "tool_definitions",
];
const identity =
  "(e.project_id, xxHash32(e.trace_id), hex(SHA256(e.trace_id)), hex(SHA256(e.span_id)), toTimeZone(e.start_time, 'UTC'), hex(SHA256(e.blob_storage_file_path)))";
const columns = "e.* EXCEPT (created_at, updated_at, event_ts)";

function sideQuery(table: string, side: Side): string {
  const fields = `any(mapFromArrays(tupleNames(tuple(${columns})), [${columns} APPLY(x -> hex(sipHash128(tuple(x))))])) AS fields`;
  const sorted = `any([${maps.map((name) => `hex(sipHash128(mapSort(e.${name})))`).join(", ")}]) AS sortedMaps`;
  return `SELECT '${side}' AS side, indexOf(keys, ${identity}) AS position,
    count() AS copies, ${fields}, ${sorted}
FROM ${table} AS e
WHERE (e.project_id, toStartOfMinute(e.start_time), xxHash32(e.trace_id)) IN
  (SELECT k.1, toStartOfMinute(k.5), k.2
   FROM (SELECT arrayJoin(keys) AS k))
  AND ${identity} IN keys
GROUP BY position`;
}

// A ClickHouse parameter error can quote the offending value. Send only digests
// of the exporter IDs and file path, keeping the indexed trace hash for pruning.
function digest(value: string) {
  return createHash("sha256").update(value).digest("hex").toUpperCase();
}

async function readHashes(keys: Key[]): Promise<Map<number, Stored[]>> {
  const rows = await queryClickhouse<Stored>({
    query: `WITH {locators:Array(Tuple(String,UInt32,String,String,DateTime64(6,'UTC'),String))} AS keys
${sideQuery("events_full", "primary")}
UNION ALL
${sideQuery("events_native_test", "shadow")}`,
    params: {
      locators: keys.map(
        ([projectId, traceId, spanId, startTime, file]) =>
          new TupleParam([
            projectId,
            xxh32(traceId),
            digest(traceId),
            digest(spanId),
            startTime,
            digest(file),
          ]),
      ),
    },
    useMultipartParamsAuto: true,
    preferredClickhouseService: "ReadWrite",
    tags: { surface: "worker", route: "otel-shadow-verify-rows" },
    clickhouseSettings: {
      max_threads: 2,
      max_execution_time: 8,
      max_bytes_to_read: "536870912",
      max_result_rows: String(keys.length * 2),
      result_overflow_mode: "throw",
      asterisk_include_materialized_columns: 1,
      asterisk_include_alias_columns: 1,
      enable_named_columns_in_function_tuple: 1,
      log_queries: 0,
    },
  });
  return Map.groupBy(rows, (row) => Number(row.position) - 1);
}

function collect(sample: EnqueuedRows) {
  let validTimes = true;
  const locators = new Map<string, Locator>();
  for (const side of sides) {
    for (const row of sample[side]) {
      const startTime = shadowStoredTime(row.startTime);
      if (startTime === undefined) validTimes = false;
      const key: Key = [
        sample.projectId,
        row.traceId,
        row.spanId,
        startTime ?? row.startTime,
        sample.fileKey,
      ];
      const id = JSON.stringify([row.traceId, row.spanId, key[3]]);
      const item = locators.get(id) ?? {
        key,
        jobId: sample.jobId && shadowJobId(sample.jobId),
        primaryEnqueued: 0,
        shadowEnqueued: 0,
        multipleBatches: false,
      };
      if (side === "primary") item.primaryEnqueued++;
      else item.shadowEnqueued++;
      locators.set(id, item);
    }
  }
  return { locators: [...locators.values()], validTimes };
}

function enqueueCounts(item: Locator) {
  const [projectId, traceId, spanId, startTime] = item.key;
  return {
    rowKey: shadowRowKey(projectId, { traceId, spanId, startTime }),
    primaryEnqueued: item.primaryEnqueued,
    shadowEnqueued: item.shadowEnqueued,
  };
}

function combine(group: Pending[]): Locator[] {
  if (group.length === 1) return group[0].locators;
  const locators = new Map<string, Locator>();
  for (const { locators: batch } of group) {
    for (const item of batch) {
      const id = JSON.stringify(item.key);
      const existing = locators.get(id);
      if (existing) {
        existing.multipleBatches = true;
        existing.primaryEnqueued += item.primaryEnqueued;
        existing.shadowEnqueued += item.shadowEnqueued;
      } else locators.set(id, item);
    }
  }
  return [...locators.values()];
}

function compareFields(primary: Stored, shadow: Stored) {
  const changed: string[] = [];
  const orderOnly: string[] = [];
  for (const name of new Set([
    ...Object.keys(primary.fields),
    ...Object.keys(shadow.fields),
  ])) {
    if (primary.fields[name] === shadow.fields[name]) continue;
    const index = maps.indexOf(name);
    if (index >= 0 && primary.sortedMaps[index] === shadow.sortedMaps[index])
      orderOnly.push(name);
    else changed.push(name);
  }
  changed.sort();
  orderOnly.sort();
  return { changedColumns: changed, orderOnlyColumns: orderOnly };
}

async function verify(
  locators: Locator[],
  force: boolean,
): Promise<{
  retry: Locator[];
  counts: Record<string, number>;
  examples: ShadowRowDifference[];
  readErrors: number;
}> {
  const retry: Locator[] = [];
  const counts: Record<string, number> = {};
  const examples: Partial<Record<string, ShadowRowDifference>> = {};
  let readErrors = 0;
  for (let offset = 0; offset < locators.length; offset += CHUNK) {
    const chunk = locators.slice(offset, offset + CHUNK);
    let hashes: Map<number, Stored[]> | undefined;
    try {
      hashes = await readHashes(chunk.map(({ key }) => key));
    } catch {
      readErrors += chunk.length;
    }
    for (const [index, item] of chunk.entries()) {
      const rows = hashes?.get(index) ?? [];
      const primary = rows.find(({ side }) => side === "primary");
      const shadow = rows.find(({ side }) => side === "shadow");
      const primaryCopies = Number(primary?.copies ?? 0);
      const shadowCopies = Number(shadow?.copies ?? 0);
      let outcome = "read_error";
      let fields: ReturnType<typeof compareFields> | undefined;
      if (hashes) {
        const ambiguous =
          item.multipleBatches ||
          item.primaryEnqueued > 1 ||
          item.shadowEnqueued > 1 ||
          primaryCopies > 1 ||
          shadowCopies > 1 ||
          (primary !== undefined && item.primaryEnqueued === 0) ||
          (shadow !== undefined && item.shadowEnqueued === 0);
        if (ambiguous) outcome = "ambiguous";
        else if (
          !force &&
          !item.finalRead &&
          ((item.primaryEnqueued > 0 && !primary) ||
            (item.shadowEnqueued > 0 && !shadow))
        ) {
          item.finalRead = true;
          retry.push(item);
          continue;
        } else if (primary === undefined && shadow === undefined)
          outcome = "missing_both";
        else if (primary === undefined) outcome = "missing_primary";
        else if (shadow === undefined) outcome = "missing_shadow";
        else {
          fields = compareFields(primary, shadow);
          if (fields.changedColumns.length > 0) outcome = "different";
          else if (fields.orderOnlyColumns.length > 0)
            outcome = "map_order_only";
          else outcome = "matched";
        }
      }
      counts[outcome] = (counts[outcome] ?? 0) + 1;
      if (outcome === "matched" || examples[outcome] !== undefined) continue;
      examples[outcome] = {
        outcome,
        ...enqueueCounts(item),
        jobId: item.jobId,
        primaryCopies,
        shadowCopies,
        ...fields,
      };
    }
  }
  return {
    retry,
    counts,
    examples: Object.values(examples).filter(
      (example): example is ShadowRowDifference => example !== undefined,
    ),
    readErrors,
  };
}

type Pending = {
  locators: Locator[];
  inputBytes: number;
  readyAt: number;
  dueAt: number;
  bytes: number;
  rows: number;
};
let pending: Pending[] = [];
let retainedBytes = 0;
let retainedRows = 0;
let timer: NodeJS.Timeout | undefined;
let active: Promise<void> | undefined;

function sizeOf(sample: EnqueuedRows): number {
  let bytes =
    Buffer.byteLength(sample.projectId) + Buffer.byteLength(sample.fileKey);
  for (const side of sides) {
    for (const row of sample[side]) {
      bytes +=
        128 +
        Buffer.byteLength(row.traceId) +
        Buffer.byteLength(row.spanId) +
        Buffer.byteLength(row.startTime);
    }
  }
  return bytes;
}

function arm(): void {
  if (timer !== undefined || active !== undefined || pending.length === 0)
    return;
  timer = setTimeout(() => {
    timer = undefined;
    flush(false);
  }, TICK_MS);
  timer.unref();
}

function flush(force: boolean): void {
  if (active !== undefined || pending.length === 0) return;
  const now = Date.now();
  let bytes = 0;
  const group = new Set<Pending>();
  let due = force;
  for (const item of pending) {
    if (!force && now < item.readyAt) continue;
    group.add(item);
    bytes += item.inputBytes;
    if (now >= item.dueAt) due = true;
    if (bytes >= FLUSH_BYTES) break;
  }
  if (!group.size || (!due && bytes < FLUSH_BYTES)) {
    arm();
    return;
  }
  pending = pending.filter((item) => !group.has(item));
  const items = [...group];
  let bytesToRelease = items.reduce((total, item) => total + item.bytes, 0);
  let rowsToRelease = items.reduce((total, item) => total + item.rows, 0);
  active = verify(combine(items), force)
    .then(({ counts, examples, readErrors, retry }) => {
      if (retry.length) {
        // A retry retains only row keys. Shared project and file names were
        // already charged once per sample in the original reservation.
        const retryBytes = Math.min(
          bytesToRelease,
          retry.reduce(
            (sum, { key }) =>
              sum +
              128 +
              key.reduce((bytes, field) => bytes + Buffer.byteLength(field), 0),
            0,
          ),
        );
        const retryAt = Date.now() + MAX_AGE_MS;
        pending.push({
          locators: retry,
          inputBytes: 0,
          readyAt: retryAt,
          dueAt: retryAt,
          rows: retry.length,
          bytes: retryBytes,
        });
        bytesToRelease -= retryBytes;
        rowsToRelease -= retry.length;
      }
      for (const [outcome, rows] of Object.entries(counts))
        recordIncrement(METRIC, rows, { outcome });
      if (readErrors > 0) {
        recordIncrement(READ_ERROR, readErrors);
        logger.warn("OTEL shadow persisted-row verification query failed", {
          groups: group.size,
        });
      }
      if (examples.length > 0)
        logger.info(
          "OTEL shadow persisted rows differ or could not be attributed",
          { counts, examples },
        );
    })
    .catch(() => {
      recordIncrement(READ_ERROR, 1);
      logger.warn("OTEL shadow persisted-row verification query failed", {
        groups: group.size,
      });
    })
    .finally(() => {
      retainedRows -= rowsToRelease;
      retainedBytes -= bytesToRelease;
      active = undefined;
      arm();
    });
}

export function enqueueShadowRows(sample: EnqueuedRows) {
  const rows = sample.primary.length + sample.shadow.length;
  if (rows === 0) return [];
  const bytes = sizeOf(sample);
  // Bound transient work for a single oversized sample as well as queued reads.
  if (rows > MAX_ROWS || bytes > MAX_BYTES) {
    recordIncrement(METRIC, rows, { outcome: "capacity" });
    return;
  }
  const { locators, validTimes } = collect(sample);
  const differences = [];
  for (const item of locators) {
    if (item.primaryEnqueued !== item.shadowEnqueued)
      differences.push(enqueueCounts(item));
    if (differences.length === 3) break;
  }
  if (retainedRows + rows > MAX_ROWS || retainedBytes + bytes > MAX_BYTES) {
    recordIncrement(METRIC, rows, { outcome: "capacity" });
    return differences;
  }
  if (!validTimes) {
    recordIncrement(READ_ERROR, rows);
    return differences;
  }
  const now = Date.now();
  pending.push({
    locators,
    inputBytes: sample.inputBytes,
    readyAt: now + SETTLE_MS,
    dueAt: now + MAX_AGE_MS,
    bytes,
    rows,
  });
  retainedRows += rows;
  retainedBytes += bytes;
  arm();

  return differences;
}

export async function flushShadowRows(): Promise<void> {
  while (active !== undefined || pending.length > 0) {
    clearTimeout(timer);
    timer = undefined;
    flush(true);
    if (active !== undefined) await active;
  }
}
