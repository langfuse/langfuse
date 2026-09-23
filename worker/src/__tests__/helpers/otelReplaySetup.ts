import { vi } from "vitest";
import { env } from "../../env";

const otelReplayMocks = vi.hoisted(() => ({
  findModel: vi.fn(),
  uploadMediaForTrace: vi.fn(),
  getPrompt: vi.fn(),
  fetchObservationEvalRules: vi.fn(),
  createObservationEvalSchedulerDeps: vi.fn(),
  scheduleObservationEvals: vi.fn(),
}));

export { otelReplayMocks };

vi.mock("../../env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../env")>();
  return {
    ...actual,
    env: {
      ...actual.env,
      NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: undefined,
      LANGFUSE_TRACE_BATCH_INGESTION_ENABLED: "false",
      LANGFUSE_OTEL_MEDIA_UPLOAD_ENABLED: "false",
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
  PromptService: class {
    getPrompt(...args: unknown[]) {
      return otelReplayMocks.getPrompt(...args);
    }
  },
  uploadMediaForTrace: otelReplayMocks.uploadMediaForTrace,
}));

vi.mock(
  "../../features/evaluation/observationEval",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("../../features/evaluation/observationEval")
    >()),
    fetchObservationEvalRules: otelReplayMocks.fetchObservationEvalRules,
    createObservationEvalSchedulerDeps:
      otelReplayMocks.createObservationEvalSchedulerDeps,
    scheduleObservationEvals: otelReplayMocks.scheduleObservationEvals,
  }),
);

export function configureDefaultOtelReplayMocks(): void {
  for (const mock of Object.values(otelReplayMocks)) {
    mock.mockReset();
  }

  otelReplayMocks.findModel.mockResolvedValue({
    model: null,
    pricingTiers: [],
  });
  otelReplayMocks.uploadMediaForTrace.mockResolvedValue({
    mediaId: "otel-replay-media",
    outcome: "uploaded",
  });
  otelReplayMocks.getPrompt.mockResolvedValue(null);
  otelReplayMocks.fetchObservationEvalRules.mockResolvedValue([]);
  otelReplayMocks.createObservationEvalSchedulerDeps.mockReturnValue({});
  otelReplayMocks.scheduleObservationEvals.mockResolvedValue(undefined);
}

type ReplayEnvironmentOptions = {
  mediaUploadEnabled?: boolean;
  overflowEnabled?: boolean;
  overflowSizeLimitBytes?: number;
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
    LANGFUSE_TRACE_BATCH_INGESTION_ENABLED:
      env.LANGFUSE_TRACE_BATCH_INGESTION_ENABLED,
    LANGFUSE_INGESTION_CLICKHOUSE_MAX_ATTEMPTS:
      env.LANGFUSE_INGESTION_CLICKHOUSE_MAX_ATTEMPTS,
    LANGFUSE_OTEL_MEDIA_UPLOAD_ENABLED: env.LANGFUSE_OTEL_MEDIA_UPLOAD_ENABLED,
    LANGFUSE_S3_MEDIA_UPLOAD_BUCKET: env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET,
    LANGFUSE_S3_MEDIA_UPLOAD_PREFIX: env.LANGFUSE_S3_MEDIA_UPLOAD_PREFIX,
    LANGFUSE_OBSERVATION_FIELD_OVERFLOW_ENABLED:
      env.LANGFUSE_OBSERVATION_FIELD_OVERFLOW_ENABLED,
    LANGFUSE_OBSERVATION_FIELD_SIZE_LIMIT_BYTES:
      env.LANGFUSE_OBSERVATION_FIELD_SIZE_LIMIT_BYTES,
  };

  Object.assign(env, {
    NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: undefined,
    LANGFUSE_TRACE_BATCH_INGESTION_ENABLED: "false",
    LANGFUSE_INGESTION_CLICKHOUSE_MAX_ATTEMPTS: 3,
    LANGFUSE_OTEL_MEDIA_UPLOAD_ENABLED: options.mediaUploadEnabled
      ? "true"
      : "false",
    LANGFUSE_S3_MEDIA_UPLOAD_BUCKET: "otel-replay-test",
    LANGFUSE_S3_MEDIA_UPLOAD_PREFIX: "otel-replay/",
    LANGFUSE_OBSERVATION_FIELD_OVERFLOW_ENABLED: options.overflowEnabled
      ? "true"
      : "false",
    LANGFUSE_OBSERVATION_FIELD_SIZE_LIMIT_BYTES:
      options.overflowSizeLimitBytes ?? 2 * 1024 * 1024,
  });

  return () => Object.assign(env, original);
}

configureDefaultOtelReplayMocks();
