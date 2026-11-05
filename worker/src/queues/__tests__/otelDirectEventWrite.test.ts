import { describe, it, expect, vi } from "vitest";
import { type Job } from "bullmq";
import type { EarlyOtelBatch } from "@langfuse/native";
import {
  createEvent,
  getS3EventStorageClient,
  markProjectIngestFailure,
  OtelIngestionProcessor,
  QueueJobs,
  type QueueName,
  type TQueueJobTypes,
} from "@langfuse/shared/src/server";
import { env } from "../../env";
import * as otelPreparation from "../../features/otel-ingestion/prepareOtelBatch";
import * as mediaRestoration from "../../features/otel-media/resolveExtractedMedia";
import { IngestionService } from "../../services/IngestionService";
import { ClickhouseWriter } from "../../services/ClickhouseWriter";
import { fetchEvalRules } from "../../features/evaluation/fetchEvalRules";
import { scheduleObservationEvals } from "../../features/evaluation/observationEval/scheduleObservationEvals";
import { createObservationEvalSchedulerDeps } from "../../features/evaluation/observationEval/createSchedulerDeps";
import { Prisma } from "@langfuse/shared/src/db";
import { observationForEvalSchema, TopicsTargetObject } from "@langfuse/shared";
import {
  isTopicsEnabled,
  getTopicsProcessingSampling,
  isTopicsProcessingActive,
  isTopicsProjectEnabled,
} from "@langfuse/shared/topics/server";
import { processOtelEvents } from "../../features/otel-ingestion/processOtelEvents";
import { recordTraceActivity } from "../../features/traceBatching/traceRuleRecording";
import {
  createTestEvalConfig,
  createMockSchedulerDeps,
} from "../../features/evaluation/observationEval/__tests__/fixtures";
import { trackLegacyTopicsBatchActivity } from "../../features/traceBatching/traceBatching";
import {
  batchContainsLangfuseScope,
  checkHeaderBasedDirectWrite,
  checkSdkVersionRequirements,
  getSdkInfoFromResourceSpans,
  isLangfuseSdkTraffic,
  isOrgPastOtelDirectWriteCutoff,
  otelIngestionQueueProcessorBuilder,
  resolveOtelWritePath,
  shouldProcessLegacyOtelMedia,
  type SdkInfo,
} from "../otelIngestionQueue";

vi.mock("@langfuse/shared/src/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@langfuse/shared/src/server")>()),
  // Queue construction requires Redis; its service methods are mocked below.
  redis: {},
  getS3EventStorageClient: vi.fn(),
  markProjectIngestFailure: vi.fn(),
}));
vi.mock("../../features/evaluation/fetchEvalRules", () => ({
  fetchEvalRules: vi.fn().mockResolvedValue({
    observationRules: [],
    traceTranscriptRules: [],
  }),
}));
vi.mock(
  "../../features/evaluation/observationEval/createSchedulerDeps",
  () => ({
    createObservationEvalSchedulerDeps: vi.fn(),
  }),
);
vi.mock(
  "../../features/evaluation/observationEval/scheduleObservationEvals",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("../../features/evaluation/observationEval/scheduleObservationEvals")
    >()),
    scheduleObservationEvals: vi.fn(),
  }),
);
vi.mock("../../features/traceBatching/traceBatching", () => ({
  trackLegacyTopicsBatchActivity: vi.fn(),
}));

vi.mock("../../features/traceBatching/traceRuleRecording", () => ({
  recordTraceActivity: vi.fn(),
}));

vi.mock("@langfuse/shared/topics/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@langfuse/shared/topics/server")>()),
  isTopicsEnabled: vi.fn().mockReturnValue(false),
  isTopicsProjectEnabled: vi.fn().mockReturnValue(false),
  isTopicsProcessingActive: vi.fn().mockResolvedValue(false),
  getTopicsProcessingSampling: vi.fn().mockResolvedValue(0),
}));

