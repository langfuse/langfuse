import { afterEach, describe, expect, it, vi } from "vitest";
import { type Job } from "bullmq";
import {
  getTraceBatchEventStream,
  logger,
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
  it("forwards operator overrides and logs the attempt configuration even if the stream fails", async () => {
    const originalEnv = { ...env };
    Object.assign(env, {
      LANGFUSE_TRACE_BATCH_MAX_THREADS: 2,
      LANGFUSE_TRACE_BATCH_MAX_BLOCK_SIZE: 512,
      LANGFUSE_TRACE_BATCH_EXPERIMENT_ID: "arm-b",
      BUILD_ID: "test-build",
    });
    const log = vi.spyOn(logger, "info").mockImplementation(() => logger);
    const failure = new Error("query failed");
    vi.mocked(getTraceBatchEventStream).mockImplementation(async function* () {
      throw failure;
    });
    const payload = {
      traces: [
        {
          projectId: "project",
          traceId: "trace",
          minStart: 1_000,
          maxStart: 2_000,
          revision: "r",
        },
      ],
    };
    const job = {
      data: {
        id: "batch",
        name: QueueJobs.TraceBatch,
        timestamp: new Date(),
        payload,
      },
    } as Job<TQueueJobTypes[QueueName.TraceBatch]>;
    try {
      await expect(traceBatchQueueProcessor(job, undefined)).rejects.toBe(
        failure,
      );
      expect(getTraceBatchEventStream).toHaveBeenCalledWith(payload, {
        maxThreads: 2,
        maxBlockSize: 512,
        experimentId: "arm-b",
      });
      expect(log).toHaveBeenCalledWith(
        "Trace batch experiment read",
        expect.objectContaining({
          experimentId: "arm-b",
          buildId: "test-build",
          maxThreads: 2,
          maxBlockSize: 512,
          batchTraceCount: 1,
        }),
      );
      expect(recordDistribution).not.toHaveBeenCalled();
    } finally {
      env.LANGFUSE_TRACE_BATCH_MAX_THREADS =
        originalEnv.LANGFUSE_TRACE_BATCH_MAX_THREADS;
      env.LANGFUSE_TRACE_BATCH_MAX_BLOCK_SIZE =
        originalEnv.LANGFUSE_TRACE_BATCH_MAX_BLOCK_SIZE;
      env.LANGFUSE_TRACE_BATCH_EXPERIMENT_ID =
        originalEnv.LANGFUSE_TRACE_BATCH_EXPERIMENT_ID;
      env.BUILD_ID = originalEnv.BUILD_ID;
    }
  });
  it("counts project/trace pairs with producers disabled and safely repeats reads without retaining payloads", async () => {
    const ingestionEnabled = env.LANGFUSE_TRACE_BATCH_INGESTION_ENABLED;
    const dispatcherEnabled = env.LANGFUSE_TRACE_BATCH_DISPATCHER_ENABLED;
    env.LANGFUSE_TRACE_BATCH_INGESTION_ENABLED = "false";
    env.LANGFUSE_TRACE_BATCH_DISPATCHER_ENABLED = "false";
    try {
      const payload = {
        traces: [
          ["project", "trace-a"],
          ["project", "trace-b"],
          ["other", "trace-a"],
          ["project", "trace-missing"],
          ["absent", "trace-missing"],
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
          for (const [projectId, traceId] of [
            ["project", "trace-a"],
            ["project", "trace-a"],
            ["project", "trace-b"],
            ["other", "trace-a"],
          ]) {
            yieldedRows++;
            yield {
              project_id: projectId,
              trace_id: traceId,
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
            observationCount: 4,
            traceCount: 3,
            projectCount: 2,
            ioMetadataBytes: 52,
          },
        );
      }
      expect(getTraceBatchEventStream).toHaveBeenCalledTimes(2);
      expect(getTraceBatchEventStream).toHaveBeenCalledWith(payload, {
        maxThreads: env.LANGFUSE_TRACE_BATCH_MAX_THREADS,
        maxBlockSize: env.LANGFUSE_TRACE_BATCH_MAX_BLOCK_SIZE,
        experimentId: env.LANGFUSE_TRACE_BATCH_EXPERIMENT_ID,
      });
      expect(yieldedRows).toBe(8);
      expect(
        vi
          .mocked(recordDistribution)
          .mock.calls.filter(
            ([name]) => name === "langfuse.trace_batch.found_project_count",
          )
          .map(([, value]) => value),
      ).toEqual([2, 2]);
      expect(recordDistribution).toHaveBeenCalledWith(
        "langfuse.trace_batch.missing_trace_count",
        2,
      );
    } finally {
      env.LANGFUSE_TRACE_BATCH_INGESTION_ENABLED = ingestionEnabled;
      env.LANGFUSE_TRACE_BATCH_DISPATCHER_ENABLED = dispatcherEnabled;
    }
  });

  it.each([true, false])(
    "normalizes persisted single-project jobs and counts returned projects (has rows: %s)",
    async (hasRows) => {
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
      vi.mocked(getTraceBatchEventStream).mockImplementation(
        async function* () {
          if (!hasRows) return;
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
        },
      );

      await expect(traceBatchQueueProcessor(job, undefined)).resolves.toEqual({
        observationCount: Number(hasRows),
        traceCount: Number(hasRows),
        projectCount: Number(hasRows),
        ioMetadataBytes: hasRows ? 10 : 0,
      });
      expect(recordDistribution).toHaveBeenCalledWith(
        "langfuse.trace_batch.found_project_count",
        Number(hasRows),
      );
      expect(getTraceBatchEventStream).toHaveBeenCalledWith(
        { traces: [{ ...trace, projectId: "project" }] },
        {
          maxThreads: env.LANGFUSE_TRACE_BATCH_MAX_THREADS,
          maxBlockSize: env.LANGFUSE_TRACE_BATCH_MAX_BLOCK_SIZE,
          experimentId: env.LANGFUSE_TRACE_BATCH_EXPERIMENT_ID,
        },
      );
    },
  );
});
