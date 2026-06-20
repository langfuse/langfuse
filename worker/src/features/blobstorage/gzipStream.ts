import { Transform } from "stream";
import { createGzip, type Gzip } from "zlib";

export type GzipStats = {
  // zlib level actually used (the resolved tuning level, or the zlib default
  // when none was configured). Recorded so a measurement can be tied to a level.
  level: number;
  // Active compression time, summed per input chunk as the latency from handing
  // the chunk to zlib until zlib reports it consumed (zlib offloads to the libuv
  // threadpool). This isolates compression work from the idle gaps spent waiting
  // on the next ClickHouse row; under sustained downstream backpressure it also
  // absorbs upload-wait, which is itself a useful "gzip is not the bottleneck"
  // signal. Use together with input/output bytes to derive throughput + ratio.
  activeMs: number;
};

// zlib's default compression level (Z_DEFAULT_COMPRESSION === 6). Surfaced
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

  constructor(
    level: number | undefined,
    private readonly stats: GzipStats,
  ) {
    super();
    this.gzip = level === undefined ? createGzip() : createGzip({ level });
    this.gzip.on("data", (chunk: Buffer) => {
      if (!this.push(chunk)) this.gzip.pause();
    });
    this.gzip.on("error", (err: Error) => this.destroy(err));
  }

  _read() {
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
    // Ensure the readable side is flowing so the trailing `data`/`end` fire even
    // if downstream had paused us right before flush.
    this.gzip.resume();
  }

  _destroy(error: Error | null, callback: (error: Error | null) => void) {
    this.gzip.destroy(error ?? undefined);
    callback(error);
  }
}