describe("trace-rule recording at the evaluation stage", () => {
  it.each([
    { mode: "eval-only", shouldWriteToEventsTable: false, writeFails: false },
    { mode: "failed write", shouldWriteToEventsTable: true, writeFails: true },
    {
      mode: "one write fails",
      shouldWriteToEventsTable: true,
      writeFails: false,
      failedSpanId: "other",
    },
    {
      mode: "invalid eval observation",
      shouldWriteToEventsTable: true,
      writeFails: false,
      invalidSpanId: "match",
    },
    {
      mode: "ingestion disabled",
      shouldWriteToEventsTable: true,
      writeFails: false,
      ingestionEnabled: false,
      observationRulesEnabled: false,
    },
    {
      mode: "Topics disabled",
      shouldWriteToEventsTable: true,
      writeFails: false,
      topicsEnabled: false,
      observationRulesEnabled: false,
    },
    {
      mode: "accepted write",
      shouldWriteToEventsTable: true,
      writeFails: false,
    },
  ])(
    "fetches and records transcript selections only for eligible batches ($mode)",
    async ({
      shouldWriteToEventsTable,
      writeFails,
      failedSpanId,
      invalidSpanId,
      ingestionEnabled = true,
      topicsEnabled = true,
      observationRulesEnabled = true,
    }) => {
      const original = { ...env };
      env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "DEV";
      vi.mocked(isTopicsProjectEnabled).mockReturnValue(topicsEnabled);
      vi.mocked(isTopicsProcessingActive).mockResolvedValue(topicsEnabled);
      vi.mocked(getTopicsProcessingSampling).mockResolvedValue(
        topicsEnabled ? 1 : 0,
      );
      env.LANGFUSE_TRACE_DISPATCH_SAMPLING_RATE = 1;
      env.LANGFUSE_TRACE_DISPATCH_ENABLED = ingestionEnabled ? "true" : "false";
      const includeTraceTranscriptRules =
        shouldWriteToEventsTable && ingestionEnabled;
      env.LANGFUSE_TRACE_BATCH_INGESTION_ENABLED = "true";
      env.LANGFUSE_OTEL_MEDIA_UPLOAD_ENABLED = "false";
      const projectId = "recording-test";
      const observationRule = createTestEvalConfig({ projectId });
      const inputs = ["match", "other", "internal"].map((spanId) => ({
        projectId,
        traceId: "trace",
        spanId,
        startTimeISO: "2026-10-29T10:00:00.000Z",
      }));
      const createEventRecord = vi.fn(async (input: { spanId: string }) => ({
        ...createEvent({
          project_id: projectId,
          trace_id: "trace",
          span_id: input.spanId,
          name: input.spanId,
          environment:
            input.spanId === "internal"
              ? "langfuse-llm-as-a-judge"
              : "production",
        }),
        // OTel attributes can contain numbers; the eval schema requires a string.
        version: input.spanId === invalidSpanId ? 123 : "test-version",
      }));
      const persistedMatch = { input: "matched payload" };
      const persistedOther = { input: "other payload 🔥" };
      const writeEventRecord = vi.fn(async (record: { span_id: string }) => {
        if (writeFails || record.span_id === failedSpanId)
          throw new Error("write unavailable");
        return record.span_id === "match" ? persistedMatch : persistedOther;
      });
      try {
        vi.mocked(fetchEvalRules).mockResolvedValue({
          observationRules: observationRulesEnabled ? [observationRule] : [],
          traceTranscriptRules: [
            {
              id: "trace-rule",
              ruleId: "trace-rule",
              projectId,
              targetObject: TopicsTargetObject,
              status: "ACTIVE",
              sampling: new Prisma.Decimal(1),
              filter: [
                {
                  column: "name",
                  type: "string",
                  operator: "=",
                  value: "match",
                },
              ],
              assignments: [
                {
                  id: "assignment",
                  evaluatorId: "evaluator",
                  variableMapping: null,
                  evaluator: {
                    id: "evaluator",
                    projectId,
                    type: "LLM_AS_JUDGE",
                  },
                },
              ],
            },
          ],
        });
        vi.mocked(createObservationEvalSchedulerDeps).mockReturnValue(
          createMockSchedulerDeps(),
        );
        vi.mocked(scheduleObservationEvals).mockRejectedValue(
          new Error("span scheduling unavailable"),
        );
        vi.mocked(recordTraceActivity).mockRejectedValue(
          new Error("Redis unavailable"),
        );
        await expect(
          processOtelEvents({
            processor: {
              processToEvent: () => inputs,
            } as unknown as OtelIngestionProcessor,
            ingestionService: {
              createEventRecord,
              writeEventRecord,
            } as unknown as IngestionService,
            resourceSpans: [],
            projectId,
            fileKey: "test.json",
            shouldWriteToEventsTable,
          }),
        ).resolves.toBeUndefined();
        const recordedSpans = [
          failedSpanId === "match" || invalidSpanId === "match"
            ? []
            : [
                {
                  traceId: "trace",
                  spanStartTimeISO: inputs[0].startTimeISO,
                  ruleIds: ["trace-rule"],
                  serializedEventBytes: Buffer.byteLength(
                    JSON.stringify(persistedMatch),
                  ),
                },
              ],
          failedSpanId === "other" || invalidSpanId === "other"
            ? []
            : [
                {
                  traceId: "trace",
                  spanStartTimeISO: inputs[1].startTimeISO,
                  ruleIds: ["__trace_batch_experiment__"],
                  serializedEventBytes: Buffer.byteLength(
                    JSON.stringify(persistedOther),
                  ),
                },
              ],
        ].flat();
        if (includeTraceTranscriptRules && !writeFails) {
          expect(recordTraceActivity).toHaveBeenCalledExactlyOnceWith(
            projectId,
            recordedSpans,
          );
        } else {
          expect(recordTraceActivity).not.toHaveBeenCalled();
        }
        expect(
          vi
            .mocked(scheduleObservationEvals)
            .mock.calls.filter(([args]) => args.configs.length > 0)
            .map(([args]) => args.configs),
        ).toEqual(
          observationRulesEnabled
            ? inputs
                .filter(
                  ({ spanId }) =>
                    spanId !== "internal" && spanId !== invalidSpanId,
                )
                .map(() => [observationRule])
            : [],
        );
        if (!observationRulesEnabled && !includeTraceTranscriptRules) {
          expect(createObservationEvalSchedulerDeps).not.toHaveBeenCalled();
        }
        expect(writeEventRecord).toHaveBeenCalledTimes(
          shouldWriteToEventsTable ? 3 : 0,
        );
        expect(trackLegacyTopicsBatchActivity).not.toHaveBeenCalled();
        expect(fetchEvalRules).toHaveBeenCalledExactlyOnceWith(projectId, {
          includeTraceTranscriptRules,
        });
      } finally {
        Object.assign(env, original);
        vi.mocked(isTopicsProjectEnabled).mockReturnValue(false);
        vi.mocked(isTopicsProcessingActive).mockResolvedValue(false);
        vi.mocked(getTopicsProcessingSampling).mockResolvedValue(0);
        vi.clearAllMocks();
      }
    },
  );

  it.each([
    { mode: "sampled", rate: 0.1, ingestionEnabled: true, cloud: true },
    { mode: "rate zero", rate: 0, ingestionEnabled: true, cloud: true },
    { mode: "intake off", rate: 0.1, ingestionEnabled: false, cloud: true },
    { mode: "self-hosted", rate: 0.1, ingestionEnabled: true, cloud: false },
  ])(
    "records the stable experiment cohort without evaluation rules ($mode)",
    async ({ rate, ingestionEnabled, cloud }) => {
      const original = { ...env };
      const projectId = "sampled-recording-test";
      const normalize = vi.spyOn(observationForEvalSchema, "parse");
      // Existing trace-batch sampler fixtures: 0.0593 is selected at 10%; 0.7116 is not.
      const selected = "00000000000000000000000000000001";
      const excluded = "00000000000000000000000000000002";
      const inputs = [selected, excluded, selected, selected].map(
        (traceId, index) => ({
          projectId,
          traceId,
          spanId: `span-${index}`,
          startTimeISO: "2026-10-29T10:00:00.000Z",
          environment: index === 3 ? "langfuse-llm-as-a-judge" : "production",
        }),
      );
      const persistedRecord = { input: "post-overflow 🔥" };
      let recordedActivity: unknown;
      try {
        env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = cloud ? "DEV" : undefined;
        env.LANGFUSE_TRACE_DISPATCH_ENABLED = ingestionEnabled
          ? "true"
          : "false";
        env.LANGFUSE_TRACE_DISPATCH_SAMPLING_RATE = rate;
        env.LANGFUSE_TRACE_BATCH_INGESTION_ENABLED = "true";
        env.LANGFUSE_OTEL_MEDIA_UPLOAD_ENABLED = "false";
        vi.mocked(fetchEvalRules).mockResolvedValue({
          observationRules: [],
          traceTranscriptRules: [],
        });
        vi.mocked(createObservationEvalSchedulerDeps).mockReturnValue(
          createMockSchedulerDeps(),
        );
        vi.mocked(recordTraceActivity).mockImplementation(
          async (_, activity) => {
            recordedActivity = structuredClone(activity);
          },
        );

        await processOtelEvents({
          processor: {
            processToEvent: () => inputs,
          } as unknown as OtelIngestionProcessor,
          ingestionService: {
            createEventRecord: async (input: (typeof inputs)[number]) =>
              createEvent({
                project_id: projectId,
                trace_id: input.traceId,
                span_id: input.spanId,
                environment: input.environment,
              }),
            writeEventRecord: vi.fn().mockResolvedValue(persistedRecord),
          } as unknown as IngestionService,
          resourceSpans: [],
          projectId,
          fileKey: "sampled.json",
          shouldWriteToEventsTable: true,
        });

        expect(normalize).not.toHaveBeenCalled();
        if (rate > 0 && ingestionEnabled && cloud) {
          expect(recordTraceActivity).toHaveBeenCalledExactlyOnceWith(
            projectId,
            expect.any(Array),
          );
          expect(recordedActivity).toEqual(
            [inputs[0], inputs[2]].map((input) => ({
              traceId: selected,
              spanStartTimeISO: input.startTimeISO,
              ruleIds: ["__trace_batch_experiment__"],
              serializedEventBytes: Buffer.byteLength(
                JSON.stringify(persistedRecord),
              ),
            })),
          );
        } else {
          expect(recordTraceActivity).not.toHaveBeenCalled();
        }
      } finally {
        normalize.mockRestore();
        Object.assign(env, original);
        vi.clearAllMocks();
      }
    },
  );
});

