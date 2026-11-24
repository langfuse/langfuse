import { vi } from "vitest";
import { env } from "../../env";
import type { TraceSpanActivity } from "../../features/traceDispatch/traceRuleRecording";

const otelReplayMocks = vi.hoisted(() => ({
  findModel: vi.fn(),
  findModelInPostgres: vi.fn(),
  findPricingTiersForModel: vi.fn(),
  getS3EventStorageClient: vi.fn(),
  linkMediaToTraceOrObservation: vi.fn(),
  uploadMediaForTrace: vi.fn(),
  getPrompt: vi.fn(),
  fetchEvalRules: vi.fn(),
  hasNoEvalConfigsCache: vi.fn(),
  createEvalSchedulerDeps: vi.fn(),
  recordIncrement: vi.fn(),
  recordTraceActivity: vi.fn(),
  scheduleObservationEvals: vi.fn(),
}));

const replayControls = vi.hoisted(() => ({
  useActualEvaluationScheduler: false,
  wrappedSchedulerDeps: new WeakSet<object>(),
  effectBoundaryCounts: {
    primary: {
      dispatches: 0,
      evalUpserts: 0,
      evalBlobUploads: 0,
      evalEnqueues: 0,
      traceRecordings: 0,
    },
    shadow: {
      dispatches: 0,
      evalUpserts: 0,
      evalBlobUploads: 0,
      evalEnqueues: 0,
      traceRecordings: 0,
    },
  },
  effectBoundaryPayloads: {
    primary: [] as unknown[],
    shadow: [] as unknown[],
  },
}));

export { otelReplayMocks };

vi.mock("../../env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../env")>();
  return {
    ...actual,
    env: {
      ...actual.env,
      NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: undefined,
      LANGFUSE_EVENTS_DISPATCH_ENABLED: "false",
      LANGFUSE_OTEL_MEDIA_UPLOAD_ENABLED: "false",
      LANGFUSE_OTEL_EARLY_MEDIA_EXTRACTION_ENABLED: "false",
      LANGFUSE_OTEL_EARLY_MEDIA_EXTRACTION_PROJECT_IDS: [],
      LANGFUSE_OTEL_DIRECT_IMPLEMENTATION: "ts",
      LANGFUSE_OTEL_NATIVE_SHADOW_SAMPLE_RATE: 0,
      LANGFUSE_S3_MEDIA_UPLOAD_BUCKET: "otel-replay-test",
      LANGFUSE_S3_MEDIA_UPLOAD_PREFIX: "otel-replay/",
      LANGFUSE_OBSERVATION_FIELD_OVERFLOW_ENABLED: "false",
      LANGFUSE_OBSERVATION_FIELD_SIZE_LIMIT_BYTES: 2 * 1024 * 1024,
    },
  };
});

vi.mock("@langfuse/shared/src/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@langfuse/shared/src/server")>()),
  findModel: otelReplayMocks.findModel,
  findModelInPostgres: otelReplayMocks.findModelInPostgres,
  findPricingTiersForModel: otelReplayMocks.findPricingTiersForModel,
  hasNoEvalConfigsCache: otelReplayMocks.hasNoEvalConfigsCache,
  getS3EventStorageClient: otelReplayMocks.getS3EventStorageClient,
  linkMediaToTraceOrObservation: otelReplayMocks.linkMediaToTraceOrObservation,
  PromptService: class {
    getPrompt(...args: unknown[]) {
      return otelReplayMocks.getPrompt(...args);
    }
  },
  uploadMediaForTrace: otelReplayMocks.uploadMediaForTrace,
  recordIncrement: otelReplayMocks.recordIncrement,
}));

vi.mock("../../features/evaluation/fetchEvalRules", () => ({
  fetchEvalRules: otelReplayMocks.fetchEvalRules,
}));

vi.mock("../../features/evaluation/scheduleEvals", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../features/evaluation/scheduleEvals")
  >()),
  createEvalSchedulerDeps: otelReplayMocks.createEvalSchedulerDeps,
}));

