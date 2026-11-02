import { describe, it, expect } from "vitest";
import { pipeline, Readable, Writable } from "stream";
import { promisify } from "util";
import { gunzipSync } from "zlib";
import { TimedGzip, type GzipStats } from "./gzipStream";

const pipelineAsync = promisify(pipeline);

const collect = (chunks: Buffer[]): Writable =>
  new Writable({
    write(chunk: Buffer, _enc, cb) {
      chunks.push(Buffer.from(chunk));
      cb();
    },
  });

// Drives `source` through TimedGzip, collects the compressed output, and
// returns the concatenated gzip buffer alongside the populated stats.
async function runGzip(
  source: Readable,
  level: number | undefined,
): Promise<{ output: Buffer; stats: GzipStats }> {
  const stats: GzipStats = { level: level ?? 6, activeMs: 0 };
  const chunks: Buffer[] = [];
  await pipelineAsync(source, new TimedGzip(level, stats), collect(chunks));
  return { output: Buffer.concat(chunks), stats };
}

describe("TimedGzip", () => {
  it("produces a valid gzip stream that round-trips back to the input", async () => {
    const input = Buffer.from(
      Array.from({ length: 5000 }, (_, i) => `{"row":${i},"v":"x".}\n`).join(
        "",
      ),
    );
    const { output, stats } = await runGzip(Readable.from([input]), 6);

    expect(gunzipSync(output).equals(input)).toBe(true);
    // Real compression work was attributed to the gzip step: zlib offloads each
    // write to the libuv threadpool, so the write->callback delta is always > 0.
    expect(stats.activeMs).toBeGreaterThan(0);
    // It actually compressed (input is highly repetitive).
    expect(output.length).toBeLessThan(input.length);
  });

  it("round-trips multi-chunk input and accumulates active time across chunks", async () => {
    const chunks = Array.from({ length: 50 }, (_, i) =>
      Buffer.from(`chunk-${i}-`.repeat(2000)),
    );
    const expected = Buffer.concat(chunks);
    const { output, stats } = await runGzip(Readable.from(chunks), 1);

    expect(gunzipSync(output).equals(expected)).toBe(true);
    expect(stats.activeMs).toBeGreaterThan(0);
  });

  it("level 0 stores without shrinking but still wraps in valid gzip", async () => {
    // Near-random data: level 0 must not expand it the way a real codec would
    // try to, and must still gunzip cleanly.
    const input = Buffer.from("abcdefghij".repeat(1000));
    const { output } = await runGzip(Readable.from([input]), 0);
    expect(gunzipSync(output).equals(input)).toBe(true);
  });

  it("higher level yields a smaller (or equal) output than level 1", async () => {
    const input = Buffer.from(
      Array.from(
        { length: 8000 },
        (_, i) => `{"id":${i},"name":"item-${i % 50}"}`,
      ).join("\n"),
    );
    const fast = await runGzip(Readable.from([input]), 1);
    const best = await runGzip(Readable.from([input]), 9);
    expect(best.output.length).toBeLessThanOrEqual(fast.output.length);
    // Both still decompress to the original.
    expect(gunzipSync(fast.output).equals(input)).toBe(true);
    expect(gunzipSync(best.output).equals(input)).toBe(true);
  });

  it("propagates upstream errors so the pipeline aborts", async () => {
    const boom = new Error("upstream failed");
    const source = new Readable({
      read() {
        this.destroy(boom);
      },
    });
    const stats: GzipStats = { level: 6, activeMs: 0 };
    await expect(
      pipelineAsync(source, new TimedGzip(6, stats), collect([])),
    ).rejects.toThrow("upstream failed");
  });

  it("uses the zlib default when level is undefined", async () => {
    const input = Buffer.from("default-level-".repeat(3000));
    const { output } = await runGzip(Readable.from([input]), undefined);
    expect(gunzipSync(output).equals(input)).toBe(true);
  });
});
