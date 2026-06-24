// Mid-stream exception detection for the `exec()`-based binary export path
// (LFE-10463 Parquet). `query().stream()` (used by queryClickhouseStream /
// queryClickhouseStreamRawText) parses each row and lets the @clickhouse/client
// ResultSet scan for the `x-clickhouse-exception-tag` end-of-stream marker, so a
// query that fails AFTER a 200 response errors the stream instead of silently
// truncating. `exec()` returns the raw HTTP body with NO such scanning — so for
// binary formats (Parquet) we replicate that detection here.
//
// ClickHouse >= 25.11 appends a fixed marker to the response body when a query
// fails mid-stream: `\r\n__exception__\r\n<tag>` … `<len> __exception__\r\n<tag>\r\n`,
// where <tag> is the value of the `x-clickhouse-exception-tag` response header.
// The 17-byte opening marker `\r\n__exception__\r\n` is what we scan for. Unlike
// the client's JSONEachRow detection (which triggers on any `\r\n` once the tag
// header is present — fine for newline-delimited text, ambiguous for binary), we
// match the full literal marker, which is astronomically unlikely to occur
// inside Parquet bytes by chance. Once found, everything from the marker to the
// end of the stream is the error trailer (not file data); we accumulate it and
// hand it to the client's own `extractErrorAtTheEndOfChunk` to parse the message.
//
// CAVEAT (mirrors rawPassthrough): on ClickHouse < 25.11 the tag header is
// absent, so detection is disabled and a mid-stream failure is NOT caught — the
// only caller is an experimental per-project opt-in gated on that version.

import { Transform } from "stream";
import { extractErrorAtTheEndOfChunk } from "@clickhouse/client-common";

// `\r\n__exception__\r\n` — the opening of the end-of-stream error trailer.
export const EXCEPTION_TRAILER_MARKER = Buffer.from("\r\n__exception__\r\n");

export interface ClickhouseExecExceptionTagTransformOptions {
  // Value of the `x-clickhouse-exception-tag` response header. Undefined on
  // ClickHouse < 25.11 (or when absent) → detection disabled, bytes pass through.
  exceptionTag: string | undefined;
  // Lets the caller (clickhouse.ts) classify the extracted error, e.g. wrap a
  // "memory limit exceeded" into a ClickHouseResourceError. Defaults to identity
  // so this module stays free of server-only imports and is unit-testable.
  wrapError?: (error: Error) => Error;
}

/**
 * Passes ClickHouse `exec()` bytes through untouched until it detects the
 * end-of-stream exception trailer, at which point it errors the stream with the
 * parsed ClickHouse error (aborting any downstream upload before commit).
 *
 * Holds back the last (markerLength - 1) bytes between chunks so a marker split
 * across a chunk boundary is still detected; those bytes are emitted on flush
 * when no error is present, so clean data is never dropped. Memory stays bounded
 * (a ~16-byte carry; the error trailer is small and only buffered after a marker
 * is seen) — the full stream is never buffered.
 */
export class ClickhouseExecExceptionTagTransform extends Transform {
  private readonly exceptionTag: string | undefined;
  private readonly wrapError: (error: Error) => Error;
  // Tail of the previous chunk withheld to catch a marker spanning the boundary.
  private carry: Buffer = Buffer.alloc(0);
  // Once non-null we are past the marker: swallow downstream output and
  // accumulate the trailer for the final extractErrorAtTheEndOfChunk call.
  private errorBuf: Buffer | null = null;

  constructor(options: ClickhouseExecExceptionTagTransformOptions) {
    super();
    this.exceptionTag = options.exceptionTag;
    this.wrapError = options.wrapError ?? ((error) => error);
  }

  _transform(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null, data?: Buffer) => void,
  ): void {
    // Detection disabled (CH < 25.11): pure passthrough, no buffering.
    if (this.exceptionTag === undefined) {
      callback(null, chunk);
      return;
    }

    // Already in the trailer: keep accumulating, emit nothing downstream.
    if (this.errorBuf !== null) {
      this.errorBuf = Buffer.concat([this.errorBuf, chunk]);
      callback();
      return;
    }

    const buf =
      this.carry.length > 0 ? Buffer.concat([this.carry, chunk]) : chunk;
    const markerIdx = buf.indexOf(EXCEPTION_TRAILER_MARKER);

    if (markerIdx !== -1) {
      // Emit clean file bytes before the marker; everything from the marker on
      // is the error trailer.
      if (markerIdx > 0) this.push(buf.subarray(0, markerIdx));
      this.errorBuf = Buffer.from(buf.subarray(markerIdx));
      callback();
      return;
    }

    // No marker yet: emit all but the last (markerLength - 1) bytes, retaining
    // those in case the marker straddles this and the next chunk.
    const keep = EXCEPTION_TRAILER_MARKER.length - 1;
    if (buf.length > keep) {
      this.push(buf.subarray(0, buf.length - keep));
      this.carry = Buffer.from(buf.subarray(buf.length - keep));
    } else {
      this.carry = Buffer.from(buf);
    }
    callback();
  }

  _flush(callback: (error?: Error | null, data?: Buffer) => void): void {
    if (this.errorBuf !== null) {
      // exceptionTag is defined here (errorBuf is only set when it is).
      const parsed = extractErrorAtTheEndOfChunk(
        this.errorBuf,
        this.exceptionTag as string,
      );
      callback(this.wrapError(parsed));
      return;
    }
    // No error: flush the withheld tail so clean data is complete.
    if (this.carry.length > 0) this.push(this.carry);
    callback();
  }
}
