// Mid-stream exception detection for the `exec()` binary export path (LFE-10463
// Parquet). `query().stream()` lets @clickhouse/client scan for the
// `x-clickhouse-exception-tag` end-of-stream marker, so a query failing after a
// 200 errors the stream instead of truncating silently. `exec()` returns the raw
// body with no such scan, so we replicate it here.
//
// On ClickHouse >= 25.11 a failed query appends `\r\n__exception__\r\n<tag>` …
// `<len> __exception__\r\n<tag>\r\n` to the body, where <tag> is the per-query
// random value of the `x-clickhouse-exception-tag` header. We scan for the full
// `\r\n__exception__\r\n<tag>` opening — the tag MUST be included: the literal
// 17-byte prefix alone can appear in a *successful* Parquet body, because the
// footer's Thrift-encoded column min/max statistics are uncompressed and carry
// raw user strings (a value starting with `\r\n…` is the column lex-min). Without
// the tag, an adversarial trace value could plant the prefix, false-positive the
// scan, and deterministically fail every export of that window (a per-window
// DoS). The server-generated tag is unguessable, so including it makes the marker
// unforgeable. Once found, the trailer is handed to extractErrorAtTheEndOfChunk.
//
// CAVEAT (mirrors rawPassthrough): pre-25.11 the tag header is absent, detection
// is off, and a mid-stream failure is not caught — the only caller is an
// experimental per-project opt-in gated on that version.

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
 * Passes ClickHouse `exec()` bytes through until the end-of-stream exception
 * trailer appears, then errors the stream with the parsed ClickHouse error
 * (aborting any downstream upload before commit). Withholds the last
 * (scanMarker length - 1) bytes between chunks to catch a marker split across a
 * boundary, flushing them when no error is found so clean data is never dropped.
 * Memory stays bounded — only the small tail and (post-marker) the trailer are
 * buffered; the stream itself never is.
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
