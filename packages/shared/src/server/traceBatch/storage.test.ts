import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StorageService } from "../services/StorageService";
import type { ExecutionIssue, Transcript } from "../transcript/types";
import storedV1 from "./fixtures/inputs-v1.json";
import { createEventUploadStorageService } from "../s3";
import { createTraceBatchInputStorage } from "./storage";

const storage = vi.hoisted(() => ({
  uploadFile: vi.fn<StorageService["uploadFile"]>(),
  download: vi.fn<StorageService["download"]>(),
}));
vi.mock("../s3", () => ({
  createEventUploadStorageService: vi.fn(() => storage),
}));
vi.mock("../../env", () => ({
  env: {
    LANGFUSE_S3_EVENT_UPLOAD_BUCKET: "events",
    LANGFUSE_S3_EVENT_UPLOAD_PREFIX: "test/",
    LANGFUSE_S3_EVENT_KEY_MAX_SEGMENT_BYTES: 200,
    LANGFUSE_TRACE_BATCH_TRANSCRIPT_STORAGE_REQUEST_TIMEOUT_MS: 10_000,
  },
}));

const inputStorage = createTraceBatchInputStorage();

const reference = {
  projectId: "project",
  traceId: "trace",
  revision: "revision",
};

const traceContext = {
  sessionId: null,
  traceName: null,
  traceTimestamp: "2026-10-20T10:00:00.123Z",
  environment: "production",
};

beforeEach(() => {
  storage.uploadFile.mockReset().mockResolvedValue(undefined);
  storage.download.mockReset().mockResolvedValue(JSON.stringify(storedV1));
});

describe("trace batch input storage", () => {
  it("initializes the provider lazily and reuses it across storage instances", async () => {
    vi.resetModules();
    vi.mocked(createEventUploadStorageService).mockClear();
    const { createTraceBatchInputStorage } = await import("./storage.js");
    const first = createTraceBatchInputStorage();
    const second = createTraceBatchInputStorage();
    expect(createEventUploadStorageService).not.toHaveBeenCalled();

    await first.get(reference);
    await second.put(reference, {
      transcript: null,
      executionIssues: [],
      traceContext,
    });

    expect(createEventUploadStorageService).toHaveBeenCalledExactlyOnceWith(
      "events",
      { s3RequestTimeoutMs: 10_000 },
    );
  });

  it.each([
    { sessionId: "session", traceName: "agent" },
    { sessionId: null, traceName: null },
  ])("round trips nested trace context with %j", async (nullableFields) => {
    const inputs = {
      transcript: transcript(),
      executionIssues: [executionIssue()],
      traceContext: {
        ...traceContext,
        ...nullableFields,
      },
    };
    await inputStorage.put(reference, inputs);
    let json = "";
    for await (const chunk of storage.uploadFile.mock.calls[0][0].data)
      json += chunk;
    expect(JSON.parse(json)).toEqual({
      ...storedV1,
      executionIssues: [
        { ...executionIssue(), startTime: "2026-10-20T10:00:00.456Z" },
      ],
      traceContext: inputs.traceContext,
    });
    storage.download.mockResolvedValueOnce(json);
    expect(await inputStorage.get(reference)).toEqual(inputs);
  });

  it("reads the saved v1 format and writes it at the deterministic revision key", async () => {
    const value = transcript();
    const key = "test/trace-batch/trace/ecb/project/trace/revision.json";
    // The saved fixture predates execution issues, which read as empty.
    expect(await inputStorage.get(reference)).toEqual({
      transcript: value,
      executionIssues: [],
      traceContext,
    });
    expect(storage.download).toHaveBeenCalledWith(key);

    await inputStorage.put(reference, {
      transcript: value,
      executionIssues: [],
      traceContext,
    });
    const upload = storage.uploadFile.mock.calls[0][0];
    expect(upload).toMatchObject({
      fileName: key,
      fileType: "application/json",
    });
    expect(upload.data).toBeInstanceOf(Readable);
    let json = "";
    for await (const chunk of upload.data) json += chunk;
    expect(JSON.parse(json)).toEqual({ ...storedV1, executionIssues: [] });
  });

  it("reads an explicitly stored null transcript", async () => {
    storage.download.mockResolvedValueOnce(
      JSON.stringify({ schemaVersion: 1, transcript: null, traceContext }),
    );
    expect(await inputStorage.get(reference)).toEqual({
      transcript: null,
      executionIssues: [],
      traceContext,
    });
  });

  it.each([1_000_000, 1_000_001])(
    "applies the limit to the complete envelope of length %i",
    async (size) => {
      const value = transcript("");
      const overhead = JSON.stringify({
        schemaVersion: 1,
        transcript: value,
        executionIssues: [],
        traceContext,
      }).length;
      value.threads[0].currentTurn.messages[0].parts = [
        { type: "text", text: "x".repeat(size - overhead) },
      ];
      expect(
        await inputStorage.put(reference, {
          transcript: value,
          executionIssues: [],
          traceContext,
        }),
      ).toEqual({
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
    await expect(inputStorage.get(reference)).rejects.toThrow("NoSuchKey");
    storage.uploadFile.mockRejectedValueOnce(new Error("SlowDown"));
    await expect(
      inputStorage.put(reference, {
        transcript: null,
        executionIssues: [],
        traceContext,
      }),
    ).rejects.toThrow("SlowDown");
  });

  it.each([
    ["invalid JSON", "{"],
    ["missing trace context", '{"schemaVersion":1,"transcript":null}'],
    [
      "unsupported version",
      JSON.stringify({ schemaVersion: 2, transcript: null, traceContext }),
    ],
    [
      "invalid transcript",
      JSON.stringify({
        schemaVersion: 1,
        transcript: { threads: "bad" },
        traceContext,
      }),
    ],
    [
      "invalid execution issue",
      JSON.stringify({
        schemaVersion: 1,
        transcript: null,
        executionIssues: [{ ...executionIssue(), level: "DEFAULT" }],
        traceContext,
      }),
    ],
    ...["sessionId", "traceName", "environment", "traceTimestamp"].map(
      (field) => [
        `missing trace context ${field}`,
        JSON.stringify({
          schemaVersion: 1,
          transcript: null,
          traceContext: Object.fromEntries(
            Object.entries(traceContext).filter(([key]) => key !== field),
          ),
        }),
      ],
    ),
    [
      "invalid trace timestamp",
      JSON.stringify({
        schemaVersion: 1,
        transcript: null,
        traceContext: { ...traceContext, traceTimestamp: "not a date" },
      }),
    ],
  ])("rejects %s", async (_label, json) => {
    storage.download.mockResolvedValueOnce(json);
    await expect(inputStorage.get(reference)).rejects.toThrow();
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

function executionIssue(): ExecutionIssue {
  return {
    observationId: "tool",
    traceId: "trace",
    type: "TOOL",
    name: "search",
    level: "ERROR",
    statusMessage: "Request timed out",
    startTime: new Date("2026-10-20T10:00:00.456Z"),
  };
}
