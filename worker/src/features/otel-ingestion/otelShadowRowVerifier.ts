import {
  eventRecordReadSchema,
  logger,
  queryClickhouse,
  recordIncrement,
  TupleParam,
  withCustomerDataLoggingSuppressed,
} from "@langfuse/shared/src/server";

import {
  shadowRowKey,
  shadowStoredTime,
  type OtelShadowRowLocator,
} from "./otelShadowRowKey";

export type OtelShadowRowSample = {
  projectId: string;
  fileKey: string;
  jobId?: string;
  inputBytes: number;
  primary: OtelShadowRowLocator[];
  shadow: OtelShadowRowLocator[];
};

const BATCH_BYTES = 64 * 1024 * 1024;
const SETTLE_MS = 5_000;
const MAX_AGE_MS = 30_000;
const KEYS_PER_QUERY = 512;
const MAX_PENDING_ROWS = 16_384;
const MAX_LOCATOR_BYTES = 8 * 1024 * 1024;

type Identity = [string, string, string, string, string];
type Expected = {
  key: Identity;
  sampleIndex: number;
  repeated: boolean;
  primary: number;
  shadow: number;
};
type Stored = {
  side: "primary" | "shadow";
  position: number;
  digest: string;
  mapDigest: string;
  copies: string | number;
};

// ClickHouse preserves insertion order for these maps. Keep a separate digest
// so equivalent buckets in a different order do not hide changed values.
const eventMaps = [
  "provided_usage_details",
  "usage_details",
  "provided_cost_details",
  "cost_details",
  "tool_definitions",
];
const excludedClocks = "created_at, updated_at, event_ts";
const columns = `e.* EXCEPT (${excludedClocks})`;
export type OtelShadowRowDifference = {
  outcome: string;
  rowKey: ReturnType<typeof shadowRowKey>;
  jobId?: string;
  primaryAcks: number;
  shadowAcks: number;
  primaryCopies: number;
  shadowCopies: number;
  changedColumns?: string[];
  orderOnlyColumns?: string[];
  fieldDetails?: "unavailable" | "changed_since_read";
};
type Fields = Pick<Stored, "side" | "position" | "copies"> & {
  columnDigests: Record<string, string>;
  sortedMaps: string[];
};
function readSide(
  table: "events_full" | "events_native_test",
  side: Stored["side"],
  details: boolean,
) {
  // Use both the actual primary-key prefix and the exact identity. The source
  // file distinguishes deliveries that share a span. Only counts and hashes
  // need to travel back to the worker.
  const identity =
    "(e.project_id, e.trace_id, e.span_id, e.start_time, e.blob_storage_file_path)";
  const hashes = details
    ? `any(mapFromArrays(tupleNames(tuple(${columns})), [${columns} APPLY(x -> hex(sipHash128(tuple(x))))])) AS columnDigests,
       any([${eventMaps.map((name) => `hex(sipHash128(mapSort(e.${name})))`).join(", ")}]) AS sortedMaps`
    : `any(hex(sipHash128(tuple(e.* EXCEPT (${excludedClocks}, ${eventMaps.join(", ")})),
       ${eventMaps.map((name) => `mapSort(e.${name})`).join(", ")}))) AS digest,
       any(hex(sipHash128(${eventMaps.map((name) => `e.${name}`).join(", ")}))) AS mapDigest`;
  return `
    SELECT '${side}' AS side, indexOf(keys, ${identity}) AS position, count() AS copies, ${hashes}
    FROM ${table} AS e
    WHERE (e.project_id, toStartOfMinute(e.start_time), xxHash32(e.trace_id)) IN
      (SELECT k.1, toStartOfMinute(k.4), xxHash32(k.2) FROM (SELECT arrayJoin(keys) AS k))
    AND ${identity} IN keys
    GROUP BY position`;
}

async function readPairs<T extends Pick<Stored, "side" | "position">>(
  keys: Identity[],
  read: typeof queryClickhouse,
  details: boolean,
) {
  const pairs = keys.map((): Partial<Record<Stored["side"], T>> => ({}));
  const rows = await withCustomerDataLoggingSuppressed(() =>
    read<T>({
      query: `WITH {locators:Array(Tuple(String,String,String,DateTime64(6,'UTC'),String))} AS keys
      ${readSide("events_full", "primary", details)} UNION ALL ${readSide("events_native_test", "shadow", details)}`,
      params: { locators: keys.map((key) => new TupleParam(key)) },
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
    }),
  );
  for (const row of rows) pairs[row.position - 1][row.side] = row;
  return pairs;
}

