import { Transform } from "stream";

export type TimedByteCounterStats = {
  sourceWaitMs: number;
  backpressureMs: number;
};

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

// Boundary byte counter for the Parquet path. sourceWaitMs is the total
// inter-chunk gap; backpressureMs isolates the S3-upload share of it via the
// push()/_read() gap (as TimedGzip does). chReadMs = sourceWaitMs -
// backpressureMs; uploadWaitMs = backpressureMs.
export class TimedByteCounter extends ByteCounter {
  private readonly stats: TimedByteCounterStats;
  // From construction so the first gap captures Parquet's time-to-first-byte.
  private lastChunkDoneAt: number = performance.now();
  private bpStart: number | null = null;
  constructor(stats: TimedByteCounterStats) {
    super();
    this.stats = stats;
  }
  private creditBackpressure() {
    if (this.bpStart !== null) {
      this.stats.backpressureMs += performance.now() - this.bpStart;
      this.bpStart = null;
    }
  }
  // _read = downstream drained; closes the open backpressure interval.
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
    // Explicit push so a false return opens a backpressure interval.
    if (!this.push(chunk) && this.bpStart === null) {
      this.bpStart = performance.now();
    }
    this.lastChunkDoneAt = performance.now();
    callback(null);
  }
  _flush(callback: (error?: Error | null) => void) {
    this.creditBackpressure();
    callback();
  }
}
