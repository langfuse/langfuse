import type {
  FinalizedOtelBatch,
  OtelOverflowRequest,
  PreparedEvent,
} from "@langfuse/native";
import {
  findModelInPostgres,
  findPricingTiersForModel,
  PromptService,
  SkillCacheService,
  type ModelWithPrices,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import type { EvalRules } from "../evaluation/fetchEvalRules";
import type { EvalSchedulerDeps } from "../evaluation/scheduleEvals";
import type { ObservationEvalSchedulerDeps } from "../evaluation/observationEval/types";
import type { TraceSpanActivity } from "../traceDispatch/traceRuleRecording";
import { TableName } from "../../services/ClickhouseWriter/types";
import {
  emitOtelCaptureFailure,
  emitOtelEffect,
  emitOtelOperationFailure,
  hashOtelObservation,
  type OtelEffect,
  type OtelMediaUploadEffect,
  type OtelShadowCapture,
} from "./otelEffectsCapture";

type NativeOtelMediaUploadIdentity = Pick<
  OtelMediaUploadEffect,
  | "kind"
  | "projectId"
  | "traceId"
  | "observationId"
  | "field"
  | "contentType"
  | "sha256Hash"
  | "origin"
  | "writePath"
  | "mediaPath"
>;

type NativeOtelMediaReplayResult = OtelMediaUploadEffect["result"];
export type NativeOtelMediaSuccess = Extract<
  NativeOtelMediaReplayResult,
  { mediaId: string }
>;
type NativeOtelMediaReplay = (
  identity: NativeOtelMediaUploadIdentity,
) => NativeOtelMediaReplayResult | undefined;

export type NativeOtelUploadRequest = {
  kind: "media" | "overflow";
  identity: NativeOtelMediaUploadIdentity;
  byteLengthUpperBound: number;
  /** The shadow path does not call this unless a custom replay needs it. */
  loadBody: () => Promise<Buffer>;
};

type NativeOtelFinalizedEvent = FinalizedOtelBatch["events"][number];

export type NativeOtelLookupServices = {
  findModel: (params: {
    projectId: string;
    model: string;
  }) => Promise<ModelWithPrices>;
  prompts: PromptService;
  skills: SkillCacheService;
};

export type NativeOtelProcessingEffects = {
  uploadMedia: (
    request: NativeOtelUploadRequest,
  ) => Promise<NativeOtelMediaSuccess>;
  /** The finalized start time is handed to shadow row-locator wiring. */
  writeEvent: (event: PreparedEvent, startTimeIso: string) => void;
  createEvalSchedulerDeps: (
    projectId: string,
    rules: EvalRules,
  ) => EvalSchedulerDeps;
  /** The primary path's rules and rate avoid shadow refetches and config drift. */
  evalRules?: EvalRules;
  traceDispatchSamplingRate?: number;
  /** Shadow operation failures are simulated, never production outcomes. */
  captureMode?: "actual" | "simulated";
  /** Optional read-only/captured replacements for production lookup work. */
  lookupServices?: NativeOtelLookupServices;
  recordIngestionCounts: (records: NativeOtelFinalizedEvent[]) => void;
  recordOverflowMetrics: (params: {
    request: OtelOverflowRequest;
    reference?: string;
    outcome: string;
  }) => void;
  recordMediaBatchMetrics: (params: {
    bytesProcessed: number;
    durationMs: number;
  }) => void;
  recordExtractedMediaUpload: (
    outcome: "uploaded" | "reused" | "failed",
    kind: string,
    byteLength?: number,
    bytesRemoved?: number,
  ) => void;
  capture?: OtelShadowCapture;
};

type NativeOtelShadowWriter = {
  addToQueue: (
    table: TableName.EventsFull,
    event: PreparedEvent,
    startTimeIso: string,
  ) => void;
};

type NativeOtelShadowInputs = {
  capture: OtelShadowCapture;
  writer: NativeOtelShadowWriter;
  /** Consumes exactly one primary result for each matching upload occurrence. */
  replayUpload: NativeOtelMediaReplay;
  /** Captured from the primary path; no native shadow refetch is performed. */
  evalRules: EvalRules;
  /** Captured from the primary path; no Topics/config sampling read is performed. */
  traceDispatchSamplingRate: number;
  /** Prepared once by the primary scheduler; avoids a second Topics gate read. */
  traceTranscriptRules: EvalSchedulerDeps["traceTranscriptRules"];
};

/** Build a stable cross-path key from identity only, excluding body and result. */
function getNativeOtelMediaUploadKey(
  identity: NativeOtelMediaUploadIdentity,
): string {
  return JSON.stringify([
    identity.kind,
    identity.projectId,
    identity.traceId,
    identity.observationId ?? null,
    identity.field,
    identity.contentType,
    identity.sha256Hash,
    identity.origin,
  ]);
}

function shadowObservationPath(
  projectId: string,
  traceId: string,
  observationId: string,
): string {
  return `shadow://eval/${encodeURIComponent(projectId)}/${encodeURIComponent(traceId)}/${encodeURIComponent(observationId)}`;
}

function createShadowEvalSchedulerDeps(
  projectId: string,
  capture: OtelShadowCapture,
  traceTranscriptRules: EvalSchedulerDeps["traceTranscriptRules"],
): EvalSchedulerDeps {
  const executions = new Map<
    string,
    Parameters<ObservationEvalSchedulerDeps["upsertJobExecution"]>[0]
  >();
  const observations = new Map<
    string,
    {
      traceId: string;
      observationId: string;
      observationHash: string;
    }
  >();
  const traceActivities: TraceSpanActivity[] = [];

  const observationDeps: ObservationEvalSchedulerDeps = {
    upsertJobExecution: async (params) => {
      executions.set(params.id, params);
      emitOtelEffect(capture, {
        kind: "eval-upsert",
        projectId: params.projectId,
        jobExecutionId: params.id,
        jobConfigurationId: params.jobConfigurationId,
      });
      return { id: params.id };
    },
    uploadObservationToS3: async (params) => {
      const path = shadowObservationPath(
        params.projectId,
        params.traceId,
        params.observationId,
      );
      let observationHash: string;
      try {
        observationHash = hashOtelObservation(params.data);
      } catch (error) {
        emitOtelCaptureFailure(capture, "observation-hash", "simulated", error);
        throw error;
      }
      observations.set(path, {
        traceId: params.traceId,
        observationId: params.observationId,
        observationHash,
      });
      emitOtelEffect(capture, {
        kind: "eval-blob-upload",
        projectId: params.projectId,
        traceId: params.traceId,
        observationId: params.observationId,
        observationHash,
      });
      return path;
    },
    enqueueEvalJob: async (params) => {
      const execution = executions.get(params.jobExecutionId);
      const upload = observations.get(params.observationS3Path);
      if (!execution || !upload) {
        const error = new Error(
          `Shadow observation eval state is incomplete for ${params.jobExecutionId}`,
        );
        emitOtelOperationFailure(capture, {
          operation: "eval-enqueue",
          mode: "simulated",
          projectId,
          traceId: upload?.traceId,
          observationId: upload?.observationId,
          error,
        });
        throw error;
      }

      const effect: OtelEffect = {
        kind: "observation-eval",
        projectId: execution.projectId,
        traceId: upload.traceId,
        observationId: upload.observationId,
        jobExecutionId: params.jobExecutionId,
        jobConfigurationId: execution.jobConfigurationId,
        jobInputTraceId: execution.jobInputTraceId,
        jobInputObservationId: execution.jobInputObservationId,
        jobTemplateId: execution.jobTemplateId,
        observationHash: upload.observationHash,
        request: params,
      };
      emitOtelEffect(capture, effect);
    },
  };

  return {
    ...observationDeps,
    traceTranscriptRules,
    collectTraceActivity: (activity) => {
      traceActivities.push(activity);
    },
    flushTraceActivity: async () => {
      const pending = traceActivities.splice(0);
      for (const activity of pending) {
        emitOtelEffect(capture, {
          kind: "trace-recording",
          projectId,
          traceId: activity.traceId,
          spanStartTimeISO: activity.spanStartTimeISO,
          ruleIds: activity.ruleIds,
          serializedEventBytes: activity.serializedEventBytes,
        });
      }
    },
  };
}

/**
 * Use the same Postgres lookup semantics without reading or populating Redis
 * caches. Pricing tiers are queried instead of fabricated, so shadow cannot
 * silently change cost attribution.
 */
function createReadOnlyNativeOtelLookupServices(): NativeOtelLookupServices {
  return {
    findModel: async ({ projectId, model }) => {
      const matched = await findModelInPostgres({ projectId, model });
      if (!matched) return { model: null, pricingTiers: [] };
      return {
        model: matched,
        pricingTiers: await findPricingTiersForModel(matched.id),
      };
    },
    prompts: new PromptService(prisma, null, undefined, false),
    skills: new SkillCacheService(prisma, null),
  };
}

export function createNativeOtelShadowEffects(
  inputs: NativeOtelShadowInputs,
): NativeOtelProcessingEffects {
  return {
    uploadMedia: async ({ identity }) => {
      const replay = inputs.replayUpload(identity);
      if (!replay) {
        const error = new Error(
          `No replayed Rust OTEL media result for ${getNativeOtelMediaUploadKey(identity)}`,
        );
        emitOtelOperationFailure(inputs.capture, {
          operation: "native-media-upload",
          mode: "simulated",
          projectId: identity.projectId,
          traceId: identity.traceId,
          observationId: identity.observationId,
          error,
        });
        throw error;
      }
      if (replay.outcome === "failed")
        throw new Error("replayed media upload failed");
      return replay;
    },
    writeEvent: (event, startTimeIso) =>
      inputs.writer.addToQueue(TableName.EventsFull, event, startTimeIso),
    createEvalSchedulerDeps: (projectId) =>
      createShadowEvalSchedulerDeps(
        projectId,
        inputs.capture,
        inputs.traceTranscriptRules,
      ),
    evalRules: inputs.evalRules,
    traceDispatchSamplingRate: inputs.traceDispatchSamplingRate,
    lookupServices: createReadOnlyNativeOtelLookupServices(),
    recordIngestionCounts: () => undefined,
    recordOverflowMetrics: () => undefined,
    recordMediaBatchMetrics: () => undefined,
    recordExtractedMediaUpload: () => undefined,
    capture: inputs.capture,
    captureMode: "simulated",
  };
}