describe("direct-v4 trace batch tracking", () => {
  it("tracks accepted writes together and excludes failed writes, disabled intake, and legacy writes", async () => {
    const original = {
      NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
      LANGFUSE_TRACE_DISPATCH_ENABLED: env.LANGFUSE_TRACE_DISPATCH_ENABLED,
      LANGFUSE_MIGRATION_V4_WRITE_MODE: env.LANGFUSE_MIGRATION_V4_WRITE_MODE,
      LANGFUSE_OTEL_MEDIA_UPLOAD_ENABLED:
        env.LANGFUSE_OTEL_MEDIA_UPLOAD_ENABLED,
      LANGFUSE_OTEL_EARLY_MEDIA_EXTRACTION_ENABLED:
        env.LANGFUSE_OTEL_EARLY_MEDIA_EXTRACTION_ENABLED,
      LANGFUSE_OTEL_EARLY_MEDIA_EXTRACTION_PROJECT_IDS:
        env.LANGFUSE_OTEL_EARLY_MEDIA_EXTRACTION_PROJECT_IDS,
    };
    env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "DEV";
    env.LANGFUSE_TRACE_DISPATCH_ENABLED = "false";
    vi.mocked(isTopicsEnabled).mockReturnValue(true);
    env.LANGFUSE_MIGRATION_V4_WRITE_MODE = "events_only";
    env.LANGFUSE_OTEL_MEDIA_UPLOAD_ENABLED = "false";
    env.LANGFUSE_OTEL_EARLY_MEDIA_EXTRACTION_ENABLED = "true";
    env.LANGFUSE_OTEL_EARLY_MEDIA_EXTRACTION_PROJECT_IDS = ["*"];

    try {
      vi.mocked(getS3EventStorageClient).mockReturnValue({
        downloadBytes: vi.fn().mockResolvedValue(Buffer.from("[]")),
      } as unknown as ReturnType<typeof getS3EventStorageClient>);
      vi.spyOn(otelPreparation, "prepareOtelBatch").mockResolvedValue({
        sourceUnchanged: false,
        batch: {
          takeJsonBuffer: () => Buffer.from("[]"),
          dispose: vi.fn(),
        } as unknown as EarlyOtelBatch,
      });
      const restore = vi
        .spyOn(mediaRestoration, "restoreInlineMedia")
        .mockResolvedValue(undefined);
      vi.mocked(fetchEvalRules).mockResolvedValue({
        observationRules: [],
        traceTranscriptRules: [],
      });
      vi.spyOn(ClickhouseWriter, "getInstance").mockReturnValue(
        {} as ClickhouseWriter,
      );
      vi.spyOn(
        OtelIngestionProcessor.prototype,
        "processToIngestionEvents",
      ).mockResolvedValue([]);
      const inputs = [
        { traceId: "accepted", spanId: "first" },
        { traceId: "accepted", spanId: "second" },
        { traceId: "write-failed", spanId: "third" },
        { traceId: "conversion-failed", spanId: "fourth" },
      ].map((entry, index) => ({
        ...entry,
        projectId: "project",
        startTimeISO: new Date(1_000 + index * 1_000).toISOString(),
      }));
      vi.spyOn(
        OtelIngestionProcessor.prototype,
        "processToEvent",
      ).mockReturnValue(
        inputs as ReturnType<OtelIngestionProcessor["processToEvent"]>,
      );
      vi.spyOn(
        IngestionService.prototype,
        "createEventRecord",
      ).mockImplementation(async (input) => {
        if (input.traceId === "conversion-failed") throw new Error("invalid");
        return { span_id: input.spanId, event_bytes: 10_000 } as Awaited<
          ReturnType<IngestionService["createEventRecord"]>
        >;
      });
      const write = vi
        .spyOn(IngestionService.prototype, "writeEventRecord")
        .mockImplementation(async (record) => {
          if (record.span_id === "third") throw new Error("write rejected");
          return {
            ...record,
            event_bytes: 1234,
            input: "post-overflow 🔥",
          };
        });
      const processor = otelIngestionQueueProcessorBuilder(false);
      const job = {
        data: {
          id: "ingestion",
          timestamp: new Date(),
          name: QueueJobs.OtelIngestionJob,
          payload: {
            data: { fileKey: "synthetic.json" },
            authCheck: {
              validKey: true,
              scope: {
                projectId: "project",
                orgId: "org",
                accessLevel: "project",
              },
            },
            ingestionVersion: "4",
          },
        },
      } as Job<TQueueJobTypes[QueueName.OtelIngestionQueue]>;

      await processor(job, undefined);
      expect(restore.mock.calls.map(([, records]) => records)).toEqual([
        inputs,
      ]);
      expect(write).toHaveBeenCalledTimes(3);
      expect(recordTraceActivity).not.toHaveBeenCalled();
      expect(fetchEvalRules).toHaveBeenCalledExactlyOnceWith("project", {
        includeTraceTranscriptRules: false,
      });
      expect(trackLegacyTopicsBatchActivity).toHaveBeenCalledExactlyOnceWith(
        "project",
        inputs.slice(0, 2).map(({ traceId, startTimeISO }) => ({
          traceId,
          startTimeISO,
          serializedEventBytes: 1234,
        })),
      );

      vi.mocked(trackLegacyTopicsBatchActivity).mockClear();
      env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;
      await processor(job, undefined);
      expect(trackLegacyTopicsBatchActivity).not.toHaveBeenCalled();
      env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "DEV";
      vi.mocked(isTopicsEnabled).mockReturnValue(false);
      await processor(job, undefined);
      expect(trackLegacyTopicsBatchActivity).not.toHaveBeenCalled();

      env.LANGFUSE_TRACE_DISPATCH_ENABLED = "false";
      vi.mocked(isTopicsEnabled).mockReturnValue(true);
      write.mockRejectedValue(new Error("all writes rejected"));
      await processor(job, undefined);
      expect(trackLegacyTopicsBatchActivity).not.toHaveBeenCalled();

      env.LANGFUSE_MIGRATION_V4_WRITE_MODE = "legacy";
      write.mockClear();
      restore.mockClear();
      await processor(job, undefined);
      expect(restore.mock.calls.map(([, records]) => records)).toEqual([[]]);
      expect(write).not.toHaveBeenCalled();
      expect(trackLegacyTopicsBatchActivity).not.toHaveBeenCalled();
    } finally {
      Object.assign(env, original);
      vi.mocked(isTopicsEnabled).mockReturnValue(false);
      vi.restoreAllMocks();
      vi.clearAllMocks();
    }
  });
});

