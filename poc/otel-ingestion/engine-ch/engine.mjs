// Path A engine: ClickHouse executes the transform. Owns the full per-window
// commit protocol — TRUNCATE staging, INSERT SELECT FROM s3(), row count,
// MOVE PARTITION — so the harness stays a pure driver.
import { readFileSync } from "node:fs";

const sqlDir = new URL("./sql/", import.meta.url);

export async function setup(chRaw) {
  // bootstrap: database may not exist yet, so run DDL without ?database
  const ddl = readFileSync(new URL("00_tables.sql", sqlDir), "utf8");
  for (const stmt of ddl
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)) {
    await chRaw(stmt);
  }
}

export function createChEngine({ chq, s3FromCh }) {
  const transformTemplate = readFileSync(
    new URL(process.env.POC_TRANSFORM_SQL ?? "transform-v2.sql", sqlDir),
    "utf8",
  );

  // Concurrent MOVE PARTITION TO TABLE into one target can race server-side
  // (25.12: LOGICAL_ERROR "Temporary part tmp_move_from_... already added"),
  // so the commit step is single-writer. Moves are milliseconds; INSERTs —
  // the long pole — still overlap freely.
  let moveLock = Promise.resolve();
  function withMoveLock(fn) {
    const run = moveLock.then(fn);
    moveLock = run.catch(() => {});
    return run;
  }

  return async function processWindow(s3Prefix, windowId, slot) {
    const staging = `poc_chlb.events_poc_staging_${slot}`;
    const t0 = Date.now();

    await chq(`TRUNCATE TABLE ${staging}`);

    const tInsert0 = Date.now();
    const url = `${s3FromCh.base}/${s3Prefix}/*/${windowId}/*.json`;
    await chq(
      transformTemplate
        .replaceAll("{STAGING}", staging)
        .replaceAll("{URL}", url)
        .replaceAll("{S3_ACCESS_KEY}", s3FromCh.accessKey)
        .replaceAll("{S3_SECRET_KEY}", s3FromCh.secretKey),
    );
    const insertMs = Date.now() - tInsert0;

    const [{ rows }] = await chq(
      `SELECT toUInt64(count()) AS rows FROM ${staging}`,
      { json: true },
    );

    const partitions = await chq(
      `SELECT partition_id FROM system.parts
       WHERE database = 'poc_chlb' AND table = 'events_poc_staging_${slot}' AND active
       GROUP BY partition_id`,
      { json: true },
    );
    const tMove0 = Date.now();
    await withMoveLock(async () => {
      for (const { partition_id } of partitions) {
        await chq(
          `ALTER TABLE ${staging} MOVE PARTITION ID '${partition_id}' TO TABLE poc_chlb.events_poc`,
        );
      }
    });
    const moveMs = Date.now() - tMove0;

    return {
      windowId,
      rows: Number(rows),
      partitions: partitions.length,
      insertMs,
      moveMs,
      totalMs: Date.now() - t0,
    };
  };
}
