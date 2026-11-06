import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { type Job } from "bullmq";
import { context, SpanStatusCode, trace } from "@opentelemetry/api";
import { NodeSDK, tracing } from "@opentelemetry/sdk-node";
import {
  getCurrentSpan,
  convertObservation,
  createObservation,
  getTraceBatchEventStream,
  logger,
  QueueJobs,
  type QueueName,
  recordDistribution,
  recordGauge,
  recordIncrement,
  type TraceBatchInputStorage,
  type TQueueJobTypes,
  type TranscriptContext,
} from "@langfuse/shared/src/server";
import { env } from "../../env";
import {
  getEnabledTopicsModels,
  isTopicsEnabled,
  isTopicsProjectEnabled,
  listTopicRules,
  type TopicsModels,
} from "@langfuse/shared/topics/server";
import type { TopicRule } from "@langfuse/shared/topics";
import { recordTraceBatchTranscript } from "../../features/traceBatching/traceBatchTranscript";
import * as traceBatchTranscript from "../../features/traceBatching/traceBatchTranscript";
import {
  recordTraceBatchActiveReads,
  traceBatchQueueProcessor,
} from "../traceBatchQueue";

const inputStorage = vi.hoisted(() => ({
  put: vi.fn<TraceBatchInputStorage["put"]>(),
  get: vi.fn<TraceBatchInputStorage["get"]>(),
}));
const topicsQueue = vi.hoisted(() => ({ add: vi.fn() }));

vi.mock("@langfuse/shared/src/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@langfuse/shared/src/server")>()),
  getTraceBatchEventStream: vi.fn(),
  getCurrentSpan: vi.fn(),
  recordDistribution: vi.fn(),
  recordGauge: vi.fn(),
  recordIncrement: vi.fn(),
  createTraceBatchInputStorage: () => inputStorage,
  TopicsTraceQueue: { getInstance: vi.fn(() => topicsQueue) },
}));

vi.mock("@langfuse/shared/topics/server", () => ({
  isTopicsEnabled: vi.fn(() => true),
  isTopicsProjectEnabled: vi.fn(() => true),
  getEnabledTopicsModels: vi.fn(
    async (projectIds: string[]) =>
      new Map(projectIds.map((projectId) => [projectId, { projectId }])),
  ),
  listTopicRules: vi.fn(),
}));

const originalReadEnabled = env.LANGFUSE_TRACE_BATCH_READ_ENABLED;
const originalDispatchEnabled = env.LANGFUSE_TRACE_DISPATCH_ENABLED;
const originalTranscriptMetricsEnabled =
  env.LANGFUSE_TRACE_BATCH_TRANSCRIPT_METRICS_ENABLED;