vi.mock(
  "../../features/evaluation/observationEval/scheduleObservationEvals",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("../../features/evaluation/observationEval/scheduleObservationEvals")
      >();
    return {
      ...actual,
      scheduleObservationEvals: async (
        params: Parameters<typeof actual.scheduleObservationEvals>[0],
      ) => {
        await otelReplayMocks.scheduleObservationEvals(params);
        if (!replayControls.useActualEvaluationScheduler) return;

        const schedulerDeps = params.schedulerDeps;
        const isPrimaryScheduler =
          (schedulerDeps as { otelReplayPrimary?: boolean })
            .otelReplayPrimary === true;
        if (
          !isPrimaryScheduler &&
          !replayControls.wrappedSchedulerDeps.has(schedulerDeps)
        ) {
          replayControls.wrappedSchedulerDeps.add(schedulerDeps);
          const counts = replayControls.effectBoundaryCounts.shadow;
          const upsertJobExecution = schedulerDeps.upsertJobExecution;
          schedulerDeps.upsertJobExecution = async (...args) => {
            counts.evalUpserts += 1;
            return upsertJobExecution(...args);
          };
          const uploadObservationToS3 = schedulerDeps.uploadObservationToS3;
          schedulerDeps.uploadObservationToS3 = async (...args) => {
            counts.evalBlobUploads += 1;
            replayControls.effectBoundaryPayloads.shadow.push(
              structuredClone(args[0].data),
            );
            return uploadObservationToS3(...args);
          };
          const enqueueEvalJob = schedulerDeps.enqueueEvalJob;
          schedulerDeps.enqueueEvalJob = async (...args) => {
            counts.evalEnqueues += 1;
            return enqueueEvalJob(...args);
          };
          const schedulerDepsWithTrace =
            schedulerDeps as typeof schedulerDeps & {
              collectTraceActivity?: (activity: TraceSpanActivity) => void;
            };
          const collectTraceActivity =
            schedulerDepsWithTrace.collectTraceActivity;
          if (collectTraceActivity) {
            schedulerDepsWithTrace.collectTraceActivity = (activity) => {
              counts.traceRecordings += 1;
              return collectTraceActivity(activity);
            };
          }
        }

        await actual.scheduleObservationEvals(params);
      },
    };
  },
);

vi.mock(
  "../../features/traceDispatch/traceRuleRecording",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("../../features/traceDispatch/traceRuleRecording")
    >()),
    recordTraceActivity: otelReplayMocks.recordTraceActivity,
  }),
);

type OtelReplayEffectBoundaryCounts = {
  primary: {
    dispatches: number;
    evalUpserts: number;
    evalBlobUploads: number;
    evalEnqueues: number;
    traceRecordings: number;
  };
  shadow: {
    dispatches: number;
    evalUpserts: number;
    evalBlobUploads: number;
    evalEnqueues: number;
    traceRecordings: number;
  };
};

type OtelReplayEffectBoundaryPayloads = {
  primary: unknown[];
  shadow: unknown[];
};

function resetOtelReplayEffectBoundarySpies(): void {
  replayControls.useActualEvaluationScheduler = false;
  replayControls.wrappedSchedulerDeps = new WeakSet<object>();
  for (const counts of Object.values(replayControls.effectBoundaryCounts)) {
    counts.dispatches = 0;
    counts.evalUpserts = 0;
    counts.evalBlobUploads = 0;
    counts.evalEnqueues = 0;
    counts.traceRecordings = 0;
  }
  replayControls.effectBoundaryPayloads.primary.length = 0;
  replayControls.effectBoundaryPayloads.shadow.length = 0;
}

export function enableOtelReplayEffectBoundarySpies(): void {
  replayControls.useActualEvaluationScheduler = true;
}

export function getOtelReplayEffectBoundaryCounts(): OtelReplayEffectBoundaryCounts {
  return structuredClone(replayControls.effectBoundaryCounts);
}

export function getOtelReplayEffectBoundaryPayloads(): OtelReplayEffectBoundaryPayloads {
  return structuredClone(replayControls.effectBoundaryPayloads);
}

