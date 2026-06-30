import { describe, it, expect } from "vitest";
import { pipeline, Readable, Writable } from "stream";
import { promisify } from "util";
import {
  ByteCounter,
  TimedByteCounter,
  type TimedByteCounterStats,
} from "./byteCounters";

const pipelineAsync = promisify(pipeline);

const collect = (chunks: Buffer[], perChunkDelayMs = 0): Writable =>
  new Writable({
    // highWaterMark 1 keeps the readable buffer shallow so a slow sink reliably
    // backpressures the counter (push() returns false), exercising the timer.
    highWaterMark: 1,
    write(chunk: Buffer, _enc, cb) {
      chunks.push(Buffer.from(chunk));
      if (perChunkDelayMs > 0) setTimeout(cb, perChunkDelayMs);
      else cb();
    },
  });

// Emits `count` chunks `gapMs` apart, simulating ClickHouse delivering row
// groups with a wait between each.
function spacedSource(
  count: number,
  gapMs: number,
  bytesPerChunk = 64 * 1024,
): Readable {
  async function* gen() {
    for (let i = 0; i < count; i++) {
      if (gapMs > 0) await new Promise((r) => setTimeout(r, gapMs));
      yield Buffer.alloc(bytesPerChunk, i % 256);
    }
  }
  return Readable.from(gen());
}

describe("ByteCounter", () => {
  it("forwards bytes unchanged and tallies the total", async () => {
    const input = [Buffer.from("hello "), Buffer.from("world")];
    const out: Buffer[] = [];
    const counter = new ByteCounter();
    await pipelineAsync(Readable.from(input), counter, collect(out));
    expect(Buffer.concat(out).toString()).toBe("hello world");
    expect(counter.bytes).toBe(11);
  });
});

describe("TimedByteCounter", () => {
  it("forwards every byte unchanged", async () => {
    const chunks = Array.from({ length: 20 }, (_, i) =>
      Buffer.from(`row-${i};`),
    );
    const expected = Buffer.concat(chunks);
    const stats: TimedByteCounterStats = { sourceWaitMs: 0, backpressureMs: 0 };
    const out: Buffer[] = [];
    const counter = new TimedByteCounter(stats);
    await pipelineAsync(Readable.from(chunks), counter, collect(out));
    expect(Buffer.concat(out).equals(expected)).toBe(true);
    expect(counter.bytes).toBe(expected.length);
  });

  it("attributes wait to ClickHouse when the source is the bottleneck", async () => {
    // Slow source (30ms between chunks), instant sink: the gap is pure CH read.
    const stats: TimedByteCounterStats = { sourceWaitMs: 0, backpressureMs: 0 };
    const counter = new TimedByteCounter(stats);
    await pipelineAsync(spacedSource(6, 30), counter, collect([]));

    const chReadMs = stats.sourceWaitMs - stats.backpressureMs;
    // ~6 * 30ms of source wait, almost none of it backpressure.
    expect(stats.sourceWaitMs).toBeGreaterThan(100);
    expect(stats.backpressureMs).toBeLessThan(stats.sourceWaitMs / 2);
    expect(chReadMs).toBeGreaterThan(50);
  });

  it("attributes wait to upload backpressure when the sink is the bottleneck", async () => {
    // Instant source, slow sink (40ms/chunk): the wait is S3 backpressure, and
    // chReadMs (sourceWaitMs - backpressureMs) must not absorb it.
    const stats: TimedByteCounterStats = { sourceWaitMs: 0, backpressureMs: 0 };
    const counter = new TimedByteCounter(stats);
    await pipelineAsync(spacedSource(6, 0), counter, collect([], 40));

    const chReadMs = Math.max(0, stats.sourceWaitMs - stats.backpressureMs);
    expect(stats.backpressureMs).toBeGreaterThan(100);
    // The dominant wait is upload, not ClickHouse — the bug this guards against
    // (uploadWaitMs collapsing to ~0) would instead show all time as chRead.
    expect(stats.backpressureMs).toBeGreaterThan(chReadMs);
  });

  it("propagates upstream errors so the pipeline aborts", async () => {
    const boom = new Error("upstream failed");
    const source = new Readable({
      read() {
        this.destroy(boom);
      },
    });
    const stats: TimedByteCounterStats = { sourceWaitMs: 0, backpressureMs: 0 };
    await expect(
      pipelineAsync(source, new TimedByteCounter(stats), collect([])),
    ).rejects.toThrow("upstream failed");
  });
});
