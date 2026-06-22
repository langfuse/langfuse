import { Transform } from "stream";
import { createGzip, type Gzip } from "zlib";

export type GzipStats = {
  level: number;
  // Wall-clock time from handing a chunk to zlib until the write callback fires.
  // Includes both compression CPU and downstream backpressure pauses.
  activeMs: number;
  // Subset of activeMs spent waiting for the downstream consumer (S3 upload) to
  // drain. Measured as the gap between push() returning false (gzip.pause()) and
  // the next _read() call (gzip.resume()). Pure gzip CPU ≈ activeMs - backpressureMs.
  backpressureMs: number;
};

// zlib resolves Z_DEFAULT_COMPRESSION (-1) to compression level 6. Surfaced
// explicitly so the gauge reports the real level even when none is configured.
export const ZLIB_DEFAULT_LEVEL = 6;

/**
 * Streaming gzip wrapper that attributes compression cost to the gzip step
 * alone (LFE-10402). It owns a zlib gzip instance, times each chunk's
 * write→consumed latency into `stats.activeMs`, and forwards the compressed
 * output while honouring backpressure (pauses the inner stream when the
 * readable side fills, resumes on the next `_read`). Errors from the inner gzip
 * surface through the wrapper so `pipeline` aborts the upload as before.
 */
export class TimedGzip extends Transform {
  private readonly gzip: Gzip;
  private bpStart: number | null = null;

  constructor(
    level: number | undefined,
    private readonly stats: GzipStats,
  ) {
    super();
    this.gzip = level === undefined ? createGzip() : createGzip({ level });
    this.gzip.on("data", (chunk: Buffer) => {
      if (!this.push(chunk)) {
        this.gzip.pause();
        if (this.bpStart === null) this.bpStart = performance.now();
      }
    });
    this.gzip.on("error", (err: Error) => this.destroy(err));
  }

  private creditBackpressure() {
    if (this.bpStart !== null) {
      this.stats.backpressureMs += performance.now() - this.bpStart;
      this.bpStart = null;
    }
  }

  _read() {
    this.creditBackpressure();
    this.gzip.resume();
  }

  _transform(
    chunk: Buffer,
    _encoding: string,
    callback: (error?: Error | null) => void,
  ) {
    const startedAt = performance.now();
    this.gzip.write(chunk, (err) => {
      this.stats.activeMs += performance.now() - startedAt;
      callback(err);
    });
  }

  _flush(callback: (error?: Error | null) => void) {
    const startedAt = performance.now();
    // Complete the flush only once the inner gzip has emitted every byte (its
    // readable `end`), so the final block + gzip trailer are pushed downstream
    // before this Transform ends its own readable side. Resolving on `end`
    // alone — rather than the `end()` write-callback — avoids truncating the
    // last chunk when output trails the writable `finish`.
    this.gzip.once("end", () => {
      this.stats.activeMs += performance.now() - startedAt;
      callback();
    });
    this.gzip.end();
    // Credit any outstanding backpressure before resuming, so the interval
    // between the last pause and this resume is not lost or mis-attributed.
    this.creditBackpressure();
    this.gzip.resume();
  }

  _destroy(error: Error | null, callback: (error: Error | null) => void) {
    this.gzip.destroy(error ?? undefined);
    callback(error);
  }
}