describe("early media extraction rollout", () => {
  const createJob = (projectId: string) =>
    ({
      data: {
        id: "early-media-rollout",
        timestamp: new Date(),
        name: QueueJobs.OtelIngestionJob,
        payload: {
          data: { fileKey: "early-media-rollout.json" },
          authCheck: {
            validKey: true,
            scope: {
              projectId,
              orgId: "org",
              accessLevel: "project",
            },
          },
          ingestionVersion: "4",
        },
      },
    }) as Job<TQueueJobTypes[QueueName.OtelIngestionQueue]>;

  it("releases an unchanged media-free native document before JSON.parse", async () => {
    const original = {
      LANGFUSE_OTEL_EARLY_MEDIA_EXTRACTION_ENABLED:
        env.LANGFUSE_OTEL_EARLY_MEDIA_EXTRACTION_ENABLED,
      LANGFUSE_OTEL_EARLY_MEDIA_EXTRACTION_PROJECT_IDS:
        env.LANGFUSE_OTEL_EARLY_MEDIA_EXTRACTION_PROJECT_IDS,
    };
    env.LANGFUSE_OTEL_EARLY_MEDIA_EXTRACTION_ENABLED = "true";
    env.LANGFUSE_OTEL_EARLY_MEDIA_EXTRACTION_PROJECT_IDS = ["*"];
    const json = '[{"resource":{"attributes":[]},"scopeSpans":[]}]';
    const bytes = Buffer.from(json);
    vi.mocked(getS3EventStorageClient).mockReturnValue({
      downloadBytes: vi.fn().mockResolvedValue(bytes),
    } as unknown as ReturnType<typeof getS3EventStorageClient>);
    const native =
      await vi.importActual<typeof import("@langfuse/native")>(
        "@langfuse/native",
      );
    const validated = await native.validateOtelJson(bytes);
    const nativeBatch = await validated.extract(false);
    const parse = JSON.parse;
    let checkedBeforeParse = false;
    const stop = new Error("stop after parsing");
    try {
      vi.spyOn(otelPreparation, "prepareOtelBatch").mockImplementation(
        async () => {
          expect(nativeBatch.mediaCount()).toBe(0);
          vi.spyOn(nativeBatch, "takeJsonBuffer").mockImplementation(() => {
            throw new Error("must not transfer a second document to Node");
          });
          vi.spyOn(JSON, "parse").mockImplementation((text, reviver) => {
            if (text === json) {
              expect(() => nativeBatch.mediaCount()).toThrow(/disposed/);
              checkedBeforeParse = true;
            }
            return parse(text, reviver);
          });
          return { batch: nativeBatch, sourceUnchanged: true };
        },
      );
      vi.spyOn(
        OtelIngestionProcessor.prototype,
        "processToIngestionEvents",
      ).mockRejectedValue(stop);
      await expect(
        otelIngestionQueueProcessorBuilder(false)(
          createJob("project"),
          undefined,
        ),
      ).rejects.toBe(stop);
      expect(checkedBeforeParse).toBe(true);
    } finally {
      Object.assign(env, original);
      vi.restoreAllMocks();
      vi.clearAllMocks();
    }
  });

  it.each([
    ["reference", "disabled with wildcard", false, ["*"]],
    ["reference", "enabled with no projects", true, []],
    [
      "reference",
      "enabled with a non-matching project",
      true,
      ["other-project"],
    ],
    ["early", "enabled with a matching project", true, ["project-match"]],
    ["early", "enabled for all projects", true, ["*"]],
  ] as const)(
    "selects the %s path when %s",
    async (expectedPath, label, enabled, projectIds) => {
      const original = {
        LANGFUSE_OTEL_EARLY_MEDIA_EXTRACTION_ENABLED:
          env.LANGFUSE_OTEL_EARLY_MEDIA_EXTRACTION_ENABLED,
        LANGFUSE_OTEL_EARLY_MEDIA_EXTRACTION_PROJECT_IDS:
          env.LANGFUSE_OTEL_EARLY_MEDIA_EXTRACTION_PROJECT_IDS,
      };
      const download = vi
        .fn()
        .mockRejectedValue(new Error("stop after reference download"));
      const downloadBytes = vi
        .fn()
        .mockRejectedValue(new Error("stop after early download"));

      env.LANGFUSE_OTEL_EARLY_MEDIA_EXTRACTION_ENABLED = enabled
        ? "true"
        : "false";
      env.LANGFUSE_OTEL_EARLY_MEDIA_EXTRACTION_PROJECT_IDS = [...projectIds];
      vi.mocked(getS3EventStorageClient).mockReturnValue({
        download,
        downloadBytes,
      } as unknown as ReturnType<typeof getS3EventStorageClient>);

      try {
        const processor = otelIngestionQueueProcessorBuilder(false);
        await expect(
          processor(createJob("project-match"), undefined),
        ).rejects.toThrow(`stop after ${expectedPath} download`);

        if (expectedPath === "early") {
          expect(downloadBytes).toHaveBeenCalledExactlyOnceWith(
            "early-media-rollout.json",
          );
          expect(download).not.toHaveBeenCalled();
        } else {
          expect(download).toHaveBeenCalledExactlyOnceWith(
            "early-media-rollout.json",
          );
          expect(downloadBytes).not.toHaveBeenCalled();
        }
      } finally {
        Object.assign(env, original);
        vi.mocked(getS3EventStorageClient).mockReset();
        vi.mocked(markProjectIngestFailure).mockClear();
      }
    },
  );
});

