import {
  logger,
  queryClickhouse,
  recordIncrement,
  TupleParam,
} from "@langfuse/shared/src/server";

export type OtelShadowRowLocator = {
  traceId: string;
  spanId: string;
  startTime: string;
};

export type OtelShadowRowSample = {
  projectId: string;
  fileKey: string;
  inputBytes: number;
  primary: OtelShadowRowLocator[];
  shadow: OtelShadowRowLocator[];
};

const BATCH_BYTES = 4 * 1024 * 1024;
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
  project: string;
  trace: string;
  span: string;
  time: string;
  file: string;
  digest: string;
  mapDigest: string;
  copies: string | number;
};

// The JSON writer uses a ClickHouse datetime and the Native writer exposes its
// UTC ISO value. Preserve fractional digits up to the table's microsecond scale.
function storedTime(value: string) {
  const match =
    /^(\d{4}-\d\d-\d\d)[ T](\d\d:\d\d:\d\d)(?:\.(\d{1,9}))?Z?$/.exec(value);
  if (!match) throw new Error("Invalid shadow start time");
  return `${match[1]} ${match[2]}.${(match[3] ?? "").padEnd(6, "0").slice(0, 6)}`;
}

// ClickHouse preserves insertion order for these maps. Keep a separate digest
// so equivalent buckets in a different order do not hide changed values.
const eventMaps = [
  "provided_usage_details",
  "usage_details",
  "provided_cost_details",
  "cost_details",
  "tool_definitions",
];
function readSide(
  table: "events_full" | "events_native_test",
  side: Stored["side"],
) {
  // Use both the actual primary-key prefix and the exact identity. The source
  // file distinguishes deliveries that share a span, and the digest stays in CH.
  return `
    SELECT '${side}' AS side, e.project_id AS project, e.trace_id AS trace,
      e.span_id AS span, toString(e.start_time, 'UTC') AS time,
      e.blob_storage_file_path AS file, count() AS copies,
      any(hex(sipHash128(tuple(e.* EXCEPT (created_at, updated_at, event_ts, ${eventMaps.join(", ")})),
        ${eventMaps.map((name) => `mapSort(e.${name})`).join(", ")}))) AS digest,
      any(hex(sipHash128(${eventMaps.map((name) => `e.${name}`).join(", ")}))) AS mapDigest
    FROM ${table} AS e
    WHERE (e.project_id, toStartOfMinute(e.start_time), xxHash32(e.trace_id)) IN
      (SELECT k.1, toStartOfMinute(k.4), xxHash32(k.2) FROM (SELECT arrayJoin(keys) AS k))
    AND (e.project_id, e.trace_id, e.span_id, e.start_time, e.blob_storage_file_path) IN keys
    GROUP BY e.project_id, e.trace_id, e.span_id, e.start_time, e.blob_storage_file_path`;
}

const query = `WITH {locators:Array(Tuple(String,String,String,DateTime64(6,'UTC'),String))} AS keys
  ${readSide("events_full", "primary")} UNION ALL
  ${readSide("events_native_test", "shadow")}`;

export async function verifyOtelShadowRows(
  samples: readonly OtelShadowRowSample[],
  read: typeof queryClickhouse = queryClickhouse,
  onDifference?: (outcome: string, key: Identity) => void,
): Promise<Record<string, number>> {
  const expected = new Map<string, Expected>();
  for (const [sampleIndex, sample] of samples.entries()) {
    for (const side of ["primary", "shadow"] as const) {
      for (const row of sample[side]) {
        const key: Identity = [
          sample.projectId,
          row.traceId,
          row.spanId,
          storedTime(row.startTime),
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
  const keys = Array.from(expected.values());
  for (let i = 0; i < keys.length; i += KEYS_PER_QUERY) {
    const chunk = keys.slice(i, i + KEYS_PER_QUERY);
    const rows = await read<Stored>({
      query,
      params: { locators: chunk.map(({ key }) => new TupleParam(key)) },
      useMultipartParamsAuto: true,
      preferredClickhouseService: "ReadWrite",
      tags: { surface: "worker", route: "otel-shadow-verify-rows" },
      clickhouseSettings: {
        max_threads: 2,
        max_execution_time: 8,
        max_bytes_to_read: "536870912",
        max_result_rows: String(KEYS_PER_QUERY * 2),
        result_overflow_mode: "throw",
        asterisk_include_materialized_columns: 1,
        asterisk_include_alias_columns: 1,
      },
    });
    const stored = new Map<string, Partial<Record<Stored["side"], Stored>>>();
    for (const row of rows) {
      const id = JSON.stringify([
        row.project,
        row.trace,
        row.span,
        row.time,
        row.file,
      ]);
      const pair = stored.get(id) ?? {};
      pair[row.side] = row;
      stored.set(id, pair);
    }
    for (const {
      key,
      repeated,
      primary: primaryAcks,
      shadow: shadowAcks,
    } of chunk) {
      const { primary, shadow } = stored.get(JSON.stringify(key)) ?? {};
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
      if (outcome !== "matched") onDifference?.(outcome, key);
    }
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
  const examples: Array<{
    outcome: string;
    projectId: string;
    traceId: string;
    spanId: string;
    startTime: string;
    fileKey: string;
  }> = [];
  active = verifyOtelShadowRows(
    group.map(({ sample }) => sample),
    queryClickhouse,
    (outcome, [projectId, traceId, spanId, startTime, fileKey]) => {
      if (examples.length < 5)
        examples.push({
          outcome,
          projectId,
          traceId,
          spanId,
          startTime,
          fileKey,
        });
    },
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
    .catch((error: unknown) => {
      // A timeout, unavailable table or incompatible schema says nothing about row equality.
      recordIncrement(
        "langfuse.ingestion.otel.shadow.verification_read_error",
        1,
      );
      logger.warn("OTEL shadow persisted-row verification query failed", {
        batches: group.length,
        errorType: error instanceof Error ? error.name : "unknown",
        code:
          error && typeof error === "object" && "code" in error
            ? String(error.code).slice(0, 32)
            : undefined,
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