const originalCloudRegion = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
const originalExperimentId = env.LANGFUSE_TRACE_BATCH_EXPERIMENT_ID;
const processingSpan = trace.wrapSpanContext({
  traceId: "0123456789abcdef0123456789abcdef",
  spanId: "0123456789abcdef",
  traceFlags: 1,
});
const exporter = new tracing.InMemorySpanExporter();
const sdk = new NodeSDK({
  spanProcessors: [new tracing.SimpleSpanProcessor(exporter)],
  autoDetectResources: false,
  instrumentations: [],
});
beforeAll(() => sdk.start());
afterAll(async () => {
  await sdk.shutdown();
  trace.disable();
  context.disable();
});
beforeEach(() => {
  exporter.reset();
  env.LANGFUSE_TRACE_BATCH_READ_ENABLED = "true";
  env.LANGFUSE_TRACE_DISPATCH_ENABLED = "false";
  vi.mocked(isTopicsEnabled).mockReturnValue(true);
  vi.mocked(isTopicsProjectEnabled).mockReturnValue(true);
  // By default every trace is sampled by one rule with one facet.
  vi.mocked(listTopicRules).mockResolvedValue([
    { id: "rule", facetIds: ["intent"], sampling: 1 } as TopicRule,
  ]);
  topicsQueue.add.mockResolvedValue(undefined);
  inputStorage.put.mockResolvedValue({
    outcome: "stored",
    jsonLength: 100,
  });
  env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "DEV";
  vi.mocked(getCurrentSpan).mockReturnValue(processingSpan);
  vi.spyOn(processingSpan, "setAttributes");
});
afterEach(() => {
  env.LANGFUSE_TRACE_BATCH_READ_ENABLED = originalReadEnabled;
  env.LANGFUSE_TRACE_DISPATCH_ENABLED = originalDispatchEnabled;
  env.LANGFUSE_TRACE_BATCH_TRANSCRIPT_METRICS_ENABLED =
    originalTranscriptMetricsEnabled;
  env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalCloudRegion;
  env.LANGFUSE_TRACE_BATCH_EXPERIMENT_ID = originalExperimentId;
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("trace batch queue", () => {
  it("measures rendered Topics text for an admitted trace", async () => {
    const observations = [
      convertObservation(
        createObservation({
          type: "GENERATION",
          name: "explain",
          trace_id: "topics-sample",
          input: JSON.stringify([
            { role: "user", content: "Explain the result" },
          ]),
          output: JSON.stringify({ role: "assistant", content: "The answer" }),
        }),
      ),
    ];

    let assembled: TranscriptContext | null | undefined;
    let spanEndedBeforeCallback = false;
    await recordTraceBatchTranscript(observations, async (context) => {
      assembled = context;
      spanEndedBeforeCallback = exporter.getFinishedSpans().length === 1;
    });

    expect(assembled).not.toBeNull();
    const baselineJson = JSON.stringify(assembled!.transcript);
    expect(assembled!.transcript.threads[0].currentTurn.observations).toEqual([
      expect.objectContaining({ traceId: "topics-sample" }),
    ]);
    expect(spanEndedBeforeCallback).toBe(true);
    const genericText = "[user] Explain the result\n[assistant] The answer";
    const renderedText = [
      "<run_facts>",
      "threads: 1 · rendered user entries: 1 · rendered tool calls: 0 · error signals: 0 · omitted lines: 0",
      "</run_facts>",
      "<this_run>",
      "[generation] explain",
      "[user · request] Explain the result",
      "[assistant · final output] The answer",
      "</this_run>",
      "<end_of_run>",
      "last action: assistant text",
      "final output: assistant",
      "</end_of_run>",
    ].join("\n");
    expect(recordDistribution).not.toHaveBeenCalled();
    expect(exporter.getFinishedSpans()[0].attributes).toMatchObject({
      "langfuse.trace_batch.transcript_json_characters": baselineJson.length,
      "langfuse.trace_batch.generic_transcript_characters": genericText.length,
      "langfuse.trace_batch.topics_transcript_characters": renderedText.length,
      "langfuse.trace_batch.topics_transcript_blocks_cut": 0,
      "langfuse.trace_batch.topics_transcript_history_share": 0,
      "langfuse.trace_batch.topics_transcript_block_user_raw_characters":
        "Explain the result".length,
      "langfuse.trace_batch.topics_transcript_block_observations_raw_characters":
        "explain".length,
      "langfuse.trace_batch.transcript_observation_count": 1,
      "langfuse.trace_batch.transcript_history_message_count": 0,
      "langfuse.trace_batch.transcript_current_turn_message_count": 2,
      "langfuse.trace_batch.transcript_current_turn_part_count": 2,
    });
  });

  it("emits transcript distributions only when the switch is on", async () => {
    env.LANGFUSE_TRACE_BATCH_TRANSCRIPT_METRICS_ENABLED = "true";
    await recordTraceBatchTranscript([
      convertObservation(
        createObservation({
          type: "GENERATION",
          name: "explain",
          trace_id: "topics-metrics",
          input: JSON.stringify([
            { role: "user", content: "Explain the result" },
          ]),
          output: JSON.stringify({ role: "assistant", content: "The answer" }),
        }),
      ),
    ]);

    const renderedText = [
      "<run_facts>",
      "threads: 1 · rendered user entries: 1 · rendered tool calls: 0 · error signals: 0 · omitted lines: 0",
      "</run_facts>",
      "<this_run>",
      "[generation] explain",
      "[user · request] Explain the result",
      "[assistant · final output] The answer",
      "</this_run>",
      "<end_of_run>",
      "last action: assistant text",
      "final output: assistant",
      "</end_of_run>",
    ].join("\n");
    expect(recordDistribution).toHaveBeenCalledWith(
      "langfuse.trace_batch.topics_transcript_characters",
      renderedText.length,
    );
    expect(recordDistribution).toHaveBeenCalledWith(
      "langfuse.trace_batch.transcript_json_characters",
      expect.any(Number),
    );
  });

  it("measures history, current turn, threads and deduplicated tool responses", async () => {
    const history = [
      { role: "user", content: "earlier question" },
      { role: "assistant", content: "earlier answer" },
    ];
    const question = { role: "user", content: "current question" };
    const call = {
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: "call",
          type: "function",
          function: { name: "lookup", arguments: "{}" },
        },
      ],
    };
    const observation = (
      id: string,
      input: unknown,
      output: unknown,
      type: "GENERATION" | "TOOL" = "GENERATION",
    ) =>
      convertObservation(
        createObservation({
          id,
          trace_id: "trace",
          project_id: "project",
          type,
          name: type === "TOOL" ? "lookup" : "generation",
          start_time: `2026-01-01T12:00:0${id}.000Z`,
          input: JSON.stringify(input),
          output: JSON.stringify(output),
        }),
      );
    let assembled: TranscriptContext | null | undefined;
    await recordTraceBatchTranscript(
      [
        observation("1", [...history, question], call),
        observation("2", {}, "tool payload", "TOOL"),
        observation(
          "3",
          [
            ...history,
            question,
            call,
            { role: "tool", tool_call_id: "call", content: "tool payload" },
          ],
          "current answer",
        ),
        observation(
          "4",
          [{ role: "user", content: "independent question" }],
          "independent answer",
        ),
      ],
      async (context) => {
        assembled = context;
      },
    );
    expect(assembled).not.toBeNull();
    const transcript = assembled!.transcript;
    expect(transcript.threads).toHaveLength(2);
    const current = JSON.stringify(
      transcript.threads.map(({ currentTurn }) => currentTurn.messages),
    );
    const historyOnly = JSON.stringify(
      transcript.threads.map(({ conversationHistory }) => conversationHistory),
    );
    expect(current.split("tool payload")).toHaveLength(2);
    expect(current).not.toContain("earlier question");
    expect(current).toContain("current question");
    expect(current).toContain("independent question");
    expect(historyOnly).toContain("earlier question");
    expect(historyOnly).not.toContain("current question");
    expect(recordDistribution).not.toHaveBeenCalled();
    const span = exporter.getFinishedSpans()[0];
    expect(span.attributes).toMatchObject({
      "langfuse.trace_batch.transcript_thread_count": 2,
      "langfuse.trace_batch.transcript_observation_count": 4,
      "langfuse.trace_batch.transcript_history_message_count": 2,
      "langfuse.trace_batch.transcript_history_part_count": 2,
      "langfuse.trace_batch.transcript_current_turn_tool_call_count": 1,
      "langfuse.trace_batch.transcript_current_turn_tool_result_count": 1,
    });
    const toolCharacters = JSON.stringify({
      type: "tool-result",
      toolCallId: "call",
      toolName: "lookup",
      output: { type: "text", value: "tool payload" },
    }).length;
    expect(
      span.attributes[
        "langfuse.trace_batch.transcript_tool_response_characters"
      ],
    ).toBe(toolCharacters);
    expect(
      span.attributes["langfuse.trace_batch.transcript_content_characters"],
    ).toBeGreaterThan(toolCharacters);
    let phaseTotal = 0;
    for (const phase of ["normalization", "matching"]) {
      const duration = span.attributes[
        `langfuse.trace_batch.transcript_assembly_${phase}_duration_ms`
      ] as number;
      expect(duration).toBeGreaterThanOrEqual(0);
      phaseTotal += duration;
    }
    expect(phaseTotal).toBeLessThanOrEqual(
      span.attributes[
        "langfuse.trace_batch.transcript_assembly_duration_ms"
      ] as number,
    );
  });

  it("counts unmatched tool results without counting adjacent user text", async () => {
    await recordTraceBatchTranscript([
      convertObservation(
        createObservation({
          type: "GENERATION",
          trace_id: "trace",
          input: JSON.stringify([
            {
              role: "user",
              content: [
                { type: "text", text: "Please explain this result" },
                {
                  type: "tool_result",
                  tool_use_id: "unmatched",
                  content: "tool payload",
                },
              ],
            },
          ]),
          output: "Answer",
        }),
      ),
    ]);
    const toolCharacters = JSON.stringify({
      type: "tool-result",
      toolCallId: "unmatched",
      output: { type: "text", value: "tool payload" },
    }).length;
    const totalCharacters =
      toolCharacters +
      JSON.stringify({ type: "text", text: "Please explain this result" })
        .length +
      JSON.stringify({ type: "text", text: "Answer" }).length;
    expect(recordDistribution).not.toHaveBeenCalled();
    expect(exporter.getFinishedSpans()[0].attributes).toMatchObject({
      "langfuse.trace_batch.transcript_tool_response_characters":
        toolCharacters,
      "langfuse.trace_batch.transcript_content_characters": totalCharacters,
    });
  });

  it.each([false, true])(
    "keeps streaming while a transcript upload is pending (stream fails: %s)",
    async (streamFails) => {
      let releaseFirstUpload!: () => void;
      const firstUpload = new Promise<void>(
        (resolve) => (releaseFirstUpload = resolve),
      );
      let firstUploadStarted = false;
      inputStorage.put.mockImplementationOnce(async () => {
        firstUploadStarted = true;
        await firstUpload;
        return { outcome: "stored", jsonLength: 100 };
      });
      let suppliedThirdTrace = false;
      let reachedEnd = false;
      let settled = false;
      const failure = new Error("stream failed");
      vi.mocked(getTraceBatchEventStream).mockImplementation(
        async function* () {
          for (const [index, traceId] of ["a", "b", "b", "c"].entries()) {
            if (traceId === "c") suppliedThirdTrace = true;
            yield {
              project_id: "project",
              trace_id: traceId,
              environment: "default",
              span_id: `span-${index}`,
              parent_span_id: null,
              start_time: "2026-09-11 00:00:00.000000",
              event_ts: "2026-09-11 00:00:00.000000",
              type: traceId === "c" ? "SPAN" : "GENERATION",
              name: "generation",
              input: "hello",
              output: "world",
              metadata: {},
              level: "DEFAULT",
              status_message: null,
              tool_definitions: {},
              tool_calls: [],
              tool_call_names: [],
            };
          }
          reachedEnd = true;
          if (streamFails) throw failure;
        },
      );
      const job = {
        data: {
          id: "streaming-storage",
          name: QueueJobs.TraceBatch,
          timestamp: new Date(),
          payload: {
            traces: ["a", "b", "c"].map((traceId) => ({
              projectId: "project",
              traceId,
              minStart: 0,
              maxStart: 1,
              revision: "r",
            })),
          },
        },
      } as Job<TQueueJobTypes[QueueName.TraceBatch]>;
      const processing = context
        .with(trace.setSpan(context.active(), processingSpan), () =>
          traceBatchQueueProcessor(job, undefined),
        )
        .then(
          (result) => ({ result, error: undefined }),
          (error: unknown) => ({ result: undefined, error }),
        );
      void processing.then(() => (settled = true));
      try {
        // The stream drains while the first transcript upload is pending, so
        // the ClickHouse socket does not wait for downstream storage work.
        await vi.waitFor(() => expect(reachedEnd).toBe(true));
        expect(suppliedThirdTrace).toBe(true);
        await vi.waitFor(() => expect(firstUploadStarted).toBe(true));
        expect(settled).toBe(false);
        releaseFirstUpload();
        const outcome = await processing;
        expect(outcome.error).toBe(streamFails ? failure : undefined);
        const spans = exporter
          .getFinishedSpans()
          .filter((span) => span.name === "trace-batch-transcript");
        expect(spans).toHaveLength(streamFails ? 2 : 3);
        expect(spans[0].attributes).toMatchObject({
          "langfuse.trace.id": "a",
        });
        for (const span of spans) {
          expect(span.parentSpanContext?.spanId).toBe(
            processingSpan.spanContext().spanId,
          );
          expect(span.status.code).toBe(SpanStatusCode.UNSET);
          expect(span.attributes).toHaveProperty(
            "langfuse.trace_batch.transcript_characters",
            expect.any(Number),
          );
        }
      } finally {
        releaseFirstUpload();
        await processing;
      }
    },
  );
  it("stores traces concurrently and resumes streaming when any upload brings payloads below the cap", async () => {
    const originalCap = env.LANGFUSE_TRACE_BATCH_MAX_PENDING_SUMMARY_BYTES;
    env.LANGFUSE_TRACE_BATCH_MAX_PENDING_SUMMARY_BYTES = 1_000;
    const payload = "x".repeat(600);
    let reachedEnd = false;
    let resolveFirst!: () => void;
    let resolveSecond!: () => void;
    const first = new Promise<void>((resolve) => (resolveFirst = resolve));
    const second = new Promise<void>((resolve) => (resolveSecond = resolve));
    inputStorage.put
      .mockImplementationOnce(async () => {
        await first;
        return { outcome: "stored", jsonLength: 1 };
      })
      .mockImplementationOnce(async () => {
        await second;
        return { outcome: "stored", jsonLength: 1 };
      });
    vi.mocked(getTraceBatchEventStream).mockImplementation(async function* () {
      for (const traceId of ["a", "b", "c"]) {
        yield {
          project_id: "project",
          trace_id: traceId,
          environment: "default",
          span_id: traceId,
          parent_span_id: null,
          start_time: "2026-09-11 00:00:00.000000",
          event_ts: "2026-09-11 00:00:00.000000",
          type: "GENERATION",
          name: "generation",
          input: JSON.stringify([{ role: "user", content: "hello" }]),
          output: "",
          metadata: traceId === "c" ? {} : { payload },
          level: "DEFAULT",
          status_message: null,
          tool_definitions: {},
          tool_calls: [],
          tool_call_names: [],
        };
      }
      reachedEnd = true;
    });
    const job = {
      data: {
        id: "summary-backpressure",
        name: QueueJobs.TraceBatch,
        timestamp: new Date(),
        payload: {
          traces: ["a", "b", "c"].map((traceId) => ({
            projectId: "project",
            traceId,
            minStart: 0,
            maxStart: 1,
            revision: "r",
          })),
        },
      },
    } as Job<TQueueJobTypes[QueueName.TraceBatch]>;
    let settled = false;
    const processing = Promise.resolve(
      traceBatchQueueProcessor(job, undefined),
    );
    void processing.then(() => (settled = true));
    try {
      await vi.waitFor(() =>
        expect(recordIncrement).toHaveBeenCalledWith(
          "langfuse.trace_batch.summary_backpressure",
          1,
        ),
      );
      expect(reachedEnd).toBe(false);
      await vi.waitFor(() => expect(inputStorage.put).toHaveBeenCalledTimes(2));
      // The later trace finishing first releases its payload.
      resolveSecond();
      await vi.waitFor(() => expect(reachedEnd).toBe(true));
      await vi.waitFor(() => expect(inputStorage.put).toHaveBeenCalledTimes(3));
      expect(settled).toBe(false);
      resolveFirst();
      await expect(processing).resolves.toEqual(
        expect.objectContaining({ traceCount: 3 }),
      );
      expect(topicsQueue.add).toHaveBeenCalledTimes(3);
    } finally {
      resolveFirst();
      resolveSecond();
      await processing;
      env.LANGFUSE_TRACE_BATCH_MAX_PENDING_SUMMARY_BYTES = originalCap;
    }
  });

  it("enqueues completed traces before rethrowing a failed stream", async () => {
    const failure = new Error("query failed");
    const event = (projectId: string) => ({
      project_id: projectId,
      trace_id: "trace",
      environment: "default",
      span_id: "span",
      parent_span_id: null,
      start_time: "2026-09-11 00:00:00.000000",
      event_ts: "2026-09-11 00:00:00.000000",
      type: "GENERATION",
      name: "generation",
      input: JSON.stringify([{ role: "user", content: projectId }]),
      output: JSON.stringify({ role: "assistant", content: "answer" }),
      metadata: {},
      level: "DEFAULT",
      status_message: null,
      tool_definitions: {},
      tool_calls: [],
      tool_call_names: [],
    });
    vi.mocked(getTraceBatchEventStream).mockImplementation(async function* () {
      yield event("a");
      // b's boundary completes a; b itself is cut off by the failure.
      yield event("b");
      throw failure;
    });
    const job = {
      data: {
        id: "stream-failure",
        name: QueueJobs.TraceBatch,
        timestamp: new Date(),
        payload: {
          traces: ["a", "b"].map((projectId) => ({
            projectId,
            traceId: "trace",
            minStart: 0,
            maxStart: 1,
            revision: "r",
          })),
        },
      },
    } as Job<TQueueJobTypes[QueueName.TraceBatch]>;

    await expect(traceBatchQueueProcessor(job, undefined)).rejects.toBe(
      failure,
    );
    // Deduplication makes the retry skip a's revision.
    expect(
      topicsQueue.add.mock.calls.map(([, data]) => data.payload.projectId),
    ).toEqual(["a"]);
  });

  it("counts a trace whose input cannot be stored or enqueued as failed without failing the batch", async () => {
    vi.mocked(getTraceBatchEventStream).mockImplementation(async function* () {
      for (const traceId of ["too-large", "upload", "enqueue"])
        yield {
          project_id: "project",
          trace_id: traceId,
          environment: "default",
          span_id: "span",
          parent_span_id: null,
          start_time: "2026-09-11 00:00:00.000000",
          event_ts: "2026-09-11 00:00:00.000000",
          type: "GENERATION",
          name: "generation",
          input: JSON.stringify([{ role: "user", content: "private input" }]),
          output: JSON.stringify({ role: "assistant", content: "answer" }),
          metadata: {},
          level: "DEFAULT",
          status_message: null,
          tool_definitions: {},
          tool_calls: [],
          tool_call_names: [],
        };
    });
    inputStorage.put.mockImplementation(async ({ traceId }) => {
      if (traceId === "upload") throw new Error("Failed to upload file to S3");
      return traceId === "too-large"
        ? { outcome: "too_large", jsonLength: 1_000_001 }
        : { outcome: "stored", jsonLength: 100 };
    });
    topicsQueue.add.mockRejectedValue(new Error("Redis unavailable"));
    const job = {
      data: {
        id: "storage",
        name: QueueJobs.TraceBatch,
        timestamp: new Date(),
        payload: {
          traces: ["too-large", "upload", "enqueue"].map((traceId) => ({
            projectId: "project",
            traceId,
            minStart: 0,
            maxStart: 1,
            revision: "r",
          })),
        },
      },
    } as Job<TQueueJobTypes[QueueName.TraceBatch]>;

    await expect(traceBatchQueueProcessor(job, undefined)).resolves.toEqual(
      expect.objectContaining({ traceCount: 3 }),
    );
    for (const reason of ["input_too_large", "input_storage", "enqueue"])
      expect(recordIncrement).toHaveBeenCalledWith(
        "langfuse.topics.trace_outcomes",
        1,
        { source: "trace_batch", outcome: "failed", reason },
      );
    expect(topicsQueue.add).toHaveBeenCalledOnce();
    const storageSpan = exporter
      .getFinishedSpans()
      .find(
        (span) =>
          span.name === "trace-batch-store-inputs" &&
          span.attributes["langfuse.trace.id"] === "upload",
      );
    expect(
      storageSpan?.attributes["langfuse.trace_batch.input_storage.outcome"],
    ).toBe("upload_failed");
    expect(storageSpan?.status.code).toBe(SpanStatusCode.ERROR);
  });

  it("skips the ClickHouse read when a dispatched batch has no Topics project", async () => {
    env.LANGFUSE_TRACE_DISPATCH_ENABLED = "true";
    vi.mocked(isTopicsProjectEnabled).mockReturnValue(false);
    const job = {
      opts: {},
      data: {
        id: "experiment-only",
        name: QueueJobs.TraceBatch,
        timestamp: new Date(),
        payload: {
          traces: ["first", "second"].map((traceId) => ({
            projectId: "sampled-project",
            traceId,
            minStart: 0,
            maxStart: 1,
            revision: "queued-revision",
          })),
        },
      },
    } as Job<TQueueJobTypes[QueueName.TraceBatch]>;

    await expect(traceBatchQueueProcessor(job, undefined)).resolves.toEqual({
      observationCount: 0,
      traceCount: 0,
      projectCount: 0,
      inputBytes: 0,
      outputBytes: 0,
      metadataBytes: 0,
      ioMetadataBytes: 0,
    });
    expect(getTraceBatchEventStream).not.toHaveBeenCalled();
    expect(inputStorage.put).not.toHaveBeenCalled();
    expect(topicsQueue.add).not.toHaveBeenCalled();
    expect(recordIncrement).toHaveBeenCalledWith(
      "langfuse.trace_batch.skipped_traces",
      2,
      { reason: "no_topics_project" },
    );
    expect(recordDistribution).not.toHaveBeenCalledWith(
      "langfuse.trace_batch.missing_trace_count",
      expect.anything(),
    );
  });

  it("reads only Topics projects from a mixed dispatched batch", async () => {
    env.LANGFUSE_TRACE_DISPATCH_ENABLED = "true";
    vi.mocked(isTopicsProjectEnabled).mockImplementation(
      (projectId) => projectId === "topics-project",
    );
    vi.mocked(getTraceBatchEventStream).mockImplementation(
      async function* () {},
    );
    const job = {
      opts: {},
      data: {
        id: "mixed",
        name: QueueJobs.TraceBatch,
        timestamp: new Date(),
        payload: {
          traces: [
            ["topics-project", "kept"],
            ["sampled-project", "skipped"],
          ].map(([projectId, traceId]) => ({
            projectId,
            traceId,
            minStart: 0,
            maxStart: 1,
            revision: "queued-revision",
          })),
        },
      },
    } as Job<TQueueJobTypes[QueueName.TraceBatch]>;

    await expect(
      traceBatchQueueProcessor(job, undefined),
    ).resolves.toMatchObject({ traceCount: 0 });
    expect(getTraceBatchEventStream).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        traces: [
          expect.objectContaining({
            projectId: "topics-project",
            traceId: "kept",
          }),
        ],
      }),
      expect.anything(),
    );
    expect(recordIncrement).toHaveBeenCalledWith(
      "langfuse.trace_batch.skipped_traces",
      1,
      { reason: "no_topics_project" },
    );
    expect(recordDistribution).toHaveBeenCalledWith(
      "langfuse.trace_batch.missing_trace_count",
      1,
    );
  });

  it("stores execution issues next to the transcript", async () => {
    vi.mocked(getTraceBatchEventStream).mockImplementation(async function* () {
      yield {
        project_id: "project",
        trace_id: "trace",
        environment: "default",
        span_id: "span",
        parent_span_id: null,
        start_time: "2026-09-11 00:00:00.000000",
        event_ts: "2026-09-11 00:00:00.000000",
        type: "GENERATION",
        name: "generation",
        input: JSON.stringify([{ role: "user", content: "Hi" }]),
        output: JSON.stringify({ role: "assistant", content: "Hello" }),
        metadata: {},
        level: "WARNING",
        status_message: "Rate limited, retried",
        tool_definitions: {},
        tool_calls: [],
        tool_call_names: [],
      };
    });
    const job = {
      data: {
        id: "issues",
        name: QueueJobs.TraceBatch,
        timestamp: new Date(),
        payload: {
          traces: [
            {
              projectId: "project",
              traceId: "trace",
              minStart: 0,
              maxStart: 1,
              revision: "queued-revision",
            },
          ],
        },
      },
    } as Job<TQueueJobTypes[QueueName.TraceBatch]>;

    await traceBatchQueueProcessor(job, undefined);

    expect(inputStorage.put).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      expect.objectContaining({
        executionIssues: [
          expect.objectContaining({
            observationId: "span",
            level: "WARNING",
            statusMessage: "Rate limited, retried",
          }),
        ],
      }),
    );
  });

  it("stores and enqueues a trace with each rule that samples it, deduplicated per revision", async () => {
    vi.mocked(getTraceBatchEventStream).mockImplementation(async function* () {
      for (const projectId of ["picked", "sampled-out", "no-rule"])
        yield {
          project_id: projectId,
          trace_id: "trace",
          environment: "default",
          span_id: "span",
          parent_span_id: null,
          start_time: "2026-09-11 00:00:00.000000",
          event_ts: "2026-09-11 00:00:00.000000",
          type: "GENERATION",
          name: "generation",
          input: JSON.stringify([{ role: "user", content: projectId }]),
          output: JSON.stringify({ role: "assistant", content: "answer" }),
          metadata: {},
          level: "DEFAULT",
          status_message: null,
          tool_definitions: {},
          tool_calls: [],
          tool_call_names: [],
        };
    });
    vi.mocked(listTopicRules).mockImplementation(async (projectId) =>
      projectId === "no-rule"
        ? []
        : [
            {
              id: "issues-rule",
              facetIds: ["issues"],
              sampling: projectId === "picked" ? 1 : 0,
            } as TopicRule,
            { id: "never", facetIds: ["intent"], sampling: 0 } as TopicRule,
          ],
    );
    const job = {
      data: {
        id: "rule",
        name: QueueJobs.TraceBatch,
        timestamp: new Date(),
        payload: {
          traces: ["picked", "sampled-out", "no-rule"].map((projectId) => ({
            projectId,
            traceId: "trace",
            minStart: 0,
            maxStart: 1,
            revision: `revision-${projectId}`,
          })),
        },
      },
    } as Job<TQueueJobTypes[QueueName.TraceBatch]>;

    await traceBatchQueueProcessor(job, undefined);

    // Traces no rule samples never reach ClickHouse.
    expect(getTraceBatchEventStream).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        traces: [expect.objectContaining({ projectId: "picked" })],
      }),
      expect.anything(),
    );
    expect(recordIncrement).toHaveBeenCalledWith(
      "langfuse.trace_batch.skipped_traces",
      1,
      { reason: "rule_sampling" },
    );
    expect(recordIncrement).toHaveBeenCalledWith(
      "langfuse.trace_batch.skipped_traces",
      1,
      { reason: "no_topics_project" },
    );
    expect(inputStorage.put).toHaveBeenCalledExactlyOnceWith(
      { projectId: "picked", traceId: "trace", revision: "revision-picked" },
      expect.objectContaining({
        transcript: expect.objectContaining({ threads: expect.any(Array) }),
      }),
    );
    expect(topicsQueue.add).toHaveBeenCalledExactlyOnceWith(
      QueueJobs.TopicsTraceJob,
      expect.objectContaining({
        name: QueueJobs.TopicsTraceJob,
        payload: {
          projectId: "picked",
          traceId: "trace",
          revision: "revision-picked",
          ruleIds: ["issues-rule"],
        },
      }),
      {
        deduplication: {
          id: JSON.stringify(["picked", "trace", "revision-picked"]),
          ttl: expect.any(Number),
        },
      },
    );
  });

  it("passes the session of the newest event that has one, breaking timestamp ties by span ID", async () => {
    vi.mocked(getTraceBatchEventStream).mockImplementation(async function* () {
      for (const [span, eventTs, sessionId] of [
        ["a", "2026-09-11 00:00:01.000000", "session-old"],
        ["b", "2026-09-11 00:00:02.000000", "session-new"],
        ["d", "2026-09-11 00:00:02.000000", "session-tie"],
        ["c", "2026-09-11 00:00:03.000000", ""],
      ])
        yield {
          project_id: "project",
          trace_id: "trace",
          session_id: sessionId,
          environment: `env-${span}`,
          span_id: span,
          parent_span_id: null,
          start_time: `2026-09-11 00:00:0${span === "d" ? "0" : "1"}.000000`,
          event_ts: eventTs,
          type: "GENERATION",
          name: `generation-${span}`,
          input: JSON.stringify([{ role: "user", content: span }]),
          output: JSON.stringify({ role: "assistant", content: "answer" }),
          metadata: {},
          level: "DEFAULT",
          status_message: null,
          tool_definitions: {},
          tool_calls: [],
          tool_call_names: [],
        };
    });
    const job = {
      data: {
        id: "session",
        name: QueueJobs.TraceBatch,
        timestamp: new Date(),
        payload: {
          traces: [
            {
              projectId: "project",
              traceId: "trace",
              minStart: 0,
              maxStart: 1,
              revision: "r",
            },
          ],
        },
      },
    } as Job<TQueueJobTypes[QueueName.TraceBatch]>;

    await traceBatchQueueProcessor(job, undefined);

    expect(inputStorage.put).toHaveBeenCalledWith(
      { projectId: "project", traceId: "trace", revision: "r" },
      expect.objectContaining({
        traceContext: {
          sessionId: "session-tie",
          traceTimestamp: "2026-09-11T00:00:00.000Z",
          environment: "env-c",
          traceName: "generation-a",
        },
      }),
    );
  });

  it("skips projects without enabled Topics models", async () => {
    const rows = [
      ["off", "trace-1"],
      ["on", "trace-1"],
      ["on", "trace-2"],
      ["on", "trace-3"],
    ] as const;
    vi.mocked(getTraceBatchEventStream).mockImplementation(async function* () {
      for (const [projectId, traceId] of rows)
        yield {
          project_id: projectId,
          trace_id: traceId,
          environment: "default",
          span_id: "span",
          parent_span_id: null,
          start_time: "2026-09-11 00:00:00.000000",
          event_ts: "2026-09-11 00:00:00.000000",
          type: "GENERATION",
          name: "generation",
          input: JSON.stringify([{ role: "user", content: traceId }]),
          output: JSON.stringify({ role: "assistant", content: "answer" }),
          metadata: {},
          level: "DEFAULT",
          status_message: null,
          tool_definitions: {},
          tool_calls: [],
          tool_call_names: [],
        };
    });
    const models = { projectId: "on" } as TopicsModels;
    vi.mocked(getEnabledTopicsModels).mockResolvedValueOnce(
      new Map([["on", models]]),
    );
    const job = {
      data: {
        id: "kill-switch",
        name: QueueJobs.TraceBatch,
        timestamp: new Date(),
        payload: {
          traces: rows.map(([projectId, traceId]) => ({
            projectId,
            traceId,
            minStart: 0,
            maxStart: 1,
            revision: "r",
          })),
        },
      },
    } as Job<TQueueJobTypes[QueueName.TraceBatch]>;

    await traceBatchQueueProcessor(job, undefined);

    // One Postgres read for the whole batch, deduplicated by project.
    expect(getEnabledTopicsModels).toHaveBeenCalledExactlyOnceWith([
      "off",
      "on",
    ]);
    expect(listTopicRules).toHaveBeenCalledExactlyOnceWith("on");
    expect(inputStorage.put.mock.calls.map(([reference]) => reference)).toEqual(
      ["trace-1", "trace-2", "trace-3"].map((traceId) => ({
        projectId: "on",
        traceId,
        revision: "r",
      })),
    );
    expect(topicsQueue.add).toHaveBeenCalledTimes(3);
    expect(recordIncrement).toHaveBeenCalledWith(
      "langfuse.topics.trace_outcomes",
      1,
      { source: "trace_batch", outcome: "disabled" },
    );
    expect(recordIncrement).toHaveBeenCalledWith(
      "langfuse.trace_batch.skipped_traces",
      1,
      { reason: "no_topics_project" },
    );
  });

  it("uses the latest environment to exclude internal traces from Topics and storage", async () => {
    const originalRecordTraceBatchTranscript =
      traceBatchTranscript.recordTraceBatchTranscript;
    const assembledContexts: Array<{
      traceId: string | undefined;
      context: TranscriptContext | null;
    }> = [];
    vi.spyOn(
      traceBatchTranscript,
      "recordTraceBatchTranscript",
    ).mockImplementation(async (observations, onTranscript) =>
      originalRecordTraceBatchTranscript(observations, async (context) => {
        assembledContexts.push({
          traceId: observations[0]?.traceId,
          context,
        });
        await onTranscript?.(context);
      }),
    );
    const userMessage = { role: "user", content: "first question" };
    const answer = { role: "assistant", content: "first answer" };
    const row = {
      project_id: "a",
      trace_id: "shared-trace",
      environment: "langfuse-topics",
      span_id: "first",
      parent_span_id: null,
      start_time: "2026-09-11 00:00:00.000000",
      event_ts: "2026-09-11 00:00:00.000002",
      type: "GENERATION",
      name: "generation",
      input: JSON.stringify([userMessage]),
      output: JSON.stringify(answer),
      metadata: {},
      level: "DEFAULT",
      status_message: null,
      tool_definitions: {},
      tool_calls: [],
      tool_call_names: [],
    };
    vi.mocked(getTraceBatchEventStream).mockImplementation(async function* () {
      // SQL groups traces but does not order observations within a trace.
      yield {
        ...row,
        span_id: "second",
        environment: "production",
        event_ts: "2026-09-11 00:00:00.000001",
        start_time: "2026-09-11 00:01:00.000000",
        input: JSON.stringify([
          userMessage,
          answer,
          { role: "user", content: "second question" },
        ]),
        output: JSON.stringify({ role: "assistant", content: "second answer" }),
      };
      // The newer internal event has an earlier start time and smaller span ID.
      yield row;
      yield {
        ...row,
        project_id: "b",
        environment: "langfuse-topics",
        type: "SPAN",
      };
      yield {
        ...row,
        project_id: "b",
        environment: "production",
        type: "SPAN",
        span_id: "second",
      };
    });
    const job = {
      data: {
        id: "transcripts",
        name: QueueJobs.TraceBatch,
        timestamp: new Date(),
        payload: {
          traces: ["a", "b"].map((projectId) => ({
            projectId,
            traceId: "shared-trace",
            minStart: 0,
            maxStart: 1,
            revision: "r",
          })),
        },
      },
    } as Job<TQueueJobTypes[QueueName.TraceBatch]>;
    await traceBatchQueueProcessor(job, undefined);
    expect(
      topicsQueue.add.mock.calls.map(([, data]) => data.payload.projectId),
    ).toEqual(["b"]);
    expect(inputStorage.put.mock.calls.map(([reference]) => reference)).toEqual(
      [{ projectId: "b", traceId: "shared-trace", revision: "r" }],
    );
    const assembledTranscript = assembledContexts.find(
      ({ context }) => context !== null,
    )?.context?.transcript;
    if (!assembledTranscript)
      throw new Error("Expected an assembled transcript for the user trace");
    const serializedTranscript = JSON.stringify(assembledTranscript);
    for (const content of [
      "first question",
      "first answer",
      "second question",
      "second answer",
    ]) {
      expect(serializedTranscript.split(content)).toHaveLength(2);
    }
    const spans = exporter
      .getFinishedSpans()
      .filter((span) => span.name === "trace-batch-transcript");
    expect(spans).toHaveLength(2);
    for (const [index, projectId] of ["a", "b"].entries()) {
      const span = spans[index];
      expect(span.name).toBe("trace-batch-transcript");
      expect(span.attributes).toMatchObject({
        "langfuse.project.id": projectId,
        "langfuse.trace.id": "shared-trace",
        "langfuse.trace_batch.observation_count": 2,
        "langfuse.trace_batch.has_transcript": index === 0,
        "langfuse.trace_batch.transcript_content_characters":
          index === 0 ? expect.any(Number) : 0,
        "langfuse.trace_batch.transcript_tool_response_characters":
          index === 0 ? expect.any(Number) : 0,
        "langfuse.trace_batch.transcript_thread_count": index === 0 ? 1 : 0,
        "langfuse.trace_batch.transcript_characters":
          index === 0 ? expect.any(Number) : 0,
        "langfuse.trace_batch.transcript_assembly_duration_ms":
          expect.any(Number),
      });
      const url = new URL(String(span.attributes["langfuse.trace.url"]));
      expect(url.pathname).toBe(`/project/${projectId}/traces`);
      expect(url.searchParams.get("peek")).toBe("shared-trace");
      expect(JSON.stringify(span.attributes)).not.toContain("first question");
    }
  });
  it("discards jobs before parsing when both pipelines are disabled", async () => {
    vi.mocked(isTopicsEnabled).mockReturnValue(false);
    const job = {
      opts: {},
      data: { incompatiblePayload: true },
    } as unknown as Job<TQueueJobTypes[QueueName.TraceBatch]>;

    await expect(traceBatchQueueProcessor(job, undefined)).resolves.toEqual({
      discarded: "pipelines_disabled",
    });
    expect(getTraceBatchEventStream).not.toHaveBeenCalled();
    expect(inputStorage.put).not.toHaveBeenCalled();
    expect(job.opts.removeOnComplete).toBe(true);
  });

  it("discards self-hosted jobs before parsing even when reads are enabled", async () => {
    env.LANGFUSE_TRACE_BATCH_EXPERIMENT_ID = "discarded-read";
    env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;
    const job = {
      opts: {},
      data: { incompatiblePayload: true },
    } as unknown as Job<TQueueJobTypes[QueueName.TraceBatch]>;
    await expect(traceBatchQueueProcessor(job, undefined)).resolves.toEqual({
      discarded: "not_cloud",
    });
    expect(getTraceBatchEventStream).not.toHaveBeenCalled();
    expect(recordIncrement).toHaveBeenCalledExactlyOnceWith(
      "langfuse.trace_batch.discarded_jobs",
      1,
      { reason: "not_cloud" },
    );
    expect(recordDistribution).not.toHaveBeenCalled();
    expect(recordGauge).not.toHaveBeenCalled();
    expect(job.opts.removeOnComplete).toBe(true);
    expect(processingSpan.setAttributes).toHaveBeenCalledWith(
      expect.objectContaining({ "langfuse.trace_batch.outcome": "discard" }),
    );
    expect(processingSpan.setAttributes).not.toHaveBeenCalledWith(
      expect.objectContaining({
        "langfuse.trace_batch.observation_count": expect.any(Number),
      }),
    );
  });

  it("discards an expired batch before querying, including on retry", async () => {
    const job = {
      opts: {},
      data: {
        id: "expired",
        name: QueueJobs.TraceBatch,
        timestamp: new Date(Date.now() - 3 * 60 * 60_000).toISOString(),
        payload: {
          traces: [
            {
              projectId: "project",
              traceId: "trace",
              minStart: 0,
              maxStart: 1,
              revision: "r",
            },
          ],
        },
      },
    } as unknown as Job<TQueueJobTypes[QueueName.TraceBatch]>;
    for (let attempt = 0; attempt < 2; attempt++) {
      await expect(traceBatchQueueProcessor(job, undefined)).resolves.toEqual({
        discarded: "expired",
      });
    }
    expect(getTraceBatchEventStream).not.toHaveBeenCalled();
    expect(vi.mocked(recordIncrement).mock.calls).toEqual([
      ["langfuse.trace_batch.discarded_jobs", 1, { reason: "expired" }],
      ["langfuse.trace_batch.discarded_jobs", 1, { reason: "expired" }],
    ]);
    expect(recordDistribution).not.toHaveBeenCalled();
    expect(recordGauge).not.toHaveBeenCalled();
    expect(job.opts.removeOnComplete).toBe(true);
  });

  it("forwards overrides and rejects a partially consumed stream without reporting success", async () => {
    const originalEnv = { ...env };
    Object.assign(env, {
      LANGFUSE_TRACE_BATCH_MAX_THREADS: 1,
      LANGFUSE_TRACE_BATCH_MAX_BLOCK_SIZE: 512,
      LANGFUSE_TRACE_BATCH_REQUEST_TIMEOUT_MS: 45_000,
      LANGFUSE_TRACE_BATCH_EXPERIMENT_ID: "arm-b",
      BUILD_ID: "test-build",
    });
    const log = vi.spyOn(logger, "info").mockImplementation(() => logger);
    const failure = new Error("query failed");
    vi.mocked(getTraceBatchEventStream).mockImplementation(async function* () {
      expect(processingSpan.setAttributes).toHaveBeenCalledWith(
        expect.objectContaining({
          "langfuse.trace_batch.batch_trace_count": 2,
          "langfuse.trace_batch.batch_project_count": 2,
          "langfuse.trace_batch.event_time_span_ms": 11_000,
          "langfuse.trace_batch.max_trace_span_ms": 3_000,
        }),
      );
      // Completion must annotate the processing span captured before child work.
      vi.mocked(getCurrentSpan).mockReturnValue(undefined);
      yield {
        project_id: "project",
        trace_id: "trace",
        environment: "default",
        span_id: "span",
        parent_span_id: null,
        start_time: "2026-09-11 00:00:00.000000",
        event_ts: "2026-09-11 00:00:00.000000",
        type: "GENERATION",
        name: "generation",
        input: "input",
        output: "output",
        metadata: { é: "界🙂" },
        level: "DEFAULT",
        status_message: null,
        tool_definitions: {},
        tool_calls: [],
        tool_call_names: [],
      };
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
        {
          projectId: "other",
          traceId: "trace",
          minStart: 9_000,
          maxStart: 12_000,
          revision: "r",
        },
      ],
    };
    const job = {
      id: "batch-job",
      attemptsMade: 1,
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
        maxThreads: 1,
        maxBlockSize: 512,
        requestTimeoutMs: 45_000,
        experimentId: "arm-b",
        queryId: expect.any(String),
      });
      expect(processingSpan.setAttributes).toHaveBeenCalledWith(
        expect.objectContaining({
          "langfuse.trace_batch.experiment_id": "arm-b",
          "langfuse.trace_batch.job_id": "batch-job",
          "langfuse.trace_batch.attempt": 2,
        }),
      );
      expect(processingSpan.setAttributes).toHaveBeenCalledWith(
        expect.objectContaining({
          "langfuse.trace_batch.query_id": vi.mocked(getTraceBatchEventStream)
            .mock.lastCall![1]!.queryId,
        }),
      );
      expect(processingSpan.setAttributes).toHaveBeenLastCalledWith({
        "langfuse.trace_batch.outcome": "failure",
        "langfuse.trace_batch.duration_ms": expect.any(Number),
        "langfuse.trace_batch.observation_count": 1,
        "langfuse.trace_batch.found_trace_count": 1,
        "langfuse.trace_batch.found_project_count": 1,
        "langfuse.trace_batch.input_bytes": 5,
        "langfuse.trace_batch.output_bytes": 6,
        "langfuse.trace_batch.metadata_bytes": 9,
        "langfuse.trace_batch.partial": true,
      });
      expect(log).toHaveBeenCalledWith(
        "Trace batch experiment read",
        expect.objectContaining({
          experimentId: "arm-b",
          buildId: "test-build",
          maxThreads: 1,
          maxBlockSize: 512,
          batchTraceCount: 2,
          jobId: "batch-job",
          attempt: 2,
          queryId: vi.mocked(getTraceBatchEventStream).mock.lastCall![1]!
            .queryId,
        }),
      );
      expect(log).toHaveBeenCalledWith(
        "Trace batch experiment read completed",
        expect.objectContaining({
          jobId: "batch-job",
          attempt: 2,
          queryId: vi.mocked(getTraceBatchEventStream).mock.lastCall![1]!
            .queryId,
          outcome: "failure",
          batchTraceCount: 2,
          batchProjectCount: 2,
          eventTimeSpanMs: 11_000,
          maxTraceSpanMs: 3_000,
          observationCount: 1,
          foundTraceCount: 1,
          foundProjectCount: 1,
          inputBytes: 5,
          outputBytes: 6,
          metadataBytes: 9,
          partial: true,
          durationMs: expect.any(Number),
        }),
      );
      expect(vi.mocked(recordDistribution).mock.calls).toEqual([
        ["langfuse.trace_batch.failed_read_observation_count", 1],
        ["langfuse.trace_batch.failed_read_input_bytes", 5],
      ]);
      expect(recordIncrement).not.toHaveBeenCalled();
    } finally {
      env.LANGFUSE_TRACE_BATCH_MAX_THREADS =
        originalEnv.LANGFUSE_TRACE_BATCH_MAX_THREADS;
      env.LANGFUSE_TRACE_BATCH_MAX_BLOCK_SIZE =
        originalEnv.LANGFUSE_TRACE_BATCH_MAX_BLOCK_SIZE;
      env.LANGFUSE_TRACE_BATCH_REQUEST_TIMEOUT_MS =
        originalEnv.LANGFUSE_TRACE_BATCH_REQUEST_TIMEOUT_MS;
      env.LANGFUSE_TRACE_BATCH_EXPERIMENT_ID =
        originalEnv.LANGFUSE_TRACE_BATCH_EXPERIMENT_ID;
      env.BUILD_ID = originalEnv.BUILD_ID;
    }
  });
  it.each([false, true])(
    "records partial-read metrics once when transcript processing fails (stream also fails: %s)",
    async (streamFails) => {
      const summaryError = new Error("transcript assembly failed");
      const streamError = new Error("stream failed");
      vi.spyOn(
        traceBatchTranscript,
        "recordTraceBatchTranscript",
      ).mockRejectedValue(summaryError);
      vi.mocked(getTraceBatchEventStream).mockImplementation(
        async function* () {
          for (const traceId of ["a", "b"]) {
            yield {
              project_id: "project",
              trace_id: traceId,
              environment: "default",
              span_id: traceId,
              parent_span_id: null,
              start_time: "2026-09-11 00:00:00.000000",
              event_ts: "2026-09-11 00:00:00.000000",
              type: "GENERATION",
              name: "generation",
              input: "hello",
              output: "",
              metadata: {},
              level: "DEFAULT",
              status_message: null,
              tool_definitions: {},
              tool_calls: [],
              tool_call_names: [],
            };
          }
          if (streamFails) throw streamError;
        },
      );
      const job = {
        data: {
          id: "failed-transcript",
          name: QueueJobs.TraceBatch,
          timestamp: new Date(),
          payload: {
            traces: ["a", "b"].map((traceId) => ({
              projectId: "project",
              traceId,
              minStart: 0,
              maxStart: 1,
              revision: "r",
            })),
          },
        },
      } as Job<TQueueJobTypes[QueueName.TraceBatch]>;
      await expect(traceBatchQueueProcessor(job, undefined)).rejects.toBe(
        streamFails ? streamError : summaryError,
      );
      expect(
        vi
          .mocked(recordDistribution)
          .mock.calls.filter(([name]) =>
            name.startsWith("langfuse.trace_batch.failed_read_"),
          ),
      ).toEqual([
        ["langfuse.trace_batch.failed_read_observation_count", 2],
        ["langfuse.trace_batch.failed_read_input_bytes", 10],
      ]);
      expect(recordDistribution).not.toHaveBeenCalledWith(
        "langfuse.trace_batch.observation_count",
        expect.any(Number),
      );
      expect(inputStorage.put).not.toHaveBeenCalled();
      expect(recordGauge).toHaveBeenLastCalledWith(
        "langfuse.trace_batch.active_reads",
        0,
      );
    },
  );
  it("retains the active read count when overlapping reads succeed or fail", async () => {
    env.LANGFUSE_TRACE_BATCH_EXPERIMENT_ID = "overlapping";
    const log = vi.spyOn(logger, "info").mockImplementation(() => logger);
    const first = Promise.withResolvers<void>();
    const second = Promise.withResolvers<void>();
    const failure = new Error("stream failed");
    vi.mocked(getTraceBatchEventStream)
      .mockImplementationOnce(async function* () {
        await first.promise;
      })
      .mockImplementationOnce(async function* () {
        await second.promise;
        throw failure;
      });
    const job = {
      data: {
        id: "batch",
        name: QueueJobs.TraceBatch,
        timestamp: new Date(),
        payload: {
          traces: [
            {
              projectId: "project",
              traceId: "trace",
              minStart: 0,
              maxStart: 1,
              revision: "r",
            },
          ],
        },
      },
    } as Job<TQueueJobTypes[QueueName.TraceBatch]>;

    const successfulRead = traceBatchQueueProcessor(job, undefined);
    const failedRead = traceBatchQueueProcessor(job, undefined);
    // Both reads pass the Topics settings lookup before they start streaming.
    await vi.waitFor(() =>
      expect(recordGauge).toHaveBeenLastCalledWith(
        "langfuse.trace_batch.active_reads",
        2,
      ),
    );
    // Periodic samples keep unchanged, long-running reads visible.
    recordTraceBatchActiveReads();
    first.resolve();
    await successfulRead;
    expect(recordGauge).toHaveBeenLastCalledWith(
      "langfuse.trace_batch.active_reads",
      1,
    );
    second.resolve();
    await expect(failedRead).rejects.toBe(failure);
    for (const outcome of ["success", "failure"]) {
      expect(log).toHaveBeenCalledWith(
        "Trace batch experiment read completed",
        expect.objectContaining({
          outcome,
          batchTraceCount: 1,
          batchProjectCount: 1,
          eventTimeSpanMs: 1,
          maxTraceSpanMs: 1,
          observationCount: 0,
          foundTraceCount: 0,
          foundProjectCount: 0,
          inputBytes: 0,
          outputBytes: 0,
          metadataBytes: 0,
          partial: outcome === "failure",
        }),
      );
    }
    expect(vi.mocked(recordGauge).mock.calls).toEqual([
      ["langfuse.trace_batch.active_reads", 1],
      ["langfuse.trace_batch.active_reads", 2],
      ["langfuse.trace_batch.active_reads", 2],
      ["langfuse.trace_batch.active_reads", 1],
      ["langfuse.trace_batch.active_reads", 0],
    ]);
    expect(recordIncrement).not.toHaveBeenCalled();
  });
  it("counts project/trace pairs with producers disabled and safely repeats reads without retaining payloads", async () => {
    env.LANGFUSE_TRACE_BATCH_EXPERIMENT_ID = "successful-read";
    const log = vi.spyOn(logger, "info").mockImplementation(() => logger);
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
        ].map(([projectId, traceId], index) => ({
          projectId,
          traceId,
          minStart: 1_000 + index * 10_000,
          maxStart: 2_000 + index * 11_000,
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
              environment: "default",
              span_id: `span-${yieldedRows}`,
              parent_span_id: null,
              start_time: "2026-09-11 00:00:00.000000",
              event_ts: "2026-09-11 00:00:00.000000",
              type: "GENERATION",
              name: "generation",
              input: "hello",
              output: "世界",
              metadata: { é: "界🙂" },
              level: "DEFAULT",
              status_message: null,
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
            inputBytes: 20,
            outputBytes: 24,
            metadataBytes: 36,
            ioMetadataBytes: 80,
          },
        );
      }
      expect(getTraceBatchEventStream).toHaveBeenCalledTimes(2);
      expect(getTraceBatchEventStream).toHaveBeenCalledWith(
        payload,
        expect.anything(),
      );
      expect(yieldedRows).toBe(8);
      expect(processingSpan.setAttributes).toHaveBeenLastCalledWith({
        "langfuse.trace_batch.outcome": "success",
        "langfuse.trace_batch.duration_ms": expect.any(Number),
        "langfuse.trace_batch.observation_count": 4,
        "langfuse.trace_batch.found_trace_count": 3,
        "langfuse.trace_batch.found_project_count": 2,
        "langfuse.trace_batch.input_bytes": 20,
        "langfuse.trace_batch.output_bytes": 24,
        "langfuse.trace_batch.metadata_bytes": 36,
        "langfuse.trace_batch.partial": false,
      });
      expect(log).toHaveBeenCalledWith(
        "Trace batch experiment read completed",
        expect.objectContaining({
          outcome: "success",
          batchTraceCount: 5,
          batchProjectCount: 3,
          eventTimeSpanMs: 45_000,
          maxTraceSpanMs: 5_000,
          observationCount: 4,
          foundTraceCount: 3,
          foundProjectCount: 2,
          inputBytes: 20,
          outputBytes: 24,
          metadataBytes: 36,
          partial: false,
          durationMs: expect.any(Number),
        }),
      );
      for (const [name, bytes] of [
        ["input_bytes", 20],
        ["output_bytes", 24],
        ["metadata_bytes", 36],
      ] as const) {
        expect(
          vi
            .mocked(recordDistribution)
            .mock.calls.filter(
              ([metric]) => metric === `langfuse.trace_batch.${name}`,
            )
            .map(([, value]) => value),
        ).toEqual([bytes, bytes]);
      }
      expect(recordDistribution).not.toHaveBeenCalledWith(
        "langfuse.trace_batch.io_metadata_bytes",
        expect.anything(),
      );
      expect(recordDistribution).not.toHaveBeenCalledWith(
        "langfuse.trace_batch.found_project_count",
        expect.anything(),
      );
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
      env.LANGFUSE_TRACE_BATCH_EXPERIMENT_ID = hasRows ? undefined : "no-span";
      if (!hasRows) vi.mocked(getCurrentSpan).mockReturnValue(undefined);
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
            environment: "default",
            span_id: "span",
            parent_span_id: null,
            start_time: "2026-09-11 00:00:00.000000",
            event_ts: "2026-09-11 00:00:00.000000",
            type: "GENERATION",
            name: "generation",
            input: "hello",
            output: "world",
            metadata: {},
            level: "DEFAULT",
            status_message: null,
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
        inputBytes: hasRows ? 5 : 0,
        outputBytes: hasRows ? 5 : 0,
        metadataBytes: 0,
        ioMetadataBytes: hasRows ? 10 : 0,
      });
      // Only Topics batch totals; no experiment attributes without an experiment.
      expect(vi.mocked(processingSpan.setAttributes).mock.calls).toEqual(
        hasRows ? [[{ "langfuse.topics.traces.queued": 1 }]] : [],
      );
      expect(recordDistribution).toHaveBeenCalledWith(
        "langfuse.trace_batch.input_bytes",
        hasRows ? 5 : 0,
      );
      expect(recordDistribution).toHaveBeenCalledWith(
        "langfuse.trace_batch.output_bytes",
        hasRows ? 5 : 0,
      );
      expect(recordDistribution).toHaveBeenCalledWith(
        "langfuse.trace_batch.metadata_bytes",
        0,
      );
      expect(recordDistribution).not.toHaveBeenCalledWith(
        "langfuse.trace_batch.found_project_count",
        expect.anything(),
      );
      expect(getTraceBatchEventStream).toHaveBeenCalledWith(
        { traces: [{ ...trace, projectId: "project" }] },
        expect.anything(),
      );
    },
  );
});
