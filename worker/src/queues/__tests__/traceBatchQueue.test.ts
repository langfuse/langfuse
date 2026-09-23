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
  type TQueueJobTypes,
} from "@langfuse/shared/src/server";
import { env } from "../../env";
import { tokenCountAsync } from "../../features/tokenisation/async-usage";
import { tokenCount } from "../../features/tokenisation/usage";
import { recordTraceBatchTranscript } from "../../features/traceBatching/traceBatchTranscript";
import {
  recordTraceBatchActiveReads,
  traceBatchQueueProcessor,
} from "../traceBatchQueue";

vi.mock("@langfuse/shared/src/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@langfuse/shared/src/server")>()),
  getTraceBatchEventStream: vi.fn(),
  getCurrentSpan: vi.fn(),
  recordDistribution: vi.fn(),
  recordGauge: vi.fn(),
  recordIncrement: vi.fn(),
}));

// Exercise real tokenization without starting the compiled worker-thread pool.
vi.mock("../../features/tokenisation/async-usage", () => ({
  tokenCountAsync: vi.fn(async (params) => tokenCount(params)),
}));

const originalReadEnabled = env.LANGFUSE_TRACE_BATCH_READ_ENABLED;
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
  env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "DEV";
  vi.mocked(getCurrentSpan).mockReturnValue(processingSpan);
  vi.spyOn(processingSpan, "setAttributes");
});
afterEach(() => {
  env.LANGFUSE_TRACE_BATCH_READ_ENABLED = originalReadEnabled;
  env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalCloudRegion;
  env.LANGFUSE_TRACE_BATCH_EXPERIMENT_ID = originalExperimentId;
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("trace batch queue", () => {
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
    await recordTraceBatchTranscript([
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
    ]);
    const estimates = vi
      .mocked(tokenCountAsync)
      .mock.calls.map(([params]) => params);
    expect(estimates).toHaveLength(4);
    const [full, current, historyOnly, tools] = estimates.map(({ text }) =>
      JSON.stringify(text),
    );
    expect(full.split("tool payload")).toHaveLength(2);
    expect(current).not.toContain("earlier question");
    expect(current).toContain("current question");
    expect(current).toContain("independent question");
    expect(historyOnly).toContain("earlier question");
    expect(historyOnly).not.toContain("current question");
    expect(tools.split("tool payload")).toHaveLength(2);
    expect(tools).not.toContain("current question");
    expect(recordDistribution).toHaveBeenCalledWith(
      "langfuse.trace_batch.transcript_thread_count",
      2,
    );
    for (const [index, suffix] of [
      "tokens",
      "current_turn_tokens",
      "history_tokens",
      "tool_response_tokens",
    ].entries()) {
      expect(recordDistribution).toHaveBeenCalledWith(
        `langfuse.trace_batch.transcript_${suffix}`,
        tokenCount(estimates[index]),
        { tokenizer: "o200k_base" },
      );
    }
    const span = exporter.getFinishedSpans()[0];
    let phaseTotal = 0;
    for (const phase of ["normalization", "matching"]) {
      const duration = span.attributes[
        `langfuse.trace_batch.transcript_assembly_${phase}_duration_ms`
      ] as number;
      expect(duration).toBeGreaterThanOrEqual(0);
      phaseTotal += duration;
      expect(recordDistribution).toHaveBeenCalledWith(
        "langfuse.trace_batch.transcript_assembly_phase_duration_ms",
        duration,
        { phase },
      );
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
    const estimates = vi.mocked(tokenCountAsync).mock.calls;
    expect(estimates).toHaveLength(2);
    expect(JSON.stringify(estimates[1][0].text)).toContain("tool payload");
    expect(JSON.stringify(estimates[1][0].text)).not.toContain(
      "Please explain",
    );
    expect(recordDistribution).toHaveBeenCalledWith(
      "langfuse.trace_batch.transcript_history_tokens",
      0,
      { tokenizer: "o200k_base" },
    );
  });

  it.each(["unavailable", "failed"])(
    "retains the full estimate when a breakdown is %s",
    async (outcome) => {
      vi.mocked(tokenCountAsync).mockResolvedValueOnce(100);
      if (outcome === "unavailable")
        vi.mocked(tokenCountAsync).mockResolvedValueOnce(undefined);
      else
        vi.mocked(tokenCountAsync).mockRejectedValueOnce(
          new Error("tokenizer failed"),
        );
      await recordTraceBatchTranscript([
        convertObservation(
          createObservation({
            type: "GENERATION",
            trace_id: "trace",
            input: JSON.stringify([
              { role: "assistant", content: "history" },
              { role: "user", content: "question" },
            ]),
            output: "answer",
          }),
        ),
      ]);
      const span = exporter.getFinishedSpans()[0];
      expect(span.attributes["langfuse.trace_batch.transcript_tokens"]).toBe(
        100,
      );
      expect(span.attributes).not.toHaveProperty(
        "langfuse.trace_batch.transcript_current_turn_tokens",
      );
      expect(span.attributes["langfuse.trace_batch.token_estimation"]).toBe(
        outcome,
      );
      expect(recordIncrement).toHaveBeenCalledWith(
        `langfuse.trace_batch.token_estimation_${outcome}`,
        1,
      );
    },
  );

  it.each([false, true])(
    "overlaps one tokenization with streaming, bounds pending work and drains it (stream fails: %s)",
    async (streamFails) => {
      let resolveFirst!: (tokens: number) => void;
      let rejectSecond!: (error: Error) => void;
      let cleaningUp = false;
      vi.mocked(tokenCountAsync)
        .mockImplementationOnce(
          () => new Promise<number>((resolve) => (resolveFirst = resolve)),
        )
        .mockImplementationOnce(() =>
          cleaningUp
            ? Promise.resolve(0)
            : new Promise<number>((_, reject) => (rejectSecond = reject)),
        );
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
              span_id: `span-${index}`,
              parent_span_id: null,
              start_time: "2026-09-11 00:00:00.000000",
              event_ts: "2026-09-11 00:00:00.000000",
              type: traceId === "c" ? "SPAN" : "GENERATION",
              name: "generation",
              input: "hello",
              output: "world",
              metadata: {},
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
          id: "bounded-tokenization",
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
        // While a is being tokenized, all of b can arrive. At c's boundary,
        // processing waits for a before submitting b to the tokenizer pool.
        await vi.waitFor(() => expect(suppliedThirdTrace).toBe(true));
        expect(reachedEnd).toBe(false);
        expect(tokenCountAsync).toHaveBeenCalledTimes(1);
        expect(exporter.getFinishedSpans()).toHaveLength(0);
        resolveFirst(100);
        await vi.waitFor(() => expect(reachedEnd).toBe(true));
        expect(tokenCountAsync).toHaveBeenCalledTimes(2);
        expect(settled).toBe(false);
        // An unavailable token estimate must not retry a whole batch or mask
        // the original stream failure; its promise is drained before returning.
        rejectSecond(new Error("token count timed out"));
        const outcome = await processing;
        expect(outcome.error).toBe(streamFails ? failure : undefined);
        const spans = exporter.getFinishedSpans();
        expect(spans).toHaveLength(streamFails ? 2 : 3);
        expect(spans[0].attributes).toMatchObject({
          "langfuse.trace.id": "a",
          "langfuse.trace_batch.transcript_tokens": 100,
        });
        expect(spans[1].attributes).toMatchObject({
          "langfuse.trace.id": "b",
          "langfuse.trace_batch.token_estimation": "failed",
        });
        expect(spans[1].status.code).toBe(SpanStatusCode.UNSET);
        expect(spans[1].attributes).not.toHaveProperty(
          "langfuse.trace_batch.transcript_tokens",
        );
        expect(
          spans[1].attributes["langfuse.trace_batch.transcript_characters"],
        ).toBeGreaterThan(0);
        for (const span of spans) {
          expect(span.parentSpanContext?.spanId).toBe(
            processingSpan.spanContext().spanId,
          );
        }
        expect(recordIncrement).toHaveBeenCalledWith(
          "langfuse.trace_batch.token_estimation_failed",
          1,
        );
        expect(
          vi
            .mocked(recordDistribution)
            .mock.calls.filter(
              ([name]) =>
                name === "langfuse.trace_batch.transcript_assembly_duration_ms",
            ),
        ).toHaveLength(streamFails ? 2 : 3);
      } finally {
        cleaningUp = true;
        resolveFirst?.(100);
        rejectSecond?.(new Error("test cleanup"));
        await processing;
      }
    },
  );
  it("assembles each tenant's trace at the boundary and EOF, tokenizing only the transcript", async () => {
    const userMessage = { role: "user", content: "first question" };
    const answer = { role: "assistant", content: "first answer" };
    const row = {
      project_id: "a",
      trace_id: "shared-trace",
      span_id: "first",
      parent_span_id: null,
      start_time: "2026-09-11 00:00:00.000000",
      event_ts: "2026-09-11 00:00:00.000000",
      type: "GENERATION",
      name: "generation",
      input: JSON.stringify([userMessage]),
      output: JSON.stringify(answer),
      metadata: {},
      tool_definitions: {},
      tool_calls: [],
      tool_call_names: [],
    };
    vi.mocked(getTraceBatchEventStream).mockImplementation(async function* () {
      // SQL groups traces but does not order observations within a trace.
      yield {
        ...row,
        span_id: "second",
        start_time: "2026-09-11 00:01:00.000000",
        input: JSON.stringify([
          userMessage,
          answer,
          { role: "user", content: "second question" },
        ]),
        output: JSON.stringify({ role: "assistant", content: "second answer" }),
      };
      yield row;
      expect(tokenCountAsync).not.toHaveBeenCalled();
      yield { ...row, project_id: "b", type: "SPAN" };
      // The first trace is processed before requesting more stream rows.
      expect(tokenCountAsync).toHaveBeenCalledTimes(1);
      yield { ...row, project_id: "b", type: "SPAN", span_id: "second" };
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
    const estimates = vi.mocked(tokenCountAsync).mock.calls;
    expect(estimates).toHaveLength(1);
    const serializedTranscript = JSON.stringify(estimates[0][0].text);
    for (const content of [
      "first question",
      "first answer",
      "second question",
      "second answer",
    ]) {
      expect(serializedTranscript.split(content)).toHaveLength(2);
    }
    expect(recordDistribution).toHaveBeenCalledWith(
      "langfuse.trace_batch.transcript_tokens",
      tokenCount(estimates[0][0]),
      { tokenizer: "o200k_base" },
    );
    expect(recordDistribution).toHaveBeenCalledWith(
      "langfuse.trace_batch.transcript_tokens",
      0,
      { tokenizer: "o200k_base" },
    );
    for (const suffix of ["current_turn", "history", "tool_response"]) {
      expect(recordDistribution).toHaveBeenCalledWith(
        `langfuse.trace_batch.transcript_${suffix}_tokens`,
        0,
        { tokenizer: "o200k_base" },
      );
    }
    expect(recordDistribution).toHaveBeenCalledWith(
      "langfuse.trace_batch.transcript_thread_count",
      0,
    );
    for (const hasTranscript of ["true", "false"]) {
      expect(recordDistribution).toHaveBeenCalledWith(
        "langfuse.trace_batch.transcript_assembly_duration_ms",
        expect.any(Number),
        { has_transcript: hasTranscript },
      );
    }
    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(2);
    for (const [index, projectId] of ["a", "b"].entries()) {
      const span = spans[index];
      expect(span.name).toBe("trace-batch-transcript");
      expect(span.attributes).toMatchObject({
        "langfuse.project.id": projectId,
        "langfuse.trace.id": "shared-trace",
        "langfuse.trace_batch.observation_count": 2,
        "langfuse.trace_batch.has_transcript": index === 0,
        "langfuse.trace_batch.transcript_tokens":
          index === 0 ? tokenCount(estimates[0][0]) : 0,
        "langfuse.trace_batch.transcript_characters":
          index === 0 ? serializedTranscript.length : 0,
        "langfuse.trace_batch.transcript_assembly_duration_ms":
          expect.any(Number),
      });
      const url = new URL(String(span.attributes["langfuse.trace.url"]));
      expect(url.pathname).toBe(`/project/${projectId}/traces`);
      expect(url.searchParams.get("peek")).toBe("shared-trace");
      expect(JSON.stringify(span.attributes)).not.toContain("first question");
    }
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
    expect(recordIncrement).toHaveBeenCalledWith(
      "langfuse.trace_batch.read_attempts",
      1,
      { outcome: "discard" },
    );
    expect(recordDistribution).toHaveBeenCalledExactlyOnceWith(
      "langfuse.trace_batch.read_duration_ms",
      expect.any(Number),
      { outcome: "discard" },
    );
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
    expect(vi.mocked(recordDistribution).mock.calls).toEqual([
      [
        "langfuse.trace_batch.read_duration_ms",
        expect.any(Number),
        { outcome: "discard" },
      ],
      [
        "langfuse.trace_batch.read_duration_ms",
        expect.any(Number),
        { outcome: "discard" },
      ],
    ]);
    expect(recordGauge).not.toHaveBeenCalled();
    expect(job.opts.removeOnComplete).toBe(true);
  });

  it("forwards overrides and rejects a partially consumed stream without reporting success", async () => {
    const originalEnv = { ...env };
    Object.assign(env, {
      LANGFUSE_TRACE_BATCH_MAX_THREADS: 1,
      LANGFUSE_TRACE_BATCH_MAX_BLOCK_SIZE: 512,
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
        span_id: "span",
        parent_span_id: null,
        start_time: "2026-09-11 00:00:00.000000",
        event_ts: "2026-09-11 00:00:00.000000",
        type: "GENERATION",
        name: "generation",
        input: "input",
        output: "output",
        metadata: { é: "界🙂" },
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
      expect(tokenCountAsync).not.toHaveBeenCalled();
      expect(getTraceBatchEventStream).toHaveBeenCalledWith(payload, {
        maxThreads: 1,
        maxBlockSize: 512,
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
        ["langfuse.trace_batch.failed_read_output_bytes", 6],
        ["langfuse.trace_batch.failed_read_metadata_bytes", 9],
        ["langfuse.trace_batch.failed_read_io_metadata_bytes", 20],
        [
          "langfuse.trace_batch.read_duration_ms",
          expect.any(Number),
          { outcome: "failure" },
        ],
      ]);
      expect(recordIncrement).toHaveBeenCalledWith(
        "langfuse.trace_batch.read_attempts",
        1,
        { outcome: "failure" },
      );
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
    expect(recordGauge).toHaveBeenLastCalledWith(
      "langfuse.trace_batch.active_reads",
      2,
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
    expect(vi.mocked(recordIncrement).mock.calls).toEqual([
      ["langfuse.trace_batch.read_attempts", 1, { outcome: "success" }],
      ["langfuse.trace_batch.read_attempts", 1, { outcome: "failure" }],
    ]);
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
              span_id: `span-${yieldedRows}`,
              parent_span_id: null,
              start_time: "2026-09-11 00:00:00.000000",
              event_ts: "2026-09-11 00:00:00.000000",
              type: "GENERATION",
              name: "generation",
              input: "hello",
              output: "世界",
              metadata: { é: "界🙂" },
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
        ["io_metadata_bytes", 80],
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
        inputBytes: hasRows ? 5 : 0,
        outputBytes: hasRows ? 5 : 0,
        metadataBytes: 0,
        ioMetadataBytes: hasRows ? 10 : 0,
      });
      expect(processingSpan.setAttributes).not.toHaveBeenCalled();
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
      expect(recordDistribution).toHaveBeenCalledWith(
        "langfuse.trace_batch.found_project_count",
        Number(hasRows),
      );
      expect(getTraceBatchEventStream).toHaveBeenCalledWith(
        { traces: [{ ...trace, projectId: "project" }] },
        expect.anything(),
      );
    },
  );
});
