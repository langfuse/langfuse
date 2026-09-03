import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../env", () => ({
  env: {
    LANGFUSE_S3_EVENT_UPLOAD_BUCKET: "test-bucket",
    LANGFUSE_S3_EVENT_UPLOAD_ACCESS_KEY_ID: "test-key",
    LANGFUSE_S3_EVENT_UPLOAD_SECRET_ACCESS_KEY: "test-secret",
    LANGFUSE_S3_EVENT_UPLOAD_ENDPOINT: "http://localhost:9000",
    LANGFUSE_S3_EVENT_UPLOAD_REGION: "us-east-1",
    LANGFUSE_S3_EVENT_UPLOAD_FORCE_PATH_STYLE: "true",
    LANGFUSE_S3_EVENT_UPLOAD_SSE: "",
    LANGFUSE_S3_EVENT_UPLOAD_SSE_KMS_KEY_ID: "",
    LANGFUSE_S3_EVENT_UPLOAD_PREFIX: "",
    LANGFUSE_S3_EVENT_KEY_MAX_SEGMENT_BYTES: 1024,
    LANGFUSE_INGESTION_QUEUE_DELAY_MS: 5000,
    LANGFUSE_SKIP_S3_LIST_FOR_OBSERVATIONS_PROJECT_IDS: "",
    LANGFUSE_INGESTION_PROCESSING_SAMPLED_PROJECTS: new Map<string, number>(),
  },
}));

// vi.hoisted shares handles between the hoisted mock factories and the tests.
const mocks = vi.hoisted(() => ({
  uploadJson: vi.fn().mockResolvedValue(undefined),
  queueAdd: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../redis/redis", () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue("OK"),
    del: vi.fn().mockResolvedValue(1),
    exists: vi.fn().mockResolvedValue(0),
  },
}));

// IngestionQueue.getInstance is synchronous and returns a queue (or null),
// not a Promise; only queue.add is async.
vi.mock("../redis/ingestionQueue", () => ({
  IngestionQueue: {
    getInstance: vi.fn().mockReturnValue({
      add: mocks.queueAdd,
    }),
  },
}));

vi.mock("../services/StorageService", () => ({
  StorageService: class {},
  StorageServiceFactory: {
    getInstance: vi.fn().mockReturnValue({
      uploadJson: mocks.uploadJson,
    }),
  },
}));

vi.mock("./sampling", () => ({
  isTraceIdInSample: vi.fn(),
}));

vi.mock("../instrumentation", () => ({
  getCurrentSpan: vi.fn(() => ({
    setAttribute: vi.fn(),
    addEvent: vi.fn(),
    setStatus: vi.fn(),
    end: vi.fn(),
  })),
  instrumentAsync: vi.fn((_name: string, fn: () => unknown) => fn()),
  recordDistribution: vi.fn(),
  recordIncrement: vi.fn(),
  startActiveSpan: vi.fn((_name: string, fn: (span: unknown) => unknown) =>
    fn({ setAttribute: vi.fn(), end: vi.fn() }),
  ),
}));

vi.mock("../logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("../redis/s3SlowdownTracking", () => ({
  isS3SlowDownError: vi.fn().mockReturnValue(false),
  markProjectS3Slowdown: vi.fn(),
}));

vi.mock("../redis/ingestionFailureTracking", () => ({
  markProjectIngestFailure: vi.fn(),
}));

import { processEventBatch, aggregateBatchResult } from "./processEventBatch";
import { isTraceIdInSample } from "./sampling";
import { IngestionQueue } from "../redis/ingestionQueue";

const sampledMock = vi.mocked(isTraceIdInSample);

const makeAuthCheck = () =>
  ({
    validKey: true as const,
    scope: {
      projectId: "proj_test",
      accessLevel: "project" as const,
    },
  }) as unknown as Parameters<typeof processEventBatch>[1];

const makeTraceEvent = (id: string, traceId: string) => ({
  id,
  timestamp: "2024-01-01T00:00:00.000Z",
  type: "trace-create" as const,
  body: {
    id: traceId,
    timestamp: "2024-01-01T00:00:00.000Z",
    environment: "default",
  },
});

const setSampling = (
  impl: (p: {
    projectId: string | null;
    event: { type: string; body: { id?: string; traceId?: string } };
  }) => { isSampled: boolean; isSamplingConfigured: boolean },
) => {
  sampledMock.mockImplementation(impl as never);
};

beforeEach(() => {
  vi.clearAllMocks();
  setSampling(() => ({ isSampled: true, isSamplingConfigured: false }));
});

