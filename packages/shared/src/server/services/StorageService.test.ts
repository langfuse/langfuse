import { Readable } from "stream";

import { describe, expect, it } from "vitest";

import { StorageServiceFactory } from "./StorageService";

/**
 * Regression tests for the Azure Blob download path.
 *
 * `AzureBlobStorageService.streamToString` used to decode each download
 * stream chunk individually with `data.toString()` and concatenate the
 * resulting strings. Node.js stream chunk boundaries can fall in the middle
 * of a multibyte UTF-8 sequence, so any character straddling a boundary was
 * split and decoded as invalid bytes, producing U+FFFD. The fix aggregates
 * the raw Buffers and decodes once at the end.
 */
describe("AzureBlobStorageService.streamToString", () => {
  // streamToString is private; reach it through the Azure instance for a
  // focused unit test without standing up a real Azure backend (the
  // constructor does not perform any network calls).
  const getStreamToString = () => {
    const service = StorageServiceFactory.getInstance({
      accessKeyId: "test-account",
      secretAccessKey: Buffer.from("test-secret-key").toString("base64"),
      bucketName: "test-container",
      endpoint: "https://test.blob.core.windows.net",
      region: undefined,
      forcePathStyle: false,
      useAzureBlob: true,
      awsSse: undefined,
      awsSseKmsKeyId: undefined,
    });

    return (chunks: Buffer[]): Promise<string> =>
      (
        service as unknown as {
          streamToString(stream: NodeJS.ReadableStream): Promise<string>;
        }
      ).streamToString(streamFromChunks(chunks));
  };

  // Emits each provided buffer as its own discrete "data" chunk, so we can
  // reproduce exact chunk boundaries.
  const streamFromChunks = (chunks: Buffer[]): Readable => {
    let index = 0;
    return new Readable({
      read() {
        if (index < chunks.length) {
          this.push(chunks[index++]);
        } else {
          this.push(null);
        }
      },
    });
  };

  const splitBufferAt = (buffer: Buffer, offset: number): Buffer[] => [
    buffer.subarray(0, offset),
    buffer.subarray(offset),
  ];

  it("reassembles a 3-byte character split across a chunk boundary", async () => {
    const streamToString = getStreamToString();
    const text = "について の ご相談"; // の = E3 81 AE
    const buffer = Buffer.from(text, "utf-8");
    const splitOffset = buffer.indexOf(Buffer.from("の", "utf-8")) + 1; // inside の

    const result = await streamToString(splitBufferAt(buffer, splitOffset));

    expect(result).toBe(text);
    expect(result).not.toContain("�");
  });

  it("handles a boundary at every byte (worst case)", async () => {
    const streamToString = getStreamToString();
    const text = "支払いは退院後になります。🙂 café";
    const buffer = Buffer.from(text, "utf-8");
    const oneBytePerChunk = Array.from(buffer, (byte) => Buffer.from([byte]));

    const result = await streamToString(oneBytePerChunk);

    expect(result).toBe(text);
  });

  it("leaves ASCII-only content unchanged", async () => {
    const streamToString = getStreamToString();
    const text = "plain ascii payload";
    const buffer = Buffer.from(text, "utf-8");

    const result = await streamToString(splitBufferAt(buffer, 4));

    expect(result).toBe(text);
  });

  it("returns an empty string for an empty stream", async () => {
    const streamToString = getStreamToString();

    const result = await streamToString([]);

    expect(result).toBe("");
  });
});
