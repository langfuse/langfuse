// Replicates @clickhouse/client's mid-stream exception detection for the
// `exec()` binary export path (LFE-10463 Parquet): exec() returns the raw body
// with no scan, so a query failing after a 200 would truncate silently. On CH
// >= 25.11 a failure appends `\r\n__exception__\r\n<tag>` … to the body. We scan
// for marker+tag (not the bare marker): the literal prefix can occur in a
// successful Parquet footer's uncompressed min/max stats (raw user strings), so
// scanning the prefix alone lets an adversarial trace value false-positive every
// export of a window — a per-window DoS. The per-query tag is unguessable.
// Caveat (like rawPassthrough): pre-25.11 the tag header is absent → detection off.

import { Transform } from "stream";
import { extractErrorAtTheEndOfChunk } from "@clickhouse/client-common";

// Literal prefix of the error trailer; the per-query tag is appended at runtime.
export const EXCEPTION_TRAILER_MARKER = Buffer.from("\r\n__exception__\r\n");

export interface ClickhouseExecExceptionTagTransformOptions {
  // `x-clickhouse-exception-tag` response header; undefined pre-25.11 → detection off.
  exceptionTag: string | undefined;
  // Lets the caller classify the error (e.g. ClickHouseResourceError). Identity
  // by default, keeping this module free of server-only imports and unit-testable.
  wrapError?: (error: Error) => Error;
}

/**
 * Passes `exec()` bytes through until the exception trailer appears, then errors
 * the stream (aborting any downstream upload before commit). Withholds the last
 * (scanMarker length - 1) bytes between chunks to catch a marker split across a
 * boundary, flushing them on clean end. Memory is bounded — the stream is never
 * fully buffered.
 */
export class ClickhouseExecExceptionTagTransform extends Transform {
  private readonly exceptionTag: string | undefined;
  private readonly wrapError: (error: Error) => Error;
  // Full opening sequence we scan for: `\r\n__exception__\r\n` + the per-query tag.
  private readonly scanMarker: Buffer;
  // Bytes withheld between chunks so a scanMarker straddling a boundary is caught.
  private readonly markerStraddleBytes: number;
  // Tail of the previous chunk withheld to catch a marker spanning the boundary.
  private pendingTail: Buffer = Buffer.alloc(0);
  // Non-null once past the marker: downstream output stops and the trailer
  // accumulates here for the final extractErrorAtTheEndOfChunk call.
  private trailerBuffer: Buffer | null = null;

  constructor(options: ClickhouseExecExceptionTagTransformOptions) {
    super();
    this.exceptionTag = options.exceptionTag;
    this.wrapError = options.wrapError ?? ((error) => error);
    this.scanMarker =
      options.exceptionTag !== undefined
        ? Buffer.concat([
            EXCEPTION_TRAILER_MARKER,
            Buffer.from(options.exceptionTag, "utf-8"),
          ])
        : EXCEPTION_TRAILER_MARKER;
    this.markerStraddleBytes = this.scanMarker.length - 1;
  }

  _transform(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null, data?: Buffer) => void,
  ): void {
    // Detection off (pre-25.11): pure passthrough.
    if (this.exceptionTag === undefined) {
      callback(null, chunk);
      return;
    }

    // Past the marker: accumulate the trailer, emit nothing.
    if (this.trailerBuffer !== null) {
      this.trailerBuffer = Buffer.concat([this.trailerBuffer, chunk]);
      callback();
      return;
    }

    const buf =
      this.pendingTail.length > 0
        ? Buffer.concat([this.pendingTail, chunk])
        : chunk;
    const trailerStart = buf.indexOf(this.scanMarker);

    if (trailerStart !== -1) {
      // Bytes before the marker are clean file data; the rest is the trailer.
      if (trailerStart > 0) this.push(buf.subarray(0, trailerStart));
      this.trailerBuffer = Buffer.from(buf.subarray(trailerStart));
      callback();
      return;
    }

    // No marker: emit everything but the tail that could start a split marker.
    const keepFrom = buf.length - this.markerStraddleBytes;
    if (keepFrom > 0) {
      this.push(buf.subarray(0, keepFrom));
      this.pendingTail = Buffer.from(buf.subarray(keepFrom));
    } else {
      this.pendingTail = Buffer.from(buf);
    }
    callback();
  }

  _flush(callback: (error?: Error | null, data?: Buffer) => void): void {
    if (this.trailerBuffer !== null) {
      // The marker was seen, so this is a real failure — never finish cleanly.
      // extractErrorAtTheEndOfChunk can fail to parse a truncated trailer; a
      // falsy return would collapse callback(error) into callback() and commit a
      // corrupt Parquet artifact, so fall back to a generic error.
      const parsed: Error | null | undefined = extractErrorAtTheEndOfChunk(
        this.trailerBuffer,
        this.exceptionTag as string,
      );
      const error =
        parsed ??
        new Error(
          "ClickHouse mid-stream failure: exception trailer detected but could not be parsed",
        );
      callback(this.wrapError(error));
      return;
    }
    // No error: flush the withheld tail so clean data is complete.
    if (this.pendingTail.length > 0) this.push(this.pendingTail);
    callback();
  }
}
