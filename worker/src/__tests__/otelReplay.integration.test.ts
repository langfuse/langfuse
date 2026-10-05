import "./helpers/otelReplaySetup";

import { Decimal } from "decimal.js";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { env } from "../env";
import {
  createOrgProjectAndApiKey,
  IngestionQueue,
  QueueJobs,
  TraceUpsertQueue,
  type ResourceSpan,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { runOtelReplay } from "./helpers/otelReplayHarness";
import {
  configureDefaultOtelReplayMocks,
  configureOtelReplayEnvironment,
  otelReplayMocks,
} from "./helpers/otelReplaySetup";

const PROJECT_ID = "otel-replay-integration";
const FILE_KEY = "otel-replay/integration.json";
const TRACE_ID = "11111111111111111111111111111111";
const SECOND_TRACE_ID = "44444444444444444444444444444444";
const FIRST_SPAN_ID = "2222222222222222";
const SECOND_SPAN_ID = "3333333333333333";

async function getTraceUpsertJobsForProject(projectId: string) {
  const jobsByShard = await Promise.all(
    TraceUpsertQueue.getShardNames().map(async (shardName) => {
      const queue = TraceUpsertQueue.getInstance({ shardName });
      return queue
        ? queue.getJobs(["waiting", "delayed", "prioritized", "active"])
        : [];
    }),
  );

  return jobsByShard
    .flat()
    .filter((job) => job.data.payload.projectId === projectId);
}

async function getIngestionJobsForProject(projectId: string) {
  const jobsByShard = await Promise.all(
    IngestionQueue.getShardNames().map(async (shardName) => {
      const queue = IngestionQueue.getInstance({ shardName });
      return queue
        ? queue.getJobs(["waiting", "delayed", "prioritized", "active"])
        : [];
    }),
  );

  return jobsByShard
    .flat()
    .filter((job) => job.data.payload.authCheck.scope.projectId === projectId);
}

function createBufferId(hex: string): Buffer {
  return Buffer.from(hex, "hex");
}

function stringAttribute(key: string, value: string) {
  return { key, value: { stringValue: value } };
}

function intAttribute(key: string, value: number) {
  return {
    key,
    value: { intValue: { low: value, high: 0, unsigned: false } },
  };
}

function buildResourceSpans(
  options: { separateTraces?: boolean } = {},
): ResourceSpan[] {
  const imageDataUri = `data:image/png;base64,${Buffer.from("small-image").toString("base64")}`;
  const commonAttributes = [
    stringAttribute("langfuse.observation.type", "generation"),
    stringAttribute("langfuse.observation.model.name", "gpt-4o-mini"),
    stringAttribute("langfuse.observation.prompt.name", "replay-prompt"),
    intAttribute("langfuse.observation.prompt.version", 3),
    stringAttribute("langfuse.trace.name", "replay-trace"),
    stringAttribute("user.id", "replay-user"),
    stringAttribute("session.id", "replay-session"),
    stringAttribute("langfuse.observation.metadata.source", "integration"),
    { key: "gen_ai.request.temperature", value: { doubleValue: 0.25 } },
  ];

  return [
    {
      resource: {
        attributes: [
          stringAttribute("service.name", "otel-replay-service"),
          stringAttribute("service.version", "1.2.3"),
          stringAttribute("telemetry.sdk.language", "typescript"),
          stringAttribute("telemetry.sdk.name", "otel-replay"),
          stringAttribute("telemetry.sdk.version", "0.1.0"),
          stringAttribute("langfuse.environment", "integration"),
          stringAttribute("langfuse.release", "replay-release"),
        ],
      },
      scopeSpans: [
        {
          scope: { name: "langfuse-sdk", version: "3.0.0" },
          spans: [
            {
              traceId: createBufferId(TRACE_ID),
              spanId: createBufferId(FIRST_SPAN_ID),
              name: "replay-generation-with-media",
              kind: 1,
              startTimeUnixNano: "1714488530686000000",
              endTimeUnixNano: "1714488530687000000",
              attributes: [
                ...commonAttributes,
                stringAttribute("langfuse.observation.input", imageDataUri),
                stringAttribute(
                  "langfuse.observation.output",
                  "short replay answer",
                ),
              ],
              status: { code: 0 },
            },
            {
              traceId: createBufferId(
                options.separateTraces ? SECOND_TRACE_ID : TRACE_ID,
              ),
              spanId: createBufferId(SECOND_SPAN_ID),
              ...(options.separateTraces
                ? {}
                : { parentSpanId: createBufferId(FIRST_SPAN_ID) }),
              name: "replay-generation-with-overflow",
              kind: 1,
              startTimeUnixNano: "1714488531686000000",
              endTimeUnixNano: "1714488531687000000",
              attributes: [
                ...commonAttributes,
                stringAttribute("langfuse.observation.input", "plain input"),
                stringAttribute(
                  "langfuse.observation.output",
                  "x".repeat(1024),
                ),
                stringAttribute(
                  "langfuse.observation.cost_details",
                  JSON.stringify({
                    input: 1_500_000,
                    output: -1_500_000,
                    total: 1_500_000,
                  }),
                ),
              ],
              status: { code: 0 },
            },
          ],
        },
      ],
    },
  ];
}

// Vitest retries can overlap unfinished ClickHouse I/O and shared replay mocks.
describe(
  "OTEL replay persists enriched observations after media and overflow handling",
  { retry: 0, timeout: 120_000 },
  () => {
    let restoreEnvironment: (() => void) | undefined;

    beforeEach(() => {
      configureDefaultOtelReplayMocks();
      restoreEnvironment = configureOtelReplayEnvironment({
        mediaUploadEnabled: true,
        overflowEnabled: true,
        overflowSizeLimitBytes: 256,
      });

      const model = {
        id: "otel-replay-model",
        modelName: "gpt-4o-mini",
        tokenizerId: "openai",
        tokenizerConfig: { tokenizerModel: "gpt-4o" },
      };
      otelReplayMocks.findModel.mockResolvedValue({
        model,
        pricingTiers: [
          {
            id: "otel-replay-tier",
            name: "Replay default",
            isDefault: true,
            priority: 0,
            conditions: [],
            prices: [
              { usageType: "input", price: new Decimal("0.01") },
              { usageType: "output", price: new Decimal("0.02") },
            ],
          },
        ],
      });
      otelReplayMocks.getPrompt.mockResolvedValue({ id: "replay-prompt-id" });
      otelReplayMocks.fetchObservationEvalRules.mockResolvedValue([{}]);
      otelReplayMocks.createObservationEvalSchedulerDeps.mockReturnValue({});
      otelReplayMocks.scheduleObservationEvals.mockResolvedValue(undefined);
      otelReplayMocks.uploadMediaForTrace.mockImplementation(
        async (params: { field: string }) => ({
          mediaId:
            params.field === "input" ? "image-media-id" : "overflow-media-id",
          outcome: "uploaded" as const,
        }),
      );
    });

    afterEach(() => {
      restoreEnvironment?.();
      restoreEnvironment = undefined;
      // The test owns this mutable mock setup; restore its deterministic
      // defaults so another worker suite in the same process is unaffected.
      configureDefaultOtelReplayMocks();
    });

    it("writes both enriched observations and preserves accounting through readback", async () => {
      const { storedRows } = await runOtelReplay({
        bytes: Buffer.from(JSON.stringify(buildResourceSpans())),
        projectId: PROJECT_ID,
        fileKey: FILE_KEY,
        mediaUploadEnabled: true,
        overflowEnabled: true,
        overflowSizeLimitBytes: 256,
      });

      expect(storedRows).toHaveLength(2);
      expect(otelReplayMocks.scheduleObservationEvals).toHaveBeenCalledTimes(2);

      const rowsBySpanId = new Map(
        storedRows.map((row) => [String(row.span_id), row]),
      );
      const firstRow = rowsBySpanId.get(FIRST_SPAN_ID);
      const secondRow = rowsBySpanId.get(SECOND_SPAN_ID);
      expect(firstRow).toBeDefined();
      expect(secondRow).toBeDefined();

      expect(firstRow).toMatchObject({
        project_id: PROJECT_ID,
        trace_id: TRACE_ID,
        span_id: FIRST_SPAN_ID,
        parent_span_id: "",
        name: "replay-generation-with-media",
        type: "GENERATION",
        environment: "integration",
        release: "replay-release",
        trace_name: "replay-trace",
        user_id: "replay-user",
        session_id: "replay-session",
        prompt_id: "replay-prompt-id",
        prompt_name: "replay-prompt",
        prompt_version: 3,
        model_id: "otel-replay-model",
        provided_model_name: "gpt-4o-mini",
        usage_pricing_tier_id: "otel-replay-tier",
        usage_pricing_tier_name: "Replay default",
        ingestion_sdk_name: "otel-replay",
        ingestion_sdk_version: "test",
        blob_storage_file_path: FILE_KEY,
      });
      expect(String(firstRow?.input)).toContain(
        "@@@langfuseMedia:type=image/png|id=image-media-id|source=",
      );
      expect(firstRow?.output).toBe("short replay answer");
      expect(firstRow?.metadata_names).toContain("source");
      expect(firstRow?.metadata_values).toContain("integration");
      expect(
        Number((firstRow?.usage_details as Record<string, unknown>).input),
      ).toBeGreaterThan(0);
      expect(
        Number((firstRow?.usage_details as Record<string, unknown>).output),
      ).toBeGreaterThan(0);
      expect(
        Number((firstRow?.cost_details as Record<string, unknown>).total),
      ).toBeGreaterThan(0);

      expect(secondRow).toMatchObject({
        project_id: PROJECT_ID,
        trace_id: TRACE_ID,
        span_id: SECOND_SPAN_ID,
        parent_span_id: FIRST_SPAN_ID,
        name: "replay-generation-with-overflow",
        type: "GENERATION",
        prompt_id: "replay-prompt-id",
        model_id: "otel-replay-model",
        provided_model_name: "gpt-4o-mini",
        usage_details: {},
        provided_cost_details: {
          input: 999_999.999999,
          output: -999_999.999999,
          total: 999_999.999999,
        },
        cost_details: {
          input: 999_999.999999,
          output: -999_999.999999,
          total: 999_999.999999,
        },
      });
      expect(secondRow?.input).toBe("plain input");
      expect(secondRow?.output).toBe(
        "@@@langfuseMedia:type=text/plain|id=overflow-media-id|source=field_size_limit@@@",
      );

      for (const row of storedRows) {
        expect(Number(row.event_bytes)).toBeGreaterThan(0);
      }
    });

    it("preserves JavaScript rounding for unsafe OTLP numbers in the raw document", async () => {
      // Keep the number literal in the S3 document. Serializing a JS object
      // first would round it before the production queue reads the bytes.
      const bytes = Buffer.from(
        `[{"resource":{"attributes":[]},"scopeSpans":[{"scope":{"name":"otel-replay"},"spans":[{"traceId":"${TRACE_ID}","spanId":"${FIRST_SPAN_ID}","name":"unsafe-number","startTimeUnixNano":"1714488530686000000","endTimeUnixNano":"1714488530687000000","attributes":[{"key":"gen_ai.request.temperature","value":{"doubleValue":9007199254740993}}],"status":{"code":0}}]}]}]`,
      );
      const { storedRows } = await runOtelReplay({
        bytes,
        projectId: `${PROJECT_ID}-unsafe-number`,
        fileKey: `${FILE_KEY}.unsafe-number`,
        mediaUploadEnabled: true,
      });

      expect(storedRows).toHaveLength(1);
      const metadataIndex = (storedRows[0].metadata_names as string[]).indexOf(
        "attributes.gen_ai.request.temperature",
      );
      expect(metadataIndex).toBeGreaterThanOrEqual(0);
      expect(storedRows[0].metadata_values?.[metadataIndex]).toBe(
        "9007199254740992",
      );
    });

    it("persists legacy and events_full rows from raw OTEL bytes in dual mode", async () => {
      const { projectId, orgId } = await createOrgProjectAndApiKey();
      const originalBlobStorageFileLogFlag =
        env.LANGFUSE_ENABLE_BLOB_STORAGE_FILE_LOG;
      env.LANGFUSE_ENABLE_BLOB_STORAGE_FILE_LOG = "true";
      try {
        const { storedRows, legacyRows } = await runOtelReplay({
          bytes: Buffer.from(JSON.stringify(buildResourceSpans())),
          projectId,
          orgId,
          fileKey: `${FILE_KEY}.dual-write`,
          writeMode: "dual",
        });

        expect(storedRows).toHaveLength(2);
        expect(legacyRows?.traces?.length).toBeGreaterThan(0);
        expect(legacyRows?.observations).toHaveLength(2);
        expect(legacyRows?.observations_batch_staging).toHaveLength(0);
        expect(await getTraceUpsertJobsForProject(projectId)).toHaveLength(0);
      } finally {
        const traceJobs = await getTraceUpsertJobsForProject(projectId);
        await Promise.allSettled(traceJobs.map((job) => job.remove()));
        env.LANGFUSE_ENABLE_BLOB_STORAGE_FILE_LOG =
          originalBlobStorageFileLogFlag;
        await prisma.project.delete({ where: { id: projectId } });
        await prisma.organization.delete({ where: { id: orgId } });
      }
    });

    it("removes replay-owned ingestion jobs when a legacy replay job fails", async () => {
      const { projectId, orgId } = await createOrgProjectAndApiKey();
      const originalBlobStorageFileLogFlag =
        env.LANGFUSE_ENABLE_BLOB_STORAGE_FILE_LOG;
      env.LANGFUSE_ENABLE_BLOB_STORAGE_FILE_LOG = "false";

      const unrelatedQueue = IngestionQueue.getInstance({
        shardingKey: `${projectId}-unrelated`,
      });
      if (!unrelatedQueue)
        throw new Error("Ingestion queue is not initialized");
      const unrelatedJob = await unrelatedQueue.add(QueueJobs.IngestionJob, {
        id: `otel-replay-unrelated-${randomUUID()}`,
        timestamp: new Date(),
        name: QueueJobs.IngestionJob,
        payload: {
          data: {
            type: "span-create",
            eventBodyId: `otel-replay-unrelated-${randomUUID()}`,
            fileKey: "unrelated.json",
            bucketPrefix: "otel-replay/unrelated/",
            ingestionApiKey: "",
            ingestionSdkName: "otel-replay-test",
            ingestionSdkVersion: "test",
          },
          authCheck: {
            validKey: true,
            scope: { projectId, orgId, accessLevel: "project" },
          },
        },
      });

      try {
        await expect(
          runOtelReplay({
            bytes: Buffer.from(
              JSON.stringify(buildResourceSpans({ separateTraces: true })),
            ),
            projectId,
            orgId,
            fileKey: `${FILE_KEY}.legacy-failure`,
            writeMode: "dual",
            failLegacyQueueProcessing: true,
          }),
        ).rejects.toThrow("simulated legacy ingestion read failure");

        const remainingJobs = await getIngestionJobsForProject(projectId);
        expect(remainingJobs.map((job) => job.id)).toEqual([unrelatedJob.id]);
      } finally {
        const remainingJobs = await getIngestionJobsForProject(projectId);
        await Promise.allSettled(remainingJobs.map((job) => job.remove()));
        const traceJobs = await getTraceUpsertJobsForProject(projectId);
        await Promise.allSettled(traceJobs.map((job) => job.remove()));
        env.LANGFUSE_ENABLE_BLOB_STORAGE_FILE_LOG =
          originalBlobStorageFileLogFlag;
        await prisma.project.delete({ where: { id: projectId } });
        await prisma.organization.delete({ where: { id: orgId } });
      }
    });
  },
);