async function describeChangedFields(
  examples: { key: Identity; example: OtelShadowRowDifference }[],
  read: typeof queryClickhouse,
) {
  const changed = examples.filter(
    ({ example }) =>
      example.outcome === "different" || example.outcome === "map_order_only",
  );
  if (!changed.length) return;
  try {
    const pairs = await readPairs<Fields>(
      changed.map((item) => item.key),
      read,
      true,
    );
    pairs.forEach(({ primary, shadow }, i) => {
      const { example } = changed[i];
      if (
        !primary ||
        !shadow ||
        Number(primary.copies) !== 1 ||
        Number(shadow.copies) !== 1
      ) {
        example.fieldDetails = "changed_since_read";
        return;
      }
      const values = new Set<string>();
      const ordering: string[] = [];
      const names = new Set([
        ...Object.keys(primary.columnDigests),
        ...Object.keys(shadow.columnDigests),
      ]);
      for (const name of names) {
        if (primary.columnDigests[name] === shadow.columnDigests[name])
          continue;
        const index = eventMaps.indexOf(name);
        if (
          index >= 0 &&
          primary.sortedMaps[index] === shadow.sortedMaps[index]
        )
          ordering.push(name);
        else
          values.add(
            Object.hasOwn(eventRecordReadSchema.shape, name)
              ? name
              : "unmapped_column",
          );
      }
      example.changedColumns = [...values].sort();
      example.orderOnlyColumns = ordering.sort();
      if (
        (example.outcome === "different") !== values.size > 0 ||
        (!values.size && !ordering.length)
      )
        example.fieldDetails = "changed_since_read";
    });
  } catch {
    for (const { example } of changed) example.fieldDetails = "unavailable";
  }
}

export async function verifyOtelShadowRows(
  samples: readonly OtelShadowRowSample[],
  read: typeof queryClickhouse = queryClickhouse,
  onDifference?: (example: OtelShadowRowDifference) => void,
): Promise<Record<string, number>> {
  const expected = new Map<string, Expected>();
  for (const [sampleIndex, sample] of samples.entries()) {
    for (const side of ["primary", "shadow"] as const) {
      for (const row of sample[side]) {
        const startTime = shadowStoredTime(row.startTime);
        if (!startTime) throw new Error("Invalid shadow start time");
        const key: Identity = [
          sample.projectId,
          row.traceId,
          row.spanId,
          startTime,
          sample.fileKey,
        ];
        const id = JSON.stringify(key);
        const entry = expected.get(id) ?? {
          key,
          sampleIndex,
          repeated: false,
          primary: 0,
          shadow: 0,
        };
        if (entry.sampleIndex !== sampleIndex) entry.repeated = true;
        entry[side]++;
        expected.set(id, entry);
      }
    }
  }

  const counts: Record<string, number> = {};
  const examples = new Map<
    string,
    { key: Identity; example: OtelShadowRowDifference }
  >();
  const keys = Array.from(expected.values());
  for (let i = 0; i < keys.length; i += KEYS_PER_QUERY) {
    const chunk = keys.slice(i, i + KEYS_PER_QUERY);
    const pairs = await readPairs<Stored>(
      chunk.map((item) => item.key),
      read,
      false,
    );
    for (const [
      index,
      { key, repeated, sampleIndex, primary: primaryAcks, shadow: shadowAcks },
    ] of chunk.entries()) {
      const { primary, shadow } = pairs[index];
      let outcome: string;
      if (
        repeated ||
        primaryAcks > 1 ||
        shadowAcks > 1 ||
        Number(primary?.copies ?? 0) > 1 ||
        Number(shadow?.copies ?? 0) > 1 ||
        (primary && !primaryAcks) ||
        (shadow && !shadowAcks)
      )
        outcome = "ambiguous";
      else if (!primary && !shadow) outcome = "missing_both";
      else if (!primary) outcome = "missing_primary";
      else if (!shadow) outcome = "missing_shadow";
      else if (primary.digest !== shadow.digest) outcome = "different";
      else
        outcome =
          primary.mapDigest === shadow.mapDigest ? "matched" : "map_order_only";
      counts[outcome] = (counts[outcome] ?? 0) + 1;
      if (onDifference && outcome !== "matched" && !examples.has(outcome)) {
        const [projectId, traceId, spanId, startTime] = key;
        examples.set(outcome, {
          key,
          example: {
            outcome,
            rowKey: shadowRowKey(projectId, { traceId, spanId, startTime }),
            jobId: samples[sampleIndex].jobId,
            primaryAcks,
            shadowAcks,
            primaryCopies: Number(primary?.copies ?? 0),
            shadowCopies: Number(shadow?.copies ?? 0),
          },
        });
      }
    }
  }
  if (onDifference) {
    await describeChangedFields([...examples.values()], read);
    for (const { example } of examples.values()) onDifference(example);
  }
  return counts;
}

