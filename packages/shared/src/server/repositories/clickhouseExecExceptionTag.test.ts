import { describe, expect, it } from "vitest";
import { Readable, pipeline } from "stream";
import { promisify } from "util";
import {
  ClickhouseExecExceptionTagTransform,
  EXCEPTION_TRAILER_MARKER,
} from "./clickhouseExecExceptionTag";

const pipelineAsync = promisify(pipeline);

// Build a valid ClickHouse >= 25.11 end-of-stream exception trailer for a given
// tag + single-line message, matching the layout that the client's
// extractErrorAtTheEndOfChunk parses:
//   `\r\n__exception__\r\n<tag>` <message> `\n<len> __exception__\r\n<tag>\r\n`
// where <len> is the byte length of `<message>\n`. The leading marker is what
// the Transform scans for; the trailing portion is what the parser reads.
function buildExceptionTrailer(tag: string, message: string): Buffer {
  const messageWithNewline = message + "\n";
  const len = Buffer.byteLength(messageWithNewline, "utf-8");
  return Buffer.concat([
    Buffer.from(`\r\n__exception__\r\n${tag}`, "utf-8"),
    Buffer.from(messageWithNewline, "utf-8"),
    Buffer.from(`${len} __exception__\r\n${tag}\r\n`, "utf-8"),
  ]);
}

async function collect(
  chunks: Buffer[],
  options: ConstructorParameters<typeof ClickhouseExecExceptionTagTransform>[0],
): Promise<Buffer> {
  const transform = new ClickhouseExecExceptionTagTransform(options);
  const out: Buffer[] = [];
  transform.on("data", (c: Buffer) => out.push(c));
  await pipelineAsync(Readable.from(chunks), transform);
  return Buffer.concat(out);
}

describe("ClickhouseExecExceptionTagTransform", () => {
  const TAG = "FOOBAR";

  it("passes clean binary data through unchanged when no marker is present", async () => {
    const data = Buffer.from([0x50, 0x41, 0x52, 0x31, 0x00, 0xff, 0x0d, 0x0a]); // includes a stray \r\n
    const result = await collect([data], { exceptionTag: TAG });
    expect(result.equals(data)).toBe(true);
  });

  it("passes data through unchanged when detection is disabled (no exception tag)", async () => {
    // A chunk that happens to contain the marker bytes must NOT be treated as an
    // error when the tag header is absent (CH < 25.11): pure passthrough.
    const data = Buffer.concat([
      Buffer.from("real-parquet-bytes"),
      EXCEPTION_TRAILER_MARKER,
      Buffer.from("more"),
    ]);
    const result = await collect([data], { exceptionTag: undefined });
    expect(result.equals(data)).toBe(true);
  });

  it("errors the stream with the parsed message when the trailer is present", async () => {
    const message = "Code: 241. DB::Exception: Memory limit exceeded";
    const chunk = Buffer.concat([
      Buffer.from("clean-data-before-error"),
      buildExceptionTrailer(TAG, message),
    ]);
    await expect(collect([chunk], { exceptionTag: TAG })).rejects.toThrow(
      /Memory limit exceeded/,
    );
  });

  it("does not emit the trailer bytes downstream, only the clean prefix", async () => {
    const prefix = Buffer.from("PAR1-clean-leading-bytes-PAR1");
    const chunk = Buffer.concat([
      prefix,
      buildExceptionTrailer(TAG, "Code: 159. DB::Exception: Timeout exceeded"),
    ]);

    const transform = new ClickhouseExecExceptionTagTransform({
      exceptionTag: TAG,
    });
    const out: Buffer[] = [];
    transform.on("data", (c: Buffer) => out.push(c));
    await expect(
      pipelineAsync(Readable.from([chunk]), transform),
    ).rejects.toThrow();
    // Whatever was emitted before the error must be a prefix of the clean data,
    // and must never include the marker.
    const emitted = Buffer.concat(out);
    expect(emitted.length).toBeLessThanOrEqual(prefix.length);
    expect(prefix.subarray(0, emitted.length).equals(emitted)).toBe(true);
    expect(emitted.indexOf(EXCEPTION_TRAILER_MARKER)).toBe(-1);
  });

  it("detects a marker split across chunk boundaries (1-byte chunks)", async () => {
    const full = Buffer.concat([
      Buffer.from("leading"),
      buildExceptionTrailer(TAG, "Code: 241. DB::Exception: boundary split"),
    ]);
    const singleBytes = Array.from(full).map((b) => Buffer.from([b]));
    await expect(collect(singleBytes, { exceptionTag: TAG })).rejects.toThrow(
      /boundary split/,
    );
  });

  it("preserves trailing data that resembles the marker prefix but is clean", async () => {
    // Stream ends with the first 16 bytes of the marker but never completes it —
    // must be flushed intact, not swallowed.
    const partialMarker = EXCEPTION_TRAILER_MARKER.subarray(
      0,
      EXCEPTION_TRAILER_MARKER.length - 1,
    );
    const data = Buffer.concat([Buffer.from("body"), partialMarker]);
    const result = await collect([data], { exceptionTag: TAG });
    expect(result.equals(data)).toBe(true);
  });

  it("applies wrapError to the emitted error", async () => {
    class WrappedError extends Error {}
    const chunk = buildExceptionTrailer(
      TAG,
      "Code: 241. DB::Exception: wrap me",
    );
    await expect(
      collect([chunk], {
        exceptionTag: TAG,
        wrapError: (e) => new WrappedError(e.message),
      }),
    ).rejects.toBeInstanceOf(WrappedError);
  });
});
