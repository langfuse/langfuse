import { Transform } from "stream";

// Subset of the export-pipeline source stats that TimedByteCounter writes into.
// sourceWaitMs accumulates the total inter-chunk gap; backpressureMs isolates
// the portion of that gap caused by the downstream (S3 upload) not draining.
export type TimedByteCounterStats = {
  sourceWaitMs: number;
  backpressureMs: number;
};

// Counts bytes flowing through without altering them.
export class ByteCounter extends Transform {
  bytes = 0;
  _transform(
    chunk: Buffer,
    _encoding: string,
    callback: (error: Error | null, data?: Buffer) => void,
  ) {
    this.bytes += chunk.length;
    callback(null, chunk);
  }
}

// ByteCounter for the Parquet path (piped binary stream, no per-row generator),
// sitting at the upload boundary. It tallies total inter-chunk gaps into
// `stats.sourceWaitMs` and, separately, the downstream S3 backpressure into
// `stats.backpressureMs` via the same push()/_read() gap that TimedGzip uses.
// sourceWaitMs alone conflates CH delivery with S3 backpressure; subtracting
// backpressureMs recovers the pure ClickHouse-read wait (chReadMs), and
// backpressureMs itself is the upload wait (uploadWaitMs) — the gzip path's
// derivation, reconstructed without a gzip stage.
export class TimedByteCounter extends ByteCounter {
  private readonly stats: TimedByteCounterStats;
  // Clock starts at construction (like countedStream, before its loop) so the
  // first gap captures time-to-first-byte — the dominant CH wait, since Parquet
  // composes a row group before any bytes. Guarding it would drop TTFB from chReadMs.
  private lastChunkDoneAt: number = performance.now();
  // Start of the current downstream-backpressure interval (push() returned
  // false), or null when not backpressured. Mirrors TimedGzip.bpStart.
  private bpStart: number | null = null;
  constructor(stats: TimedByteCounterStats) {
    super();
    this.stats = stats;
  }
  // Close out a backpressure interval once the downstream consumer pulls again.
  private creditBackpressure() {
    if (this.bpStart !== null) {
      this.stats.backpressureMs += performance.now() - this.bpStart;
      this.bpStart = null;
    }
  }
  // _read fires when the downstream (S3 uploader) wants more data, i.e. it has
  // drained. The gap since push() last stalled is S3 upload backpressure.
  _read(size: number) {
    this.creditBackpressure();
    super._read(size);
  }
  _transform(
    chunk: Buffer,
    _encoding: string,
    callback: (error: Error | null, data?: Buffer) => void,
  ) {
    this.stats.sourceWaitMs += performance.now() - this.lastChunkDoneAt;
    this.bytes += chunk.length;
    // Push explicitly (not via callback(null, chunk)) so a false return — the
    // readable buffer is full and the uploader hasn't drained it — opens a
    // backpressure interval, credited on the next _read.
    if (!this.push(chunk) && this.bpStart === null) {
      this.bpStart = performance.now();
    }
    this.lastChunkDoneAt = performance.now();
    callback(null);
  }
  // Credit a trailing backpressure interval that never saw a final _read.
  _flush(callback: (error?: Error | null) => void) {
    this.creditBackpressure();
    callback();
  }
}
