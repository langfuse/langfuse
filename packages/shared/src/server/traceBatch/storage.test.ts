import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StorageService } from "../services/StorageService";
import type { Transcript } from "../transcript/types";
import { getTraceBatchInputs, putTraceBatchInputs, __test } from "./storage";

const { getTraceBatchInputsKey } = __test;

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
const objects = new Map<string, string>();

function transcript(text = "Hello 🌍"): Transcript {
  return {
    threads: [
      {
        conversationHistory: [
          { role: "user", source: "input", parts: [{ type: "text", text }] },
        ],
        currentTurn: {
          nestingLevel: 0,
          observations: [{ id: "span", traceId: "trace" }],
          messages: [
            {
              id: "message",
              role: "assistant",
              source: "output",
              senderName: "agent",
              observationId: "span",
              traceId: "trace",
              startTime: new Date("2026-10-20T10:00:00.123Z"),
              endTime: null,
              finishReason: { type: "tool-calls", raw: "tool_use" },
              parts: [
                { type: "text", text: "answer", refusal: true },
                {
                  type: "reasoning",
                  content: { kind: "text", text: "reason", signature: "sig" },
                },
                {
                  type: "reasoning",
                  content: { kind: "encrypted", data: "opaque" },
                },
                {
                  type: "reasoning",
                  content: { kind: "redacted", data: "opaque" },
                },
                {
                  type: "reasoning",
                  content: { kind: "data", value: [1, null] },
                },
                {
                  type: "tool-call",
                  toolCallId: "call",
                  toolName: "search",
                  toolType: "function",
                  input: { query: "東京", flags: [true, null, 1] },
                  providerExecuted: false,
                  invalid: true,
                },
                {
                  type: "tool-result",
                  toolCallId: "call",
                  toolName: "search",
                  isError: false,
                  output: {
                    type: "content",
                    value: [
                      { type: "text", text: "result" },
                      {
                        type: "file",
                        content: {
                          kind: "url",
                          url: "https://example.com/image",
                        },
                      },
                      { type: "data", value: { nested: ["value"] } },
                      {
                        type: "reasoning",
                        content: { kind: "text", text: "nested" },
                      },
                      { type: "custom", kind: "citation", value: null },
                    ],
                  },
                },
                {
                  type: "tool-result",
                  toolCallId: null,
                  output: { type: "text", value: "done" },
                },
                {
                  type: "tool-result",
                  toolCallId: "call",
                  output: { type: "json", value: [1, true] },
                },
                {
                  type: "file",
                  filename: "image.png",
                  mediaType: "image/png",
                  reasoning: true,
                  content: { kind: "base64", data: "aGVsbG8=" },
                },
                { type: "file", content: { kind: "reference", id: "file" } },
                { type: "data", name: "data", value: false },
                {
                  type: "custom",
                  kind: "provider-data",
                  value: { value: 1 },
                  providerMetadata: {
                    citations: [{ text: "quote" }],
                    flag: true,
                  },
                },
              ],
            },
          ],
        },
      },
    ],
    truncated: true,
  };
}

beforeEach(() => {
  objects.clear();
  storage.uploadFile
    .mockReset()
    .mockImplementation(async ({ fileName, fileType, data }) => {
      expect(fileType).toBe("application/json");
      expect(data).toBeInstanceOf(Readable);
      let json = "";
      for await (const chunk of data) json += chunk;
      objects.set(fileName, json);
    });
  storage.download.mockReset().mockImplementation(async (key) => {
    const value = objects.get(key);
    if (value === undefined) throw new Error("NoSuchKey");
    return value;
  });
});

describe("trace batch input storage", () => {
  it("uses a stable hash before the project and escapes identifiers", () => {
    expect(getTraceBatchInputsKey(reference)).toBe(
      "test/transcripts/trace/ecb/project/trace/revision.json",
    );
    const unsafe = {
      projectId: "project/a",
      traceId: "trace/\\\u0000" + "🌍".repeat(200),
      revision: "r/1",
    };
    const key = getTraceBatchInputsKey(unsafe);
    expect(key).toBe(getTraceBatchInputsKey(unsafe));
    expect(key.split("/")).toHaveLength(7);
    for (const segment of key.split("/")) {
      expect(Buffer.byteLength(segment)).toBeLessThanOrEqual(200);
      expect(segment).not.toContain("\\");
      expect(segment).not.toContain("\u0000");
    }
    expect(getTraceBatchInputsKey({ ...unsafe, traceId: "trace_" })).not.toBe(
      key,
    );
    expect(
      getTraceBatchInputsKey({ ...reference, projectId: "other" }),
    ).not.toBe(getTraceBatchInputsKey(reference));
    expect(getTraceBatchInputsKey({ ...reference, revision: "next" })).toBe(
      getTraceBatchInputsKey(reference).replace("revision.json", "next.json"),
    );
  });

  it("round trips nested content and ISO dates, including null end times", async () => {
    const value = transcript();
    await putTraceBatchInputs(reference, value);
    expect(objects.get(getTraceBatchInputsKey(reference))).toBe(
      JSON.stringify({ schemaVersion: 1, transcript: value }),
    );
    expect(await getTraceBatchInputs(reference)).toEqual(value);

    value.threads[0].currentTurn.messages[0].endTime = new Date(
      "2026-10-20T10:01:00.000Z",
    );
    await putTraceBatchInputs(reference, value);
    expect(await getTraceBatchInputs(reference)).toEqual(value);
    expect(objects.size).toBe(1);
  });

  it("round trips an explicit null transcript", async () => {
    await putTraceBatchInputs(reference, null);
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
      value.threads[0].conversationHistory[0].parts = [
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

  it("propagates storage errors to the caller", async () => {
    await expect(getTraceBatchInputs(reference)).rejects.toThrow("NoSuchKey");
    storage.uploadFile.mockRejectedValueOnce(new Error("SlowDown"));
    await expect(putTraceBatchInputs(reference, null)).rejects.toThrow(
      "SlowDown",
    );
  });

  it.each([
    ["invalid JSON", "{"],
    ["missing transcript", JSON.stringify({ schemaVersion: 1 })],
    ["unknown version", JSON.stringify({ schemaVersion: 2, transcript: null })],
    [
      "malformed transcript",
      JSON.stringify({ schemaVersion: 1, transcript: { threads: "bad" } }),
    ],
  ])("rejects %s", async (_label, json) => {
    storage.download.mockResolvedValueOnce(json);
    await expect(getTraceBatchInputs(reference)).rejects.toThrow();
  });

  it("rejects invalid dates and nested tool-result content", async () => {
    const json = JSON.stringify({ schemaVersion: 1, transcript: transcript() });
    storage.download.mockResolvedValueOnce(
      json.replace("2026-10-20T10:00:00.123Z", "not-a-date"),
    );
    await expect(getTraceBatchInputs(reference)).rejects.toThrow();
    storage.download.mockResolvedValueOnce(
      json.replace('"text":"result"', '"text":42'),
    );
    await expect(getTraceBatchInputs(reference)).rejects.toThrow();
  });

  it("accepts compatible additional fields", async () => {
    const value = transcript();
    storage.download.mockResolvedValueOnce(
      JSON.stringify({
        schemaVersion: 1,
        futureOptionalField: true,
        transcript: { ...value, futureOptionalField: true },
      }),
    );
    expect(await getTraceBatchInputs(reference)).toEqual(value);
  });
});
