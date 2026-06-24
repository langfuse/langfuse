import { describe, it, expect } from "vitest";
import {
  queryClickhouseExecRaw,
  BLOB_EXPORT_PARQUET_CLICKHOUSE_SETTINGS,
} from "./clickhouse";

// Integration tests against a live ClickHouse (>= 25.11 for mid-stream exception
// detection). Validate the FORMAT Parquet exec path end to end: valid Parquet
// bytes on success, and a hard stream error (not a silent truncation) when the
// query fails after the 200 response.

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
      tags: { feature: "test", kind: "analytic" },
    });

    const buffer = await collect(stream);

    expect(buffer.length).toBeGreaterThan(8);
    expect(buffer.subarray(0, 4).equals(PARQUET_MAGIC)).toBe(true);
    expect(buffer.subarray(buffer.length - 4).equals(PARQUET_MAGIC)).toBe(true);
  });

  it("surfaces a failing query as an error instead of a silent/truncated success", async () => {
    // A query that throwIf-fails must never yield a clean stream. Depending on
    // how far ClickHouse gets before failing, the error surfaces either as a
    // pre-200 exec() rejection or, once 200 has been sent, via the end-of-stream
    // exception-tag trailer the Transform scans for. Both are acceptable — the
    // invariant under test is that the failure is never swallowed. (The trailer
    // parsing path itself is unit-tested with synthetic chunks in
    // clickhouseExecExceptionTag.test.ts.)
    const run = async () => {
      const { stream } = await queryClickhouseExecRaw({
        query:
          "SELECT throwIf(number = 5000, 'mid-stream boom') AS n FROM numbers(100000)",
        format: "Parquet",
        clickhouseSettings: {
          ...BLOB_EXPORT_PARQUET_CLICKHOUSE_SETTINGS,
          output_format_parquet_row_group_size: "256",
        },
        tags: { feature: "test", kind: "analytic" },
      });
      return collect(stream);
    };

    await expect(run()).rejects.toThrow(/boom/);
  });
});