describe("isOrgPastOtelDirectWriteCutoff", () => {
  const cutoff = "2026-08-06";
  const inScope = {
    orgCreatedAt: new Date("2026-08-07T09:00:00.000Z"),
    cutoff,
  };

  it("includes organizations created after the cutoff", () => {
    expect(isOrgPastOtelDirectWriteCutoff(inScope)).toBe(true);
  });

  it("includes organizations created exactly at midnight UTC on the cutoff date", () => {
    expect(
      isOrgPastOtelDirectWriteCutoff({
        ...inScope,
        orgCreatedAt: new Date("2026-08-06T00:00:00.000Z"),
      }),
    ).toBe(true);
  });

  it("excludes organizations created just before the cutoff date", () => {
    expect(
      isOrgPastOtelDirectWriteCutoff({
        ...inScope,
        orgCreatedAt: new Date("2026-08-05T23:59:59.999Z"),
      }),
    ).toBe(false);
  });

  it("is disabled when the cutoff is unset", () => {
    expect(
      isOrgPastOtelDirectWriteCutoff({ ...inScope, cutoff: undefined }),
    ).toBe(false);
  });

  // An unresolvable organization must not read as "created at epoch" (in scope
  // for no cutoff) nor as "created now" (in scope for every cutoff).
  it.each([
    { orgCreatedAt: null, label: "null" },
    { orgCreatedAt: undefined, label: "undefined" },
    { orgCreatedAt: new Date("nonsense"), label: "an invalid Date" },
  ])(
    "keeps the pre-cutoff behaviour when the org date is $label",
    ({ orgCreatedAt }) => {
      expect(isOrgPastOtelDirectWriteCutoff({ ...inScope, orgCreatedAt })).toBe(
        false,
      );
    },
  );
});

