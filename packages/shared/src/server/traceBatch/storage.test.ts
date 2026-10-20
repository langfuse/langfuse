import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StorageService } from "../services/StorageService";
import type { Transcript } from "../transcript/types";
import storedV1 from "./fixtures/inputs-v1.json";
import { getTraceBatchInputs, putTraceBatchInputs } from "./storage";

const storage = vi.hoisted(() => ({
  uploadFile: vi.fn<StorageService["uploadFile"]>(),
  download: vi.fn<StorageService["download"]>(),
}));
vi.mock("../s3", () => ({ createEventUploadStorageService: () => storage }));
vi.mock("../../env", () => ({
  env: {
    LANGFUSE_S3_EVENT_UPLOAD_BUCKET: "events",
    LANGFUSE_S3_EVENT_UPLOAD_PREFIX: "test/",
    LANGFUSE_S3_EVENT_KEY_MAX_SEGMENT_BYTES: 200,
  },
}));

const reference = {
  projectId: "project",
  traceId: "trace",
  revision: "revision",
};

beforeEach(() => {
  storage.uploadFile.mockReset().mockResolvedValue(undefined);
  storage.download.mockReset().mockResolvedValue(JSON.stringify(storedV1));
});

describe("trace batch input storage", () => {
  it("reads the saved v1 format and writes it at the deterministic revision key", async () => {
    const value = transcript();
    const key = "test/trace-batch/trace/ecb/project/trace/revision.json";
    expect(await getTraceBatchInputs(reference)).toEqual(value);
    expect(storage.download).toHaveBeenCalledWith(key);

    await putTraceBatchInputs(reference, value);
    const upload = storage.uploadFile.mock.calls[0][0];
    expect(upload).toMatchObject({
      fileName: key,
      fileType: "application/json",
    });
    expect(upload.data).toBeInstanceOf(Readable);
    let json = "";
    for await (const chunk of upload.data) json += chunk;
    expect(JSON.parse(json)).toEqual(storedV1);
  });

  it("reads an explicitly stored null transcript", async () => {
    storage.download.mockResolvedValueOnce(
      '{"schemaVersion":1,"transcript":null}',
    );
    expect(await getTraceBatchInputs(reference)).toBeNull();
  });

  it.each([1_000_000, 1_000_001])(
    "applies the limit to the complete envelope of length %i",
    async (size) => {
      const value = transcript("");
      const overhead = JSON.stringify({
        schemaVersion: 1,
        transcript: value,
      }).length;
      value.threads[0].currentTurn.messages[0].parts = [
        { type: "text", text: "x".repeat(size - overhead) },
      ];
      expect(await putTraceBatchInputs(reference, value)).toEqual({
        outcome: size > 1_000_000 ? "too_large" : "stored",
        jsonLength: size,
      });
      expect(storage.uploadFile).toHaveBeenCalledTimes(
        size > 1_000_000 ? 0 : 1,
      );
    },
  );

  it("propagates upload and download failures", async () => {
    storage.download.mockRejectedValueOnce(new Error("NoSuchKey"));
    await expect(getTraceBatchInputs(reference)).rejects.toThrow("NoSuchKey");
    storage.uploadFile.mockRejectedValueOnce(new Error("SlowDown"));
    await expect(putTraceBatchInputs(reference, null)).rejects.toThrow(
      "SlowDown",
    );
  });

  it.each([
    ["invalid JSON", "{"],
    ["unsupported version", '{"schemaVersion":2,"transcript":null}'],
    [
      "invalid transcript",
      '{"schemaVersion":1,"transcript":{"threads":"bad"}}',
    ],
  ])("rejects %s", async (_label, json) => {
    storage.download.mockResolvedValueOnce(json);
    await expect(getTraceBatchInputs(reference)).rejects.toThrow();
  });
});

function transcript(text = "Hello 🌍"): Transcript {
  return {
    threads: [
      {
        conversationHistory: [],
        currentTurn: {
          nestingLevel: 0,
          observations: [{ id: "span", traceId: "trace" }],
          messages: [
            {
              role: "assistant",
              source: "output",
              parts: [{ type: "text", text }],
              observationId: "span",
              traceId: "trace",
              startTime: new Date("2026-10-20T10:00:00.123Z"),
              endTime: null,
            },
          ],
        },
      },
    ],
  };
}