describe("aggregateBatchResult", () => {
  it("reports all results as successes when nothing is sampled out", () => {
    const result = aggregateBatchResult(
      [],
      [
        { id: "e1", result: {} },
        { id: "e2", result: {} },
      ],
      "proj_test",
      [],
    );
    expect(result.successes).toHaveLength(2);
    expect(result.successes.every((s) => s.status === 201)).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("filters sampled-out events from successes and surfaces them as warnings", () => {
    const result = aggregateBatchResult(
      [],
      [
        { id: "e1", result: {} },
        { id: "e2", result: {} },
        { id: "e3", result: {} },
      ],
      "proj_test",
      ["e2"],
    );
    expect(result.successes.map((s) => s.id)).toEqual(["e1", "e3"]);
    expect(result.successes.every((s) => s.status === 201)).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatchObject({
      id: "e2",
      status: 200,
      message: "Event dropped by sampling",
    });
    expect(result.warnings[0].warning).toContain("sampling");
  });

  it("handles a mixed batch: some sampled in, some sampled out", () => {
    const result = aggregateBatchResult(
      [],
      [
        { id: "in-1", result: {} },
        { id: "out-1", result: {} },
        { id: "in-2", result: {} },
        { id: "out-2", result: {} },
      ],
      "proj_test",
      ["out-1", "out-2"],
    );
    expect(result.successes.map((s) => s.id)).toEqual(["in-1", "in-2"]);
    expect(result.warnings.map((w) => w.id)).toEqual(["out-1", "out-2"]);
  });

  it("returns empty successes when every event is sampled out", () => {
    const result = aggregateBatchResult(
      [],
      [
        { id: "e1", result: {} },
        { id: "e2", result: {} },
      ],
      "proj_test",
      ["e1", "e2"],
    );
    expect(result.successes).toEqual([]);
    expect(result.warnings.map((w) => w.id)).toEqual(["e1", "e2"]);
  });

  it("preserves errors alongside warnings and successes", () => {
    const result = aggregateBatchResult(
      [{ id: "e-bad", error: new (class extends Error {})("bad") }],
      [
        { id: "e1", result: {} },
        { id: "e2", result: {} },
      ],
      "proj_test",
      ["e2"],
    );
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].id).toBe("e-bad");
    expect(result.errors[0].status).toBe(500);
    expect(result.successes.map((s) => s.id)).toEqual(["e1"]);
    expect(result.warnings.map((w) => w.id)).toEqual(["e2"]);
  });

  it("never leaks warnings into the errors array", () => {
    const result = aggregateBatchResult([], [], "proj_test", ["w1"]);
    expect(result.errors).toEqual([]);
    expect(result.warnings.map((w) => w.id)).toEqual(["w1"]);
  });

  it("is backward compatible when called without sampledOutEventIds", () => {
    const result = aggregateBatchResult(
      [],
      [
        { id: "e1", result: {} },
        { id: "e2", result: {} },
      ],
      "proj_test",
    );
    expect(result.successes).toHaveLength(2);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("defensively warns for sampled-out ids absent from results without filtering successes", () => {
    const result = aggregateBatchResult(
      [],
      [{ id: "e1", result: {} }],
      "proj_test",
      ["nonexistent"],
    );
    expect(result.successes.map((s) => s.id)).toEqual(["e1"]);
    expect(result.warnings.map((w) => w.id)).toEqual(["nonexistent"]);
  });
});

describe("processEventBatch", () => {
  it("returns empty successes, errors and warnings for empty input", async () => {
    const result = await processEventBatch([], makeAuthCheck());
    expect(result.successes).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("reports a validation error (400) for an invalid event", async () => {
    const result = await processEventBatch(
      [{ not: "valid" }],
      makeAuthCheck(),
      { delay: 0 },
    );
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].status).toBe(400);
    expect(result.warnings).toEqual([]);
  });

  it("reports all events as successes when no sampling is configured", async () => {
    setSampling(() => ({ isSampled: true, isSamplingConfigured: false }));
    const result = await processEventBatch(
      [makeTraceEvent("evt-1", "trace-1")],
      makeAuthCheck(),
      { delay: 0 },
    );
    expect(result.successes.map((s) => s.id)).toEqual(["evt-1"]);
    expect(result.successes[0].status).toBe(201);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("reports all events as successes when sampling keeps everything", async () => {
    setSampling(() => ({ isSampled: true, isSamplingConfigured: true }));
    const result = await processEventBatch(
      [makeTraceEvent("evt-1", "trace-1"), makeTraceEvent("evt-2", "trace-2")],
      makeAuthCheck(),
      { delay: 0 },
    );
    expect(result.successes.map((s) => s.id)).toEqual(["evt-1", "evt-2"]);
    expect(result.warnings).toEqual([]);
  });

  it("reports every event as a warning when all are sampled out", async () => {
    setSampling(() => ({ isSampled: false, isSamplingConfigured: true }));
    const result = await processEventBatch(
      [makeTraceEvent("evt-1", "trace-1"), makeTraceEvent("evt-2", "trace-2")],
      makeAuthCheck(),
      { delay: 0 },
    );
    expect(result.successes).toEqual([]);
    expect(result.warnings.map((w) => w.id)).toEqual(["evt-1", "evt-2"]);
    expect(result.warnings.every((w) => w.status === 200)).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("keeps sampled-in events as successes and sampled-out events as warnings", async () => {
    setSampling(({ event }) => {
      const traceId = event.body.id;
      return traceId === "trace-out"
        ? { isSampled: false, isSamplingConfigured: true }
        : { isSampled: true, isSamplingConfigured: true };
    });
    const result = await processEventBatch(
      [
        makeTraceEvent("in-1", "trace-in-1"),
        makeTraceEvent("out-1", "trace-out"),
        makeTraceEvent("in-2", "trace-in-2"),
      ],
      makeAuthCheck(),
      { delay: 0 },
    );
    expect(result.successes.map((s) => s.id).sort()).toEqual(["in-1", "in-2"]);
    expect(result.warnings.map((w) => w.id)).toEqual(["out-1"]);
    expect(result.errors).toEqual([]);
  });

  it("calls StorageServiceFactory.getInstance().uploadJson for the S3 path", async () => {
    const result = await processEventBatch(
      [makeTraceEvent("evt-1", "trace-1")],
      makeAuthCheck(),
      { delay: 0 },
    );
    expect(result.successes).toHaveLength(1);
    expect(mocks.uploadJson).toHaveBeenCalled();
  });

  it("uses IngestionQueue.getInstance synchronously and enqueues via queue.add", async () => {
    setSampling(() => ({ isSampled: true, isSamplingConfigured: true }));
    await processEventBatch(
      [makeTraceEvent("evt-1", "trace-1")],
      makeAuthCheck(),
      { delay: 0 },
    );
    expect(IngestionQueue.getInstance).toHaveBeenCalled();
    expect(mocks.queueAdd).toHaveBeenCalled();
  });
});