describe("isLangfuseSdkTraffic", () => {
  it.each([
    { params: { sdkName: "python" }, expected: true, label: "sdk-name header" },
    {
      params: { sdkName: "javascript" },
      expected: true,
      label: "javascript sdk-name header",
    },
    {
      params: { scopeName: "langfuse-sdk" },
      expected: true,
      label: "langfuse instrumentation scope",
    },
    {
      params: { scopeName: "LangFuse-SDK" },
      expected: true,
      label: "scope match is case-insensitive",
    },
    // The header is normalized to this sentinel when absent, so it must not
    // read as a Langfuse SDK — that would exclude all plain OTel traffic.
    {
      params: { sdkName: "unknown" },
      expected: false,
      label: "unknown sdk-name sentinel",
    },
    {
      params: { sdkName: "unknown", scopeName: "openlit" },
      expected: false,
      label: "third-party scope with no sdk-name",
    },
    { params: {}, expected: false, label: "no signal at all" },
    {
      params: { scopeName: null },
      expected: false,
      label: "null scope name",
    },
  ])("$label → $expected", ({ params, expected }) => {
    expect(isLangfuseSdkTraffic(params)).toBe(expected);
  });
});

describe("batchContainsLangfuseScope", () => {
  const scoped = (...names: string[]) => ({
    scopeSpans: names.map((name) => ({ scope: { name }, spans: [] })),
  });

  it("finds a Langfuse scope that is not the batch's first scope", () => {
    expect(
      batchContainsLangfuseScope([scoped("openlit", "langfuse-sdk")]),
    ).toBe(true);
  });

  it("finds a Langfuse scope on a later resource", () => {
    expect(
      batchContainsLangfuseScope([scoped("openlit"), scoped("langfuse-sdk")]),
    ).toBe(true);
  });

  it("keeps scanning past a malformed resource to a later Langfuse scope", () => {
    expect(
      batchContainsLangfuseScope([
        { scopeSpans: {} } as never,
        scoped("langfuse-sdk"),
      ]),
    ).toBe(true);
  });

  it("rejects batches with only third-party scopes", () => {
    expect(
      batchContainsLangfuseScope([scoped("openlit", "openinference")]),
    ).toBe(false);
  });

  it.each([
    { input: [], label: "an empty batch" },
    { input: [{}], label: "a resource without scopeSpans" },
    {
      // Malformed OTLP reaches this code path; scanning must not throw.
      input: [{ scopeSpans: {} } as never],
      label: "a non-array scopeSpans shape",
    },
    // The payload is JSON.parse output with no shape guarantee at all — a
    // non-array top level must read as scope-less, not crash the job.
    { input: {} as never, label: "a non-array payload" },
    { input: "nonsense" as never, label: "a string payload" },
  ])("rejects $label", ({ input }) => {
    expect(batchContainsLangfuseScope(input)).toBe(false);
  });
});