export function configureDefaultOtelReplayMocks(): void {
  for (const mock of Object.values(otelReplayMocks)) {
    mock.mockReset();
  }
  resetOtelReplayEffectBoundarySpies();

  otelReplayMocks.findModel.mockResolvedValue({
    model: null,
    pricingTiers: [],
  });
  otelReplayMocks.findModelInPostgres.mockImplementation(async (...args) => {
    return (await otelReplayMocks.findModel(...args)).model;
  });
  otelReplayMocks.findPricingTiersForModel.mockImplementation(async () => {
    return (await otelReplayMocks.findModel()).pricingTiers;
  });
  otelReplayMocks.linkMediaToTraceOrObservation.mockResolvedValue(undefined);
  otelReplayMocks.uploadMediaForTrace.mockResolvedValue({
    mediaId: "otel-replay-media",
    outcome: "uploaded",
  });
  otelReplayMocks.getPrompt.mockResolvedValue(null);
  otelReplayMocks.fetchEvalRules.mockResolvedValue({
    // Exercise the production evaluation parser on corpus and property replays.
    observationRules: [{}],
    traceTranscriptRules: [],
  });
  otelReplayMocks.hasNoEvalConfigsCache.mockResolvedValue(true);
  otelReplayMocks.createEvalSchedulerDeps.mockImplementation(
    (projectId: string) => {
      if (!replayControls.useActualEvaluationScheduler) {
        return {
          collectTraceActivity: vi.fn(),
          flushTraceActivity: vi.fn().mockResolvedValue(undefined),
          traceTranscriptRules: Promise.resolve([]),
        };
      }

      const traceActivities: unknown[] = [];
      const schedulerDeps = {
        otelReplayPrimary: true,
        upsertJobExecution: async ({ id }: { id: string }) => {
          replayControls.effectBoundaryCounts.primary.evalUpserts += 1;
          return { id };
        },
        uploadObservationToS3: async ({
          projectId: uploadProjectId,
          traceId,
          observationId,
          data,
        }: {
          projectId: string;
          traceId: string;
          observationId: string;
          data: Record<string, unknown>;
        }) => {
          replayControls.effectBoundaryCounts.primary.evalBlobUploads += 1;
          replayControls.effectBoundaryPayloads.primary.push(
            structuredClone(data),
          );
          return `otel-replay/evals/${uploadProjectId}/${traceId}/${observationId}.json`;
        },
        enqueueEvalJob: async () => {
          replayControls.effectBoundaryCounts.primary.evalEnqueues += 1;
        },
        collectTraceActivity: (activity: unknown) => {
          replayControls.effectBoundaryCounts.primary.traceRecordings += 1;
          traceActivities.push(activity);
        },
        flushTraceActivity: async () => {
          if (traceActivities.length === 0) return;
          replayControls.effectBoundaryCounts.primary.dispatches += 1;
          await otelReplayMocks.recordTraceActivity(
            projectId,
            structuredClone(traceActivities),
          );
          traceActivities.length = 0;
        },
        traceTranscriptRules: Promise.resolve([]),
      };
      return schedulerDeps;
    },
  );
  otelReplayMocks.recordTraceActivity.mockResolvedValue(undefined);
  otelReplayMocks.scheduleObservationEvals.mockResolvedValue(undefined);
}

type ReplayEnvironmentOptions = {
  mediaUploadEnabled?: boolean;
  earlyMediaExtractionEnabled?: boolean;
  overflowEnabled?: boolean;
  overflowSizeLimitBytes?: number;
  writeMode?: "events_only" | "dual";
  directImplementation?: "ts" | "rust";
  shadowSampleRate?: number;
  traceDispatchEnabled?: boolean;
  clickhouseMaxAttempts?: number;
  v4NativeOtelBehaviour?: "dual_write" | "direct";
};

/**
 * Disable unrelated production side effects while an isolated replay runs.
 * The returned function restores the worker environment object exactly.
 */
