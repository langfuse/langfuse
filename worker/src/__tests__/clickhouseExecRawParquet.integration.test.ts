import { describe, it, expect } from "vitest";
import {
  queryClickhouseExecRaw,
  BLOB_EXPORT_PARQUET_CLICKHOUSE_SETTINGS,
} from "@langfuse/shared/src/server";

// Integration tests for the FORMAT Parquet exec path against a live ClickHouse.
// Lives in worker (not shared) because the shared test job runs without a
// ClickHouse service — these need a real server. Validates valid Parquet bytes
// on success and a hard error (not a silent/truncated success) on failure.
// Mid-stream exception-tag parsing is unit-tested separately in shared
// (clickhouseExecExceptionTag.test.ts) and does not depend on CH version here.

const PARQUET_MAGIC = Buffer.from("PAR1");

async function collect(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

describe("queryClickhouseExecRaw — FORMAT Parquet", () => {
  it("streams valid Parquet bytes (PAR1 magic at both ends)", async () => {
    const { stream } = await queryClickhouseExecRaw({
      query: "SELECT number AS n FROM numbers(1000)",
      format: "Parquet",
      clickhouseSettings: BLOB_EXPORT_PARQUET_CLICKHOUSE_SETTINGS,
    });

    const buffer = await collect(stream);

    expect(buffer.length).toBeGreaterThan(8);
    expect(buffer.subarray(0, 4).equals(PARQUET_MAGIC)).toBe(true);
    expect(buffer.subarray(buffer.length - 4).equals(PARQUET_MAGIC)).toBe(true);
  });

  it("surfaces a failing query as an error instead of a silent/truncated success", async () => {
    // A query that throwIf-fails must never yield a clean stream. The error
    // surfaces either as a pre-200 exec() rejection or, once 200 has been sent,
    // via the end-of-stream exception-tag trailer the Transform scans for (CH
    // >= 25.11). Both are acceptable — the invariant is that the failure is
    // never swallowed. (Trailer parsing is unit-tested with synthetic chunks in
    // shared's clickhouseExecExceptionTag.test.ts.)
    const run = async () => {
      const { stream } = await queryClickhouseExecRaw({
        query:
          "SELECT throwIf(number = 5000, 'mid-stream boom') AS n FROM numbers(100000)",
        format: "Parquet",
        clickhouseSettings: {
          ...BLOB_EXPORT_PARQUET_CLICKHOUSE_SETTINGS,
          output_format_parquet_row_group_size: "256",
        },
      });
      return collect(stream);
    };

    await expect(run()).rejects.toThrow(/boom/);
  });
});