describe("resolveOtelWritePath", () => {
  const none = {
    headerBasedDirectWrite: false,
    envForcesDirect: false,
    scopeBasedDirectWrite: false,
    orgCutoffForcesDirect: false,
    langfuseSdkTraffic: false,
  };

  it("falls back to the dual write when no signal qualifies", () => {
    expect(resolveOtelWritePath(none)).toEqual({
      useDirectEventWrite: false,
      writePath: "dual",
    });
  });

  it.each([
    { signal: "headerBasedDirectWrite", writePath: "direct_header" },
    { signal: "envForcesDirect", writePath: "direct_env" },
    { signal: "scopeBasedDirectWrite", writePath: "direct_scope" },
    { signal: "orgCutoffForcesDirect", writePath: "direct_org_cutoff" },
  ] as const)("$signal alone routes to $writePath", ({ signal, writePath }) => {
    expect(resolveOtelWritePath({ ...none, [signal]: true })).toEqual({
      useDirectEventWrite: true,
      writePath,
    });
  });

  // The org cutoff must not absorb batches another signal already routed
  // directly, otherwise the metric overstates what the rollout moved.
  it.each([
    { signal: "headerBasedDirectWrite", writePath: "direct_header" },
    { signal: "envForcesDirect", writePath: "direct_env" },
    { signal: "scopeBasedDirectWrite", writePath: "direct_scope" },
  ] as const)(
    "attributes to $writePath rather than the org cutoff when both apply",
    ({ signal, writePath }) => {
      expect(
        resolveOtelWritePath({
          ...none,
          [signal]: true,
          orgCutoffForcesDirect: true,
        }),
      ).toEqual({ useDirectEventWrite: true, writePath });
    },
  );

  // An older Langfuse SDK keeps the dual write: its trace-level attributes
  // surface on the synthetic root observation that only the dual path
  // materializes, so flipping it would change data those users already read.
  it("leaves Langfuse SDK traffic on the dual write despite the org cutoff", () => {
    expect(
      resolveOtelWritePath({
        ...none,
        orgCutoffForcesDirect: true,
        langfuseSdkTraffic: true,
      }),
    ).toEqual({ useDirectEventWrite: false, writePath: "dual" });
  });

  it("applies the org cutoff to plain OTel traffic", () => {
    expect(
      resolveOtelWritePath({
        ...none,
        orgCutoffForcesDirect: true,
        langfuseSdkTraffic: false,
      }),
    ).toEqual({ useDirectEventWrite: true, writePath: "direct_org_cutoff" });
  });

  // The exclusion is scoped to the cutoff rule — it must not hold back a batch
  // that a header, the env override, or a recognized scope already qualified.
  it.each([
    { signal: "headerBasedDirectWrite", writePath: "direct_header" },
    { signal: "envForcesDirect", writePath: "direct_env" },
    { signal: "scopeBasedDirectWrite", writePath: "direct_scope" },
  ] as const)(
    "still routes $writePath for Langfuse SDK traffic",
    ({ signal, writePath }) => {
      expect(
        resolveOtelWritePath({
          ...none,
          [signal]: true,
          orgCutoffForcesDirect: true,
          langfuseSdkTraffic: true,
        }),
      ).toEqual({ useDirectEventWrite: true, writePath });
    },
  );
});

describe("shouldProcessLegacyOtelMedia", () => {
  it("processes media whenever legacy tables are written", () => {
    expect(
      shouldProcessLegacyOtelMedia({
        mediaUploadEnabled: true,
        writesToLegacyTables: true,
      }),
    ).toBe(true);
  });

  it.each([
    { mediaUploadEnabled: false, writesToLegacyTables: true },
    { mediaUploadEnabled: true, writesToLegacyTables: false },
  ])("skips media when legacy processing is disabled", (params) => {
    expect(shouldProcessLegacyOtelMedia(params)).toBe(false);
  });
});