export function configureOtelReplayEnvironment(
  options: ReplayEnvironmentOptions = {},
): () => void {
  const original = {
    NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
    LANGFUSE_EVENTS_DISPATCH_ENABLED: env.LANGFUSE_EVENTS_DISPATCH_ENABLED,
    LANGFUSE_INGESTION_CLICKHOUSE_MAX_ATTEMPTS:
      env.LANGFUSE_INGESTION_CLICKHOUSE_MAX_ATTEMPTS,
    LANGFUSE_OTEL_MEDIA_UPLOAD_ENABLED: env.LANGFUSE_OTEL_MEDIA_UPLOAD_ENABLED,
    LANGFUSE_OTEL_EARLY_MEDIA_EXTRACTION_ENABLED:
      env.LANGFUSE_OTEL_EARLY_MEDIA_EXTRACTION_ENABLED,
    LANGFUSE_OTEL_EARLY_MEDIA_EXTRACTION_PROJECT_IDS:
      env.LANGFUSE_OTEL_EARLY_MEDIA_EXTRACTION_PROJECT_IDS,
    LANGFUSE_OTEL_DIRECT_IMPLEMENTATION:
      env.LANGFUSE_OTEL_DIRECT_IMPLEMENTATION,
    LANGFUSE_OTEL_NATIVE_SHADOW_SAMPLE_RATE:
      env.LANGFUSE_OTEL_NATIVE_SHADOW_SAMPLE_RATE,
    LANGFUSE_S3_MEDIA_UPLOAD_BUCKET: env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET,
    LANGFUSE_S3_MEDIA_UPLOAD_PREFIX: env.LANGFUSE_S3_MEDIA_UPLOAD_PREFIX,
    LANGFUSE_ENABLE_BLOB_STORAGE_FILE_LOG:
      env.LANGFUSE_ENABLE_BLOB_STORAGE_FILE_LOG,
    LANGFUSE_OBSERVATION_FIELD_OVERFLOW_ENABLED:
      env.LANGFUSE_OBSERVATION_FIELD_OVERFLOW_ENABLED,
    LANGFUSE_OBSERVATION_FIELD_SIZE_LIMIT_BYTES:
      env.LANGFUSE_OBSERVATION_FIELD_SIZE_LIMIT_BYTES,
    LANGFUSE_MIGRATION_V4_WRITE_MODE: env.LANGFUSE_MIGRATION_V4_WRITE_MODE,
    LANGFUSE_MIGRATION_V4_NATIVE_OTEL_BEHAVIOUR:
      env.LANGFUSE_MIGRATION_V4_NATIVE_OTEL_BEHAVIOUR,
  };

  Object.assign(env, {
    NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: undefined,
    LANGFUSE_EVENTS_DISPATCH_ENABLED: options.traceDispatchEnabled
      ? "true"
      : "false",
    LANGFUSE_OTEL_MEDIA_UPLOAD_ENABLED: options.mediaUploadEnabled
      ? "true"
      : "false",
    LANGFUSE_OTEL_EARLY_MEDIA_EXTRACTION_ENABLED:
      options.earlyMediaExtractionEnabled ? "true" : "false",
    LANGFUSE_OTEL_EARLY_MEDIA_EXTRACTION_PROJECT_IDS:
      options.earlyMediaExtractionEnabled ? ["*"] : [],
    LANGFUSE_OTEL_DIRECT_IMPLEMENTATION: options.directImplementation ?? "ts",
    LANGFUSE_OTEL_NATIVE_SHADOW_SAMPLE_RATE: options.shadowSampleRate ?? 0,
    LANGFUSE_INGESTION_CLICKHOUSE_MAX_ATTEMPTS:
      options.clickhouseMaxAttempts ?? 3,
    LANGFUSE_S3_MEDIA_UPLOAD_BUCKET: "otel-replay-test",
    LANGFUSE_S3_MEDIA_UPLOAD_PREFIX: "otel-replay/",
    LANGFUSE_ENABLE_BLOB_STORAGE_FILE_LOG: "false",
    LANGFUSE_OBSERVATION_FIELD_OVERFLOW_ENABLED: options.overflowEnabled
      ? "true"
      : "false",
    LANGFUSE_OBSERVATION_FIELD_SIZE_LIMIT_BYTES:
      options.overflowSizeLimitBytes ?? 2 * 1024 * 1024,
    LANGFUSE_MIGRATION_V4_WRITE_MODE: options.writeMode ?? "events_only",
    // Default to direct events-table writes. Routing tests select dual_write
    // to check that ingestionVersion=4 opts a payload into direct processing.
    LANGFUSE_MIGRATION_V4_NATIVE_OTEL_BEHAVIOUR:
      options.v4NativeOtelBehaviour ?? "direct",
  });

  return () => Object.assign(env, original);
}

configureDefaultOtelReplayMocks();
