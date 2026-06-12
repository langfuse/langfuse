import {
  buildGreptimeRowsForRecord,
  getGreptimeIngestClient,
  greptimeQuery,
  GreptimeTable,
  PHYSICAL_TABLES,
  type DatasetRunItemRecordInsertType,
  type ObservationRecordInsertType,
  type ScoreRecordInsertType,
  type TraceRecordInsertType,
} from "../../../src/server";

/**
 * Seeder GreptimeDB write path.
 *
 * The seeder runs in the `@langfuse/shared` context, so it builds projection + EAV rows
 * with the same `buildGreptimeRowsForRecord` the worker writer uses and pushes them through
 * the shared gRPC ingest client. This is a direct projection write (immediate read-after-write
 * visibility) — it does NOT append `raw_events`, because a `*RecordInsertType` snapshot is not a
 * replayable `IngestionEventType` (see 04 plan). The merge-on-write projection means a re-run with
 * the same ids overwrites rather than duplicates.
 */

type EntityBatch = {
  traces?: TraceRecordInsertType[];
  observations?: ObservationRecordInsertType[];
  scores?: ScoreRecordInsertType[];
  datasetRunItems?: DatasetRunItemRecordInsertType[];
};

// Rows per gRPC write call. Bounds message size for the bulk scenarios.
const GREPTIME_WRITE_CHUNK = 2000;

export const writeRecordsToGreptime = async (
  batch: EntityBatch,
): Promise<void> => {
  const rowsByTable = new Map<string, Record<string, unknown>[]>();
  const collect = (
    table: GreptimeTable,
    records: ReadonlyArray<
      | TraceRecordInsertType
      | ObservationRecordInsertType
      | ScoreRecordInsertType
      | DatasetRunItemRecordInsertType
    >,
  ) => {
    for (const record of records) {
      for (const { table: physical, rows } of buildGreptimeRowsForRecord(
        table,
        record,
      )) {
        const acc = rowsByTable.get(physical);
        if (acc) acc.push(...rows);
        else rowsByTable.set(physical, [...rows]);
      }
    }
  };

  if (batch.traces?.length) collect(GreptimeTable.Traces, batch.traces);
  if (batch.observations?.length)
    collect(GreptimeTable.Observations, batch.observations);
  if (batch.scores?.length) collect(GreptimeTable.Scores, batch.scores);
  if (batch.datasetRunItems?.length)
    collect(GreptimeTable.DatasetRunItems, batch.datasetRunItems);

  const client = getGreptimeIngestClient();
  for (const [physical, rows] of rowsByTable) {
    for (let i = 0; i < rows.length; i += GREPTIME_WRITE_CHUNK) {
      const slice = rows.slice(i, i + GREPTIME_WRITE_CHUNK);
      const t = PHYSICAL_TABLES[physical]();
      for (const row of slice) t.addRowObject(row);
      await client.write([t]);
    }
  }
};

/**
 * Cheap post-write readback against the merged GreptimeDB projection. `whereSql` uses `:named`
 * binds (mysql2 protocol); always filter `is_deleted = false`. Mirrors `verify.ts:countRows`
 * for ClickHouse.
 */
export const greptimeCountRows = async (
  table: string,
  whereSql: string,
  params: Record<string, unknown>,
  countExpr = "count(*)",
): Promise<number> => {
  const rows = await greptimeQuery<{ c: number | string }>({
    query: `SELECT ${countExpr} AS c FROM \`${table}\` WHERE ${whereSql}`,
    params,
    readOnly: true,
  });
  return Number(rows[0]?.c ?? 0);
};

/** Expand a string list into named binds for an IN clause (mysql2 does not splice arrays). */
export const greptimeInList = (
  values: string[],
  prefix: string,
  params: Record<string, unknown>,
): string => {
  if (values.length === 0) return "NULL";
  return values
    .map((value, i) => {
      const name = `${prefix}${i}`;
      params[name] = value;
      return `:${name}`;
    })
    .join(", ");
};