type Pending = {
  sample: OtelShadowRowSample;
  at: number;
  bytes: number;
  rows: number;
};
const pending: Pending[] = [];
let retainedBytes = 0;
let retainedRows = 0;
let pendingInputBytes = 0;
let byteTargetAt: number | undefined;
let scheduledFor: number | undefined;
let timer: NodeJS.Timeout | undefined;
let active: Promise<void> | undefined;

export function enqueueOtelShadowRows(sample: OtelShadowRowSample): void {
  const rows = sample.primary.length + sample.shadow.length;
  if (!rows) return;
  // Charge the strings actually retained. Input size controls read cadence, but
  // a large source file can produce just one small locator after ingestion.
  let bytes =
    Buffer.byteLength(sample.projectId) + Buffer.byteLength(sample.fileKey);
  for (const side of [sample.primary, sample.shadow]) {
    for (const row of side)
      bytes +=
        128 +
        Buffer.byteLength(row.traceId) +
        Buffer.byteLength(row.spanId) +
        Buffer.byteLength(row.startTime);
  }
  if (
    retainedRows + rows > MAX_PENDING_ROWS ||
    retainedBytes + bytes > MAX_LOCATOR_BYTES
  ) {
    recordIncrement("langfuse.ingestion.otel.shadow.row_verification", rows, {
      outcome: "capacity",
    });
    return;
  }
  retainedRows += rows;
  retainedBytes += bytes;
  pendingInputBytes += sample.inputBytes;
  const at = Date.now();
  pending.push({ sample, at, bytes, rows });
  if (byteTargetAt === undefined && pendingInputBytes >= BATCH_BYTES)
    byteTargetAt = at;
  scheduleRead();
}

function scheduleRead() {
  if (!pending.length || active) return;
  // Wait for the last batch that fills the byte target. Starting the clock
  // on the first one would read a single key at a time under steady traffic.
  const due = Math.min(
    pending[0].at + MAX_AGE_MS,
    (byteTargetAt ?? Infinity) + SETTLE_MS,
  );
  if (scheduledFor === due) return;
  scheduledFor = due;
  clearTimeout(timer);
  timer = setTimeout(() => startRead(false), Math.max(0, due - Date.now()));
  timer.unref();
}

function startRead(force: boolean) {
  clearTimeout(timer);
  scheduledFor = undefined;
  if (active || !pending.length) return;
  const cutoff = Date.now() - SETTLE_MS;
  let size = 0;
  let count = 0;
  while (
    count < pending.length &&
    (force || pending[count].at <= cutoff) &&
    size < BATCH_BYTES
  ) {
    size += pending[count].sample.inputBytes;
    count++;
  }
  if (!count) return scheduleRead();
  const group = pending.splice(0, count);
  pendingInputBytes -= size;
  byteTargetAt = undefined;
  if (pendingInputBytes >= BATCH_BYTES) {
    let bytes = 0;
    for (const item of pending) {
      bytes += item.sample.inputBytes;
      if (bytes >= BATCH_BYTES) {
        byteTargetAt = item.at;
        break;
      }
    }
  }
  const examples: OtelShadowRowDifference[] = [];
  active = verifyOtelShadowRows(
    group.map(({ sample }) => sample),
    queryClickhouse,
    (example) => examples.push(example),
  )
    .then((counts) => {
      for (const [outcome, rows] of Object.entries(counts)) {
        recordIncrement(
          "langfuse.ingestion.otel.shadow.row_verification",
          rows,
          { outcome },
        );
      }
      if (examples.length) {
        logger.info(
          "OTEL shadow persisted rows differ or could not be attributed",
          {
            counts,
            examples,
          },
        );
      }
    })
    .catch(() => {
      recordIncrement(
        "langfuse.ingestion.otel.shadow.verification_read_error",
        1,
      );
      logger.warn("OTEL shadow persisted-row verification query failed", {
        batches: group.length,
      });
    })
    .finally(() => {
      for (const item of group) {
        retainedRows -= item.rows;
        retainedBytes -= item.bytes;
      }
      active = undefined;
      scheduleRead();
    });
}

export async function drainOtelShadowRowVerifier(): Promise<void> {
  while (active || pending.length) {
    startRead(true);
    await active;
  }
}
