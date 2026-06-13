import { type z } from "zod";
import { type QueryType, type granularities } from "../types";
import { GreptimeQueryBuilder, type PostProcess } from "./greptimeQueryBuilder";
import { greptimeQuery } from "../../../server/greptime/client";
import { greptimeJson } from "../../../server/greptime/sql/rowContract";
import { mergeUsageOrCostMaps } from "../../../server/repositories/greptime/rollup";

/**
 * GreptimeDB dashboard query executor (04-read-path.md, P3). Builds GreptimeDB SQL via
 * `GreptimeQueryBuilder`, runs it, then applies the app-side post-processing the builder cannot
 * express in GreptimeDB SQL:
 *  - dynamic-key by-type expansion (costByType/usageByType) — GreptimeDB cannot enumerate JSON map
 *    keys in SQL, so the per-entity raw JSON is summed per dynamic key app-side;
 *  - time-series gap-fill — GreptimeDB has no `WITH FILL`, so missing buckets are emitted with zeros;
 *  - numeric coercion — mysql2 returns DECIMAL/BIGINT as strings; metric columns are coerced to
 *    numbers and `time_dimension` to an ISO string, matching the ClickHouse row shape.
 *
 * Returns `Array<Record<string, unknown>>` with the same column aliases the ClickHouse engine
 * produced (dimension aliases, `time_dimension`, `<agg>_<measure>`), so callers stay unchanged.
 */

type Granularity = z.infer<typeof granularities>;

const FIXED_BUCKET_MS: Record<string, number> = {
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
  "5m": 300_000,
  "10m": 600_000,
  "15m": 900_000,
  "30m": 1_800_000,
  "1h": 3_600_000,
  "2h": 7_200_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
  "2d": 172_800_000,
  "1w": 604_800_000,
};

const isoOf = (v: unknown): string =>
  v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString();

/** Bucket start epochs across [from, to], matching date_trunc (week/month) / date_bin (fixed). */
const bucketGrid = (
  granularity: Exclude<Granularity, "auto">,
  fromMs: number,
  toMs: number,
): number[] => {
  const starts: number[] = [];
  if (granularity === "month") {
    const d = new Date(fromMs);
    let cur = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
    while (cur <= toMs) {
      starts.push(cur);
      const c = new Date(cur);
      cur = Date.UTC(c.getUTCFullYear(), c.getUTCMonth() + 1, 1);
    }
    return starts;
  }
  if (granularity === "week") {
    // date_trunc('week') aligns to Monday 00:00 UTC
    const d = new Date(fromMs);
    const diffToMonday = (d.getUTCDay() + 6) % 7;
    let cur = Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate() - diffToMonday,
    );
    while (cur <= toMs) {
      starts.push(cur);
      cur += FIXED_BUCKET_MS["1w"];
    }
    return starts;
  }
  const stepMs = FIXED_BUCKET_MS[granularity];
  const start = Math.floor(fromMs / stepMs) * stepMs;
  const end = Math.floor(toMs / stepMs) * stepMs;
  for (let b = start; b <= end; b += stepMs) starts.push(b);
  return starts;
};

/** Coerce a raw GreptimeDB row to the ClickHouse output shape (numeric metrics + ISO time bucket). */
const coerceRow = (
  row: Record<string, unknown>,
  metricColumns: string[],
  hasTime: boolean,
): Record<string, unknown> => {
  const out: Record<string, unknown> = { ...row };
  for (const col of metricColumns) {
    if (col in out && out[col] != null) out[col] = Number(out[col]);
  }
  if (hasTime && out.time_dimension != null) {
    out.time_dimension = isoOf(out.time_dimension);
  }
  return out;
};

/** Expand a per-entity raw JSON fetch into one row per (bucket, group dims, dynamic key). */
const expandByType = (
  rows: Array<Record<string, unknown>>,
  desc: NonNullable<PostProcess["byType"]>,
): Array<Record<string, unknown>> => {
  const groups = new Map<
    string,
    { time: string | null; dims: unknown[]; sums: Record<string, number> }
  >();
  for (const row of rows) {
    const map = greptimeJson<Record<string, number>>(row[desc.jsonColumn], {});
    const time = desc.hasTime ? isoOf(row.time_dimension) : null;
    const dims = desc.groupDimensionAliases.map((a) => row[a]);
    const key = JSON.stringify([time, ...dims]);
    const g = groups.get(key) ?? { time, dims, sums: {} };
    g.sums = mergeUsageOrCostMaps([g.sums, map]);
    groups.set(key, g);
  }

  const out: Array<Record<string, unknown>> = [];
  for (const g of groups.values()) {
    for (const [k, v] of Object.entries(g.sums)) {
      const r: Record<string, unknown> = {};
      desc.groupDimensionAliases.forEach((a, i) => (r[a] = g.dims[i]));
      r[desc.keyDimensionAlias] = k;
      if (desc.hasTime) r.time_dimension = g.time;
      r[desc.valueMetricAlias] = v;
      out.push(r);
    }
  }
  return out;
};

/** Emit a row for every (grid bucket × observed dimension tuple), defaulting absent metrics to 0. */
const gapFill = (
  rows: Array<Record<string, unknown>>,
  fill: NonNullable<PostProcess["timeFill"]>,
): Array<Record<string, unknown>> => {
  const dims = fill.dimensionAliases;
  const tuples = new Map<string, unknown[]>();
  const byKey = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const tup = dims.map((a) => row[a]);
    tuples.set(JSON.stringify(tup), tup);
    const bMs = new Date(String(row.time_dimension)).getTime();
    byKey.set(JSON.stringify([bMs, ...tup]), row);
  }
  if (tuples.size === 0) tuples.set("[]", []);

  const grid = bucketGrid(
    fill.granularity,
    new Date(fill.fromTimestamp).getTime(),
    new Date(fill.toTimestamp).getTime(),
  );

  const out: Array<Record<string, unknown>> = [];
  for (const b of grid) {
    const iso = new Date(b).toISOString();
    for (const tup of tuples.values()) {
      const existing = byKey.get(JSON.stringify([b, ...tup]));
      if (existing) {
        out.push(existing);
        continue;
      }
      const r: Record<string, unknown> = { time_dimension: iso };
      dims.forEach((a, i) => (r[a] = tup[i]));
      for (const m of fill.metricAliases) r[m] = 0;
      out.push(r);
    }
  }
  return out;
};

export async function executeGreptimeQuery(
  projectId: string,
  query: QueryType,
): Promise<Array<Record<string, unknown>>> {
  const {
    query: sql,
    parameters,
    postProcess,
  } = new GreptimeQueryBuilder().build(query, projectId);

  const rows = await greptimeQuery<Record<string, unknown>>({
    query: sql,
    params: parameters,
    readOnly: true,
  });

  let result: Array<Record<string, unknown>>;
  if (postProcess.byType) {
    result = expandByType(rows, postProcess.byType);
  } else {
    result = rows.map((r) =>
      coerceRow(r, postProcess.metricColumns, postProcess.hasTimeDimension),
    );
  }

  if (postProcess.timeFill) {
    result = gapFill(result, postProcess.timeFill);
  }
  return result;
}
