import { afterEach, describe, expect, it, vi } from "vitest";
import { type Job } from "bullmq";
import {
  getTraceBatchEventStream,
  QueueJobs,
  type QueueName,
  recordDistribution,
  type TQueueJobTypes,
} from "@langfuse/shared/src/server";
import { env } from "../../env";
import { traceBatchQueueProcessor } from "../traceBatchQueue";

vi.mock("@langfuse/shared/src/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@langfuse/shared/src/server")>()),
  getTraceBatchEventStream: vi.fn(),
  recordDistribution: vi.fn(),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("trace batch queue", () => {
  it("counts project/trace pairs with producers disabled and safely repeats reads without retaining payloads", async () => {
    const ingestionEnabled = env.LANGFUSE_TRACE_BATCH_INGESTION_ENABLED;
    const dispatcherEnabled = env.LANGFUSE_TRACE_BATCH_DISPATCHER_ENABLED;
    env.LANGFUSE_TRACE_BATCH_INGESTION_ENABLED = "false";
    env.LANGFUSE_TRACE_BATCH_DISPATCHER_ENABLED = "false";
    try {
      const payload = {
        traces: [
          ["project", "trace-a"],
          ["other", "trace-a"],
          ["project", "trace-missing"],
        ].map(([projectId, traceId]) => ({
          projectId,
          traceId,
          minStart: 1_000,
          maxStart: 2_000,
          revision: "revision",
        })),
      };
      const job = {
        data: {
          id: "batch",
          name: QueueJobs.TraceBatch,
          timestamp: new Date(),
          payload,
        },
      } as Job<TQueueJobTypes[QueueName.TraceBatch]>;
      let yieldedRows = 0;
      vi.mocked(getTraceBatchEventStream).mockImplementation(
        async function* () {
          for (const projectId of ["project", "project", "other"]) {
            yieldedRows++;
            yield {
              project_id: projectId,
              trace_id: "trace-a",
              span_id: `span-${yieldedRows}`,
              parent_span_id: null,
              start_time: "2026-09-11 00:00:00.000000",
              event_ts: "2026-09-11 00:00:00.000000",
              type: "GENERATION",
              name: "generation",
              input: "hello",
              output: "世界",
              metadata: { a: "b" },
              tool_definitions: {},
              tool_calls: [],
              tool_call_names: [],
            };
          }
        },
      );

      for (let attempt = 0; attempt < 2; attempt++) {
        await expect(traceBatchQueueProcessor(job, undefined)).resolves.toEqual(
          {
            observationCount: 3,
            traceCount: 2,
            ioMetadataBytes: 39,
          },
        );
      }
      expect(getTraceBatchEventStream).toHaveBeenCalledTimes(2);
      expect(getTraceBatchEventStream).toHaveBeenCalledWith(payload);
      expect(yieldedRows).toBe(6);
      expect(recordDistribution).toHaveBeenCalledWith(
        "langfuse.trace_batch.missing_trace_count",
        1,
      );
    } finally {
      env.LANGFUSE_TRACE_BATCH_INGESTION_ENABLED = ingestionEnabled;
      env.LANGFUSE_TRACE_BATCH_DISPATCHER_ENABLED = dispatcherEnabled;
    }
  });

  it("normalizes persisted single-project jobs before reading their traces", async () => {
    const trace = {
      traceId: "trace",
      minStart: 1_000,
      maxStart: 2_000,
      revision: "revision",
    };
    const job = {
      data: {
        id: "legacy-batch",
        name: QueueJobs.TraceBatch,
        timestamp: new Date().toISOString(),
        payload: { projectId: "project", traces: [trace] },
      },
    } as unknown as Job<TQueueJobTypes[QueueName.TraceBatch]>;
    vi.mocked(getTraceBatchEventStream).mockImplementation(async function* () {
      yield {
        project_id: "project",
        trace_id: "trace",
        span_id: "span",
        parent_span_id: null,
        start_time: "2026-09-11 00:00:00.000000",
        event_ts: "2026-09-11 00:00:00.000000",
        type: "GENERATION",
        name: "generation",
        input: "hello",
        output: "world",
        metadata: {},
        tool_definitions: {},
        tool_calls: [],
        tool_call_names: [],
      };
    });

    await expect(traceBatchQueueProcessor(job, undefined)).resolves.toEqual({
      observationCount: 1,
      traceCount: 1,
      ioMetadataBytes: 10,
    });
    expect(getTraceBatchEventStream).toHaveBeenCalledWith({
      traces: [{ ...trace, projectId: "project" }],
    });
  });
});