describe("checkHeaderBasedDirectWrite", () => {
  it.each<{
    input: Parameters<typeof checkHeaderBasedDirectWrite>[0];
    expected: boolean;
    label: string;
  }>([
    // Python SDK version checks
    {
      input: { sdkName: "python", sdkVersion: "4.0.0" },
      expected: true,
      label: "python 4.0.0 (exact minimum)",
    },
    {
      input: { sdkName: "python", sdkVersion: "4.2.1" },
      expected: true,
      label: "python 4.2.1 (above minimum)",
    },
    {
      input: { sdkName: "python", sdkVersion: "3.9.0" },
      expected: false,
      label: "python 3.9.0 (below minimum)",
    },

    // JS SDK version checks
    {
      input: { sdkName: "javascript", sdkVersion: "5.0.0" },
      expected: true,
      label: "javascript 5.0.0 (exact minimum)",
    },
    {
      input: { sdkName: "javascript", sdkVersion: "5.1.3" },
      expected: true,
      label: "javascript 5.1.3 (above minimum)",
    },
    {
      input: { sdkName: "javascript", sdkVersion: "4.6.0" },
      expected: false,
      label: "javascript 4.6.0 (below minimum)",
    },

    // Pre-release versions (stripped before comparison)
    {
      input: { sdkName: "python", sdkVersion: "4.0.0-rc.1" },
      expected: true,
      label: "python 4.0.0-rc.1 (pre-release at minimum)",
    },
    {
      input: { sdkName: "javascript", sdkVersion: "5.0.0-beta.1" },
      expected: true,
      label: "javascript 5.0.0-beta.1 (pre-release at minimum)",
    },
    {
      input: { sdkName: "python", sdkVersion: "4.1.0-rc.1" },
      expected: true,
      label: "python 4.1.0-rc.1 (pre-release above minimum)",
    },
    {
      input: { sdkName: "python", sdkVersion: "4.0.0b1" },
      expected: true,
      label: "python 4.0.0b1 (pep440 beta shorthand at minimum)",
    },
    {
      input: { sdkName: "python", sdkVersion: "3.9.0-rc.1" },
      expected: false,
      label: "python 3.9.0-rc.1 (pre-release below minimum)",
    },

    // Unknown / missing SDK name
    {
      input: { sdkName: "ruby", sdkVersion: "1.0.0" },
      expected: false,
      label: "unknown SDK name",
    },
    {
      input: { sdkName: "python" },
      expected: false,
      label: "sdkName without sdkVersion",
    },
    {
      input: { sdkVersion: "4.0.0" },
      expected: false,
      label: "sdkVersion without sdkName",
    },

    // Malformed versions
    {
      input: { sdkName: "python", sdkVersion: "not-a-version" },
      expected: false,
      label: "non-semver sdkVersion",
    },
    {
      input: { sdkName: "python", sdkVersion: "" },
      expected: false,
      label: "empty sdkVersion",
    },

    // ingestionVersion
    {
      input: { ingestionVersion: "4" },
      expected: true,
      label: "ingestionVersion '4'",
    },
    {
      input: {
        ingestionVersion: "4",
        sdkName: undefined,
        sdkVersion: undefined,
      },
      expected: true,
      label: "ingestionVersion '4' without SDK headers",
    },
    {
      input: { ingestionVersion: "3" },
      expected: false,
      label: "ingestionVersion '3' (below)",
    },
    {
      input: { ingestionVersion: "1" },
      expected: false,
      label: "ingestionVersion '1' (below)",
    },
    {
      input: { sdkName: "python", sdkVersion: "3.0.0", ingestionVersion: "4" },
      expected: true,
      label: "ingestionVersion '4' overrides old SDK version",
    },

    // No headers
    { input: {}, expected: false, label: "empty input" },
    {
      input: {
        sdkName: undefined,
        sdkVersion: undefined,
        ingestionVersion: undefined,
      },
      expected: false,
      label: "all undefined",
    },
  ])("$label → $expected", ({ input, expected }) => {
    expect(checkHeaderBasedDirectWrite(input)).toBe(expected);
  });
});

describe("checkSdkVersionRequirements (legacy fallback)", () => {
  it.each<{
    sdkInfo: SdkInfo;
    isExperiment: boolean;
    expected: boolean;
    label: string;
  }>([
    {
      sdkInfo: {
        scopeName: "openlit",
        scopeVersion: "3.9.0",
        telemetrySdkLanguage: "python",
      },
      isExperiment: true,
      expected: false,
      label: "non-Langfuse scope name",
    },
    {
      sdkInfo: {
        scopeName: "langfuse-sdk",
        scopeVersion: "3.9.0",
        telemetrySdkLanguage: "python",
      },
      isExperiment: false,
      expected: false,
      label: "experiment batch false",
    },
    {
      sdkInfo: {
        scopeName: "langfuse-sdk",
        scopeVersion: "3.9.0",
        telemetrySdkLanguage: "python",
      },
      isExperiment: true,
      expected: true,
      label: "python 3.9.0 (exact minimum)",
    },
    {
      sdkInfo: {
        scopeName: "langfuse-sdk",
        scopeVersion: "4.4.0",
        telemetrySdkLanguage: "js",
      },
      isExperiment: true,
      expected: true,
      label: "js 4.4.0 (exact minimum)",
    },
  ])("$label → $expected", ({ sdkInfo, isExperiment, expected }) => {
    expect(checkSdkVersionRequirements(sdkInfo, isExperiment)).toBe(expected);
  });
});

describe("getSdkInfoFromResourceSpans (legacy fallback)", () => {
  it.each<{
    input: Parameters<typeof getSdkInfoFromResourceSpans>[0];
    expected: ReturnType<typeof getSdkInfoFromResourceSpans>;
    label: string;
  }>([
    {
      input: {
        resource: {
          attributes: [
            { key: "telemetry.sdk.language", value: { stringValue: "python" } },
          ],
        },
        scopeSpans: [
          { scope: { name: "langfuse-sdk", version: "3.14.1" }, spans: [] },
        ],
      },
      expected: {
        scopeName: "langfuse-sdk",
        scopeVersion: "3.14.1",
        telemetrySdkLanguage: "python",
      },
      label: "well-formed input",
    },
    {
      input: {},
      expected: {
        scopeName: null,
        scopeVersion: null,
        telemetrySdkLanguage: null,
      },
      label: "empty input",
    },
  ])("$label", ({ input, expected }) => {
    expect(getSdkInfoFromResourceSpans(input)).toEqual(expected);
  });
});
