import "./helpers/otelReplaySetup";

import { createHash, randomUUID } from "node:crypto";
import { Decimal } from "decimal.js";
import { validateOtelJson } from "@langfuse/native";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "../env";
import { env as sharedEnv, type SharedEnv } from "@langfuse/shared/src/env";
import { MediaAssociationOrigin } from "@langfuse/shared";
import {
  createOrgProjectAndApiKey,
  IngestionQueue,
  QueueJobs,
  TraceUpsertQueue,
  linkMediaToTraceOrObservation,
  type ResourceSpan,
  uploadMediaForTrace,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import * as masking from "@langfuse/shared/src/server/ee/ingestionMasking";
import * as otelPreparation from "../features/otel-ingestion/prepareOtelBatch";
import {
  comparableOtelReplayRows,
  expectRawOtelReplayParity,
  runOtelReplayComparison,
  runOneOtelReplay,
  type OtelRawReplayComparison,
} from "./helpers/otelReplayHarness";
import {
  configureDefaultOtelReplayMocks,
  configureOtelReplayEnvironment,
  otelReplayMocks,
} from "./helpers/otelReplaySetup";

vi.mock(
  "@langfuse/shared/src/server/ee/ingestionMasking",
  async (importOriginal) => {
    const actual = await importOriginal<typeof masking>();
    return {
      ...actual,
      applyIngestionMasking: vi.fn(actual.applyIngestionMasking),
      isIngestionMaskingEnabled: vi.fn(actual.isIngestionMaskingEnabled),
    };
  },
);

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

type MediaUploadCall = Parameters<typeof uploadMediaForTrace>[0];
type MediaLinkCall = Parameters<typeof linkMediaToTraceOrObservation>[0];

type MediaAssociation = {
  mediaId: string;
  traceId: string;
  observationId?: string | null;
  field: string;
  contentType: string;
  contentLength: number;
  contentBase64: string;
  contentDigest: string;
  origin: string;
};

function mediaIdForField(field: string): string {
  return field === "input" ? "image-media-id" : "overflow-media-id";
}

function mediaAssociationFromUpload(params: MediaUploadCall): MediaAssociation {
  const contentBytes = Buffer.from(params.contentBytes);
  const contentDigest = createHash("sha256")
    .update(contentBytes)
    .digest("base64");
  if (params.sha256Hash !== undefined) {
    expect(params.sha256Hash).toBe(contentDigest);
  }
  return {
    mediaId: mediaIdForField(params.field),
    traceId: params.traceId,
    observationId: params.observationId,
    field: params.field,
    contentType: params.contentType,
    contentLength: contentBytes.length,
    contentBase64: contentBytes.toString("base64"),
    contentDigest,
    origin: params.origin,
  };
}

function mediaAssociationKey(association: MediaAssociation): string {
  return [
    association.mediaId,
    association.traceId,
    association.observationId,
    association.field,
    association.origin,
    association.contentDigest,
  ]
    .map((value) => value ?? "")
    .join("\u0000");
}

function sortedMediaAssociations(
  associations: MediaAssociation[],
): MediaAssociation[] {
  return associations.sort((left, right) =>
    mediaAssociationKey(left).localeCompare(mediaAssociationKey(right)),
  );
}

function createMediaAssociationCapture(): () => MediaAssociation[] {
  let uploadCursor = 0;
  let linkCursor = 0;

  return () => {
    const uploads = otelReplayMocks.uploadMediaForTrace.mock.calls
      .slice(uploadCursor)
      .map(([rawParams]) =>
        mediaAssociationFromUpload(rawParams as MediaUploadCall),
      );
    const links = otelReplayMocks.linkMediaToTraceOrObservation.mock.calls
      .slice(linkCursor)
      .map(([rawParams]) => rawParams as MediaLinkCall);
    uploadCursor = otelReplayMocks.uploadMediaForTrace.mock.calls.length;
    linkCursor =
      otelReplayMocks.linkMediaToTraceOrObservation.mock.calls.length;

    const assetsById = new Map(
      uploads.map((upload) => [upload.mediaId, upload]),
    );
    const associations = new Map(
      uploads.map((upload) => [mediaAssociationKey(upload), upload]),
    );
    for (const link of links) {
      const asset = assetsById.get(link.mediaId);
      expect(asset, `media link ${link.mediaId} has no upload`).toBeDefined();
      if (!asset) continue;
      const association = {
        ...asset,
        traceId: link.traceId,
        observationId: link.observationId,
        field: link.field,
        origin: link.origin,
      };
      associations.set(mediaAssociationKey(association), association);
    }
    return sortedMediaAssociations([...associations.values()]);
  };
}

function expectLegacyReplayParity(comparison: OtelRawReplayComparison) {
  for (const table of [
    "traces",
    "observations",
    "observations_batch_staging",
  ] as const) {
    expect(
      comparableOtelReplayRows(comparison.earlyTs.legacyRows?.[table]),
      `early-ts ${table}`,
    ).toEqual(
      comparableOtelReplayRows(comparison.originalTs.legacyRows?.[table]),
    );
  }
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

type RawOtelAttribute = {
  key: string;
  value: Record<string, unknown>;
};

function buildFocusedResourceSpans(params: {
  attributes?: RawOtelAttribute[];
  scopeName?: string;
  spanName?: string;
}): ResourceSpan[] {
  return [
    {
      resource: { attributes: [] },
      scopeSpans: [
        {
          scope: { name: params.scopeName ?? "otel-replay" },
          spans: [
            {
              traceId: createBufferId(TRACE_ID),
              spanId: createBufferId(FIRST_SPAN_ID),
              name: params.spanName ?? "focused-replay",
              kind: 1,
              startTimeUnixNano: "1714488530686000000",
              endTimeUnixNano: "1714488530687000000",
              attributes: params.attributes ?? [],
              status: { code: 0 },
            },
          ],
        },
      ],
    },
  ];
}

function focusedReplayBytes(params: {
  attributes?: RawOtelAttribute[];
  scopeName?: string;
  spanName?: string;
}): Buffer {
  return Buffer.from(JSON.stringify(buildFocusedResourceSpans(params)));
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
      const comparison = await runOtelReplayComparison({
        bytes: Buffer.from(JSON.stringify(buildResourceSpans())),
        projectId: PROJECT_ID,
        fileKey: FILE_KEY,
        mediaUploadEnabled: true,
        overflowEnabled: true,
        overflowSizeLimitBytes: 256,
      });

      expectRawOtelReplayParity(comparison);
      expect(otelReplayMocks.scheduleObservationEvals).toHaveBeenCalledTimes(4);

      for (const result of [comparison.originalTs, comparison.earlyTs]) {
        expect(result.storedRows, result.mode).toHaveLength(2);
        const rowsBySpanId = new Map(
          result.storedRows.map((row) => [String(row.span_id), row]),
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

        for (const row of result.storedRows) {
          expect(Number(row.event_bytes)).toBeGreaterThan(0);
        }
      }
    });

    it("preserves JavaScript rounding for unsafe OTLP numbers in the raw document", async () => {
      // Keep the number literal in the S3 document. Serializing a JS object
      // first would round it before the production queue reads the bytes.
      const bytes = Buffer.from(
        `[{"resource":{"attributes":[]},"scopeSpans":[{"scope":{"name":"otel-replay"},"spans":[{"traceId":"${TRACE_ID}","spanId":"${FIRST_SPAN_ID}","name":"unsafe-number","startTimeUnixNano":"1714488530686000000","endTimeUnixNano":"1714488530687000000","attributes":[{"key":"gen_ai.request.temperature","value":{"doubleValue":9007199254740993}}],"status":{"code":0}}]}]}]`,
      );
      const comparison = await runOtelReplayComparison({
        bytes,
        projectId: `${PROJECT_ID}-unsafe-number`,
        fileKey: `${FILE_KEY}.unsafe-number`,
        mediaUploadEnabled: true,
      });

      expectRawOtelReplayParity(comparison);
      for (const result of [comparison.originalTs, comparison.earlyTs]) {
        expect(result.storedRows, result.mode).toHaveLength(1);
        const metadataIndex = (
          result.storedRows[0].metadata_names as string[]
        ).indexOf("attributes.gen_ai.request.temperature");
        expect(metadataIndex).toBeGreaterThanOrEqual(0);
        expect(result.storedRows[0].metadata_values?.[metadataIndex]).toBe(
          "9007199254740992",
        );
      }
    });

    it("extracts only media accepted by masking", async () => {
      const originalMedia = Buffer.from("original-media".repeat(512));
      const maskedMedia = Buffer.from("masked-media".repeat(512));
      const rawBytes = focusedReplayBytes({
        attributes: [
          stringAttribute(
            "langfuse.observation.input",
            `data:image/png;base64,${originalMedia.toString("base64")}`,
          ),
        ],
      });
      const maskedBytes = focusedReplayBytes({
        attributes: [
          stringAttribute(
            "langfuse.observation.input",
            `data:image/png;base64,${maskedMedia.toString("base64")}`,
          ),
        ],
      });
      const maskingEnv: SharedEnv = {
        ...sharedEnv,
        LANGFUSE_INGESTION_MASKING_CALLBACK_URL:
          "https://masking.example.com/mask",
        LANGFUSE_INGESTION_MASKING_CALLBACK_TIMEOUT_MS: 1_000,
        LANGFUSE_INGESTION_MASKING_CALLBACK_FAIL_CLOSED: "true",
        LANGFUSE_INGESTION_MASKING_MAX_RETRIES: 0,
        LANGFUSE_INGESTION_MASKING_PROPAGATED_HEADERS: [],
        NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: undefined,
        LANGFUSE_EE_LICENSE_KEY: "langfuse_ee_test-license-key",
      };
      const configuredMasking = vi.mocked(masking.applyIngestionMasking);
      const applyMasking = configuredMasking.getMockImplementation()!;
      const configuredMaskingEnabled = vi.mocked(
        masking.isIngestionMaskingEnabled,
      );
      const isMaskingEnabled =
        configuredMaskingEnabled.getMockImplementation()!;
      configuredMasking.mockImplementation((params, _env, transport) =>
        applyMasking(params, maskingEnv, transport),
      );
      configuredMaskingEnabled.mockImplementation(() =>
        isMaskingEnabled(maskingEnv),
      );

      const maskingRequests: Buffer[] = [];
      const fetch = vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(async (_input, init) => {
          const body = init?.body;
          if (typeof body === "string") {
            maskingRequests.push(Buffer.from(body));
          } else if (body instanceof Uint8Array) {
            maskingRequests.push(Buffer.from(body));
          } else {
            throw new Error("masking callback received an unexpected body");
          }
          return new Response(maskedBytes.toString("utf8"), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        });

      const compactedBatches: {
        json: string;
        media: Array<{ reference: string; bodyBase64: string }>;
      }[] = [];
      const prepareOtelBatch = otelPreparation.prepareOtelBatch;
      const preparation = vi
        .spyOn(otelPreparation, "prepareOtelBatch")
        .mockImplementation(async (params) => {
          const result = await prepareOtelBatch(params);
          if (result?.batch) {
            const media = result.batch.media;
            compactedBatches.push({
              json: result.batch.json(),
              media: await Promise.all(
                media.map(async ({ index, reference }) => ({
                  reference,
                  bodyBase64: (await result.batch!.mediaBody(index)).toString(
                    "base64",
                  ),
                })),
              ),
            });
          }
          return result;
        });

      try {
        const comparison = await runOtelReplayComparison({
          bytes: rawBytes,
          projectId: `${PROJECT_ID}-masking-media`,
          fileKey: `${FILE_KEY}.masking-media`,
          mediaUploadEnabled: true,
          captureSideEffects: createMediaAssociationCapture(),
        });

        expect(fetch).toHaveBeenCalledTimes(2);
        expect(maskingRequests).toHaveLength(2);
        for (const request of maskingRequests) {
          expect(request).toEqual(rawBytes);
          expect(JSON.parse(request.toString("utf8"))).toEqual(
            JSON.parse(rawBytes.toString("utf8")),
          );
        }
        expect(compactedBatches).toHaveLength(1);
        const earlyBatch = compactedBatches[0]!;
        expect(earlyBatch.media).toEqual([
          {
            reference: expect.any(String),
            bodyBase64: maskedMedia.toString("base64"),
          },
        ]);
        expect(earlyBatch.json).toContain(earlyBatch.media[0]!.reference);
        expect(earlyBatch.json).not.toContain(
          `data:image/png;base64,${maskedMedia.toString("base64")}`,
        );
        for (const result of [comparison.originalTs, comparison.earlyTs]) {
          const associations = result.sideEffects as MediaAssociation[];
          expect(associations, result.mode).toHaveLength(1);
          expect(associations[0]?.contentBase64, result.mode).toBe(
            maskedMedia.toString("base64"),
          );
          expect(result.storedRows, result.mode).toHaveLength(1);
          expect(String(result.storedRows[0]?.input), result.mode).toContain(
            "id=image-media-id",
          );
          expect(
            String(result.storedRows[0]?.input),
            result.mode,
          ).not.toContain(originalMedia.toString("base64"));
        }
        expectRawOtelReplayParity(comparison);
      } finally {
        preparation.mockRestore();
        fetch.mockRestore();
        configuredMasking.mockImplementation(applyMasking);
        configuredMaskingEnabled.mockImplementation(isMaskingEnabled);
      }
    });

    it("restores tag media before scalar tag values are split", async () => {
      const dataUri = `data:image/png;base64,${Buffer.from("tag-media").toString("base64")}`;
      const comparison = await runOtelReplayComparison({
        bytes: focusedReplayBytes({
          attributes: [stringAttribute("langfuse.trace.tags", dataUri)],
        }),
        projectId: `${PROJECT_ID}-tag-media`,
        fileKey: `${FILE_KEY}.tag-media`,
        mediaUploadEnabled: true,
      });

      expectRawOtelReplayParity(comparison);
      for (const result of [comparison.originalTs, comparison.earlyTs]) {
        expect(result.storedRows, result.mode).toHaveLength(1);
        expect(result.storedRows[0]?.tags, result.mode).toEqual([
          "data:image/png;base64",
          Buffer.from("tag-media").toString("base64"),
        ]);
      }
    });

    it.each([
      ["scope name", { scopeName: "data:text/plain;base64,aGk=" }],
      [
        "attribute key",
        {
          attributes: [
            stringAttribute("data:text/plain;base64,aGk=", "attribute-value"),
          ],
        },
      ],
    ] as const)(
      "keeps structural media in the %s aligned",
      async (name, options) => {
        const comparison = await runOtelReplayComparison({
          bytes: focusedReplayBytes(options),
          projectId: `${PROJECT_ID}-structural-media-${name}`,
          fileKey: `${FILE_KEY}.structural-media-${name}`,
          mediaUploadEnabled: true,
        });

        expectRawOtelReplayParity(comparison);
        for (const result of [comparison.originalTs, comparison.earlyTs]) {
          expect(result.storedRows, result.mode).toHaveLength(1);
        }
      },
    );

    const deepValue = `${"[".repeat(200)}null${"]".repeat(200)}`;
    const shallowDocument = focusedReplayBytes({
      spanName: "deep-document",
    })
      .toString("utf8")
      .replace("[{", `[{"ignored":${deepValue},`);
    const overflowingNumber = focusedReplayBytes({
      attributes: [
        { key: "gen_ai.request.temperature", value: { doubleValue: 0.25 } },
      ],
    })
      .toString("utf8")
      .replace('"doubleValue":0.25', '"doubleValue":1e309');

    let nestedInput: unknown = "leaf";
    for (let depth = 0; depth < 120; depth++) nestedInput = { x: nestedInput };
    const repeatedNestedInput = focusedReplayBytes({
      attributes: [
        stringAttribute(
          "langfuse.observation.input",
          JSON.stringify({
            marker: "data: ",
            items: Array.from({ length: 32 }, () => nestedInput),
          }),
        ),
      ],
    });

    it.each([
      ["repeated nested objects", repeatedNestedInput],
      ["deep JSON nesting", Buffer.from(shallowDocument)],
      [
        "embedded lone surrogate",
        focusedReplayBytes({
          attributes: [
            stringAttribute(
              "langfuse.observation.input",
              JSON.stringify({ text: "\ud800" }),
            ),
          ],
        }),
      ],
      ["out-of-range number", Buffer.from(overflowingNumber)],
    ] as const)(
      "preserves persisted values for %s input",
      async (name, bytes) => {
        if (name === "repeated nested objects") {
          // Native success is a separate assertion from persistence parity:
          // the original TS path cannot rescue a scanner resource failure.
          const validated = await validateOtelJson(bytes);
          const batch = await validated.extract(true);
          await batch.dispose();
          await validated.dispose();
        }
        const comparison = await runOtelReplayComparison({
          bytes,
          projectId: `${PROJECT_ID}-edge-${name}`,
          fileKey: `${FILE_KEY}.edge-${name}`,
          mediaUploadEnabled: true,
        });

        expectRawOtelReplayParity(comparison);
        expect(comparison.originalTs.storedRows).toHaveLength(1);
        expect(comparison.earlyTs.storedRows).toHaveLength(1);
      },
    );

    it("persists sanitized UTF-8 consistently across both paths", async () => {
      const bytes = focusedReplayBytes({
        attributes: [
          stringAttribute("langfuse.observation.input", "utf8-probe"),
        ],
      });
      bytes[bytes.indexOf("utf8-probe")] = 0xff;

      const comparison = await runOtelReplayComparison({
        bytes,
        projectId: `${PROJECT_ID}-invalid-utf8`,
        fileKey: `${FILE_KEY}.invalid-utf8`,
        mediaUploadEnabled: true,
      });
      expectRawOtelReplayParity(comparison);
      for (const result of [comparison.originalTs, comparison.earlyTs]) {
        expect(result.storedRows).toHaveLength(1);
        expect(result.storedRows[0].input).toContain("�tf8-probe");
      }
    });

    it("persists matching legacy rows, media associations, and events_full rows in dual mode", async () => {
      const { projectId, orgId } = await createOrgProjectAndApiKey();
      const originalBlobStorageFileLogFlag =
        env.LANGFUSE_ENABLE_BLOB_STORAGE_FILE_LOG;
      env.LANGFUSE_ENABLE_BLOB_STORAGE_FILE_LOG = "true";
      try {
        const captureMediaAssociations = createMediaAssociationCapture();
        const comparison = await runOtelReplayComparison({
          bytes: Buffer.from(JSON.stringify(buildResourceSpans())),
          projectId,
          orgId,
          fileKey: `${FILE_KEY}.dual-write`,
          mediaUploadEnabled: true,
          overflowEnabled: true,
          overflowSizeLimitBytes: 256,
          writeMode: "dual",
          captureSideEffects: captureMediaAssociations,
        });

        expect(await getTraceUpsertJobsForProject(projectId)).toHaveLength(0);
        expectRawOtelReplayParity(comparison);
        expect(comparison.originalTs.sideEffects).toEqual(
          comparison.earlyTs.sideEffects,
        );
        const associations = comparison.originalTs
          .sideEffects as MediaAssociation[];
        expect(associations).toHaveLength(3);
        expect(associations).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              mediaId: "image-media-id",
              traceId: TRACE_ID,
              observationId: FIRST_SPAN_ID,
              field: "input",
              contentType: "image/png",
              contentBase64: Buffer.from("small-image").toString("base64"),
              origin: MediaAssociationOrigin.INGESTION_MEDIA_EXTRACTION,
            }),
            expect.objectContaining({
              mediaId: "image-media-id",
              traceId: TRACE_ID,
              observationId: undefined,
              field: "input",
              contentType: "image/png",
              contentBase64: Buffer.from("small-image").toString("base64"),
              origin: MediaAssociationOrigin.INGESTION_MEDIA_EXTRACTION,
            }),
            expect.objectContaining({
              mediaId: "overflow-media-id",
              traceId: TRACE_ID,
              observationId: SECOND_SPAN_ID,
              field: "output",
              contentType: "text/plain",
              contentBase64: Buffer.from("x".repeat(1024)).toString("base64"),
              origin: MediaAssociationOrigin.INGESTION_FIELD_OVERFLOW,
            }),
          ]),
        );

        for (const result of [comparison.originalTs, comparison.earlyTs]) {
          expect(result.storedRows, result.mode).toHaveLength(2);
          expect(result.legacyRows?.traces?.length).toBeGreaterThan(0);
          expect(result.legacyRows?.observations).toHaveLength(2);
          expect(result.legacyRows?.observations_batch_staging).toHaveLength(0);
        }

        expectLegacyReplayParity(comparison);
      } finally {
        const traceJobs = await getTraceUpsertJobsForProject(projectId);
        await Promise.allSettled(traceJobs.map((job) => job.remove()));
        env.LANGFUSE_ENABLE_BLOB_STORAGE_FILE_LOG =
          originalBlobStorageFileLogFlag;
        await prisma.project.delete({ where: { id: projectId } });
        await prisma.organization.delete({ where: { id: orgId } });
      }
    });

    it.each(["succeed", "fail"] as const)(
      "preserves mixed existing and inline media in dual writes when uploads %s",
      async (outcome) => {
        const { projectId, orgId } = await createOrgProjectAndApiKey();
        const existingReference =
          "@@@langfuseMedia:type=image/png|id=preexisting-media-id|source=bytes@@@";
        const content = Buffer.from("dual-inline-media".repeat(256));
        const dataUri = `data:image/png;base64,${content.toString("base64")}`;
        const input = JSON.stringify([existingReference, dataUri]);
        const uploadFails = outcome === "fail";
        if (uploadFails) {
          otelReplayMocks.uploadMediaForTrace.mockRejectedValue(
            new Error("simulated media upload failure"),
          );
        }
        // Final rows can match even if the late detector does all the work. Capture the
        // real compact document and registry before the queue parses and disposes them.
        const compactedBatches: { json: string; references: string[] }[] = [];
        const prepareOtelBatch = otelPreparation.prepareOtelBatch;
        const preparation = vi
          .spyOn(otelPreparation, "prepareOtelBatch")
          .mockImplementation(async (params) => {
            const result = await prepareOtelBatch(params);
            if (result?.batch) {
              compactedBatches.push({
                json: result.batch.json(),
                references: result.batch.media.map((media) => media.reference),
              });
            }
            return result;
          });
        const captureMediaAssociations = createMediaAssociationCapture();
        let uploadCursor = 0;
        try {
          const comparison = await runOtelReplayComparison({
            bytes: focusedReplayBytes({
              attributes: [
                stringAttribute("langfuse.trace.input", input),
                stringAttribute("langfuse.observation.input", input),
              ],
            }),
            projectId,
            orgId,
            fileKey: `${FILE_KEY}.dual-media-${outcome}`,
            mediaUploadEnabled: true,
            writeMode: "dual",
            captureSideEffects: () => {
              const uploads =
                otelReplayMocks.uploadMediaForTrace.mock.calls.slice(
                  uploadCursor,
                );
              uploadCursor =
                otelReplayMocks.uploadMediaForTrace.mock.calls.length;
              // Each mode must attempt the upload, including when it fails and the
              // original inline content is therefore the correct persisted result.
              expect(uploads.length).toBeGreaterThan(0);
              for (const [params] of uploads) {
                expect(params.contentBytes).toEqual(content);
              }
              return uploadFails ? [] : captureMediaAssociations();
            },
          });
          expect(compactedBatches).toHaveLength(1);
          for (const batch of compactedBatches) {
            expect(batch.json).toContain(existingReference);
            expect(batch.json).not.toContain(dataUri);
            expect(batch.references.length).toBeGreaterThan(0);
            for (const reference of batch.references) {
              expect(reference).not.toBe(existingReference);
              expect(batch.json).toContain(reference);
            }
          }
          expectRawOtelReplayParity(comparison);
          expectLegacyReplayParity(comparison);
          const expectedInput = JSON.stringify([
            existingReference,
            uploadFails
              ? dataUri
              : "@@@langfuseMedia:type=image/png|id=image-media-id|source=base64_data_uri@@@",
          ]);
          for (const result of [comparison.originalTs, comparison.earlyTs]) {
            expect(result.storedRows, result.mode).toHaveLength(1);
            expect(result.legacyRows?.traces, result.mode).toHaveLength(1);
            expect(result.legacyRows?.observations, result.mode).toHaveLength(
              1,
            );
            for (const row of [
              result.storedRows[0],
              result.legacyRows?.traces?.[0],
              result.legacyRows?.observations?.[0],
            ]) {
              expect(row?.input, result.mode).toBe(expectedInput);
            }
          }
          if (uploadFails) {
            expect(
              otelReplayMocks.linkMediaToTraceOrObservation,
            ).not.toHaveBeenCalled();
          } else {
            expect(comparison.earlyTs.sideEffects).toEqual(
              comparison.originalTs.sideEffects,
            );
            expect(comparison.originalTs.sideEffects).toHaveLength(2);
            expect(comparison.originalTs.sideEffects).toEqual(
              expect.arrayContaining(
                [undefined, FIRST_SPAN_ID].map((observationId) =>
                  expect.objectContaining({
                    traceId: TRACE_ID,
                    observationId,
                    field: "input",
                    contentBase64: content.toString("base64"),
                    origin: MediaAssociationOrigin.INGESTION_MEDIA_EXTRACTION,
                  }),
                ),
              ),
            );
          }
        } finally {
          preparation.mockRestore();
          await prisma.project.delete({ where: { id: projectId } });
          await prisma.organization.delete({ where: { id: orgId } });
        }
      },
    );

    it.each([
      ["original-ts", false],
      ["original-ts", true],
      ["early-ts", false],
      ["early-ts", true],
    ] as const)(
      "removes replay-owned jobs after failure (%s, separate traces: %s)",
      async (mode, separateTraces) => {
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
            runOneOtelReplay({
              mode,
              bytes: Buffer.from(
                JSON.stringify(buildResourceSpans({ separateTraces })),
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
      },
    );
  },
);
