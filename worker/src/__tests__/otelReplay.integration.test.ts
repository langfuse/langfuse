import "./helpers/otelReplaySetup";

import { createHash, randomInt } from "node:crypto";
import { Decimal } from "decimal.js";
import fc from "fast-check";
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
import { env } from "../env";
import { env as sharedEnv, type SharedEnv } from "@langfuse/shared/src/env";
import { MediaAssociationOrigin } from "@langfuse/shared";
import {
  createOrgProjectAndApiKey,
  TraceUpsertQueue,
  linkMediaToTraceOrObservation,
  type ResourceSpan,
  uploadMediaForTrace,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import * as masking from "@langfuse/shared/src/server/ee/ingestionMasking";
import * as otelPreparation from "../features/otel-ingestion/prepareOtelBatch";
import { initializeEventByteAccounting } from "../services/ClickhouseWriter/eventByteAccounting";
import { ClickhouseWriter } from "../services/ClickhouseWriter";
import {
  comparableOtelReplayRows,
  expectRawNativeParity,
  runOtelReplayComparison,
  runOneOtelReplay,
  type OtelRawReplayComparison,
} from "./helpers/otelReplayHarness";
import {
  configureDefaultOtelReplayMocks,
  otelReplayMocks,
} from "./helpers/otelReplaySetup";

// The shared upload pool reads this setting when the module is first imported.
vi.hoisted(() => vi.stubEnv("LANGFUSE_OTEL_MEDIA_UPLOAD_CONCURRENCY", "5"));
afterAll(() => vi.unstubAllEnvs());

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
const ASTRAL_SKILL_NAME = "😀".repeat(128);
// Shared pricing validation accepts these patterns. Native unit tests cover the
// deliberate fallback for usage keys containing UTF-16 surrogate pairs.
const PRICING_REGEX_CASES = [
  { regex: /^\w+$/, key: "é" },
  { regex: /^\d+$/, key: "١" },
  { regex: /^\s$/, key: "\u0085" },
  { regex: /^\bé\b$/i, key: "é" },
  { regex: /^k$/i, key: "K" },
  { regex: /^s$/i, key: "ſ" },
  { regex: /^[a-z]+$/i, key: "K" },
  { regex: /^(?=preinput$)preinput$/, key: "preinput" },
  { regex: /^(?!output$)preinput$/, key: "preinput" },
  { regex: /^(input)\1$/, key: "inputinput" },
  { regex: new RegExp("^\\cA$"), key: "\u0001" },
  { regex: new RegExp("^\\k$"), key: "k" },
] as const;
const PRICED_USAGE_TYPES = ["input", "output", "cache_read"] as const;
const TINY_PRICES = [
  "0.000000000001",
  "0.000000000003",
  "0.000000001234",
] as const;

beforeAll(async () => {
  await initializeEventByteAccounting();
});

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

type PreparedBatchSnapshot = {
  json: string;
  references: string[];
  media?: Array<{ reference: string; bodyBase64: string }>;
};

function capturePreparedBatches(options: { includeBodies?: boolean } = {}) {
  const compactedBatches: PreparedBatchSnapshot[] = [];
  const prepareOtelBatch = otelPreparation.prepareOtelBatch;
  const preparation = vi
    .spyOn(otelPreparation, "prepareOtelBatch")
    .mockImplementation(async (params) => {
      const result = await prepareOtelBatch(params);
      const batch = result?.batch;
      if (batch) {
        // Snapshot native output before queue parsing and the late TS detector.
        const media = batch.media;
        const snapshot: PreparedBatchSnapshot = {
          json: (await batch.copyJsonBuffer()).toString("utf8"),
          references: media.map(({ reference }) => reference),
        };
        if (options.includeBodies) {
          snapshot.media = await Promise.all(
            media.map(async ({ index, reference }) => ({
              reference,
              bodyBase64: (await batch.mediaBody(index)).toString("base64"),
            })),
          );
        }
        compactedBatches.push(snapshot);
      }
      return result;
    });

  return { compactedBatches, preparation };
}

function expectLegacyReplayParity(comparison: OtelRawReplayComparison) {
  for (const table of [
    "traces",
    "observations",
    "observations_batch_staging",
  ] as const) {
    for (const result of [comparison.earlyTs, comparison.earlyRust]) {
      expect(
        comparableOtelReplayRows(result.legacyRows?.[table]),
        `${result.mode} ${table}`,
      ).toEqual(
        comparableOtelReplayRows(comparison.originalTs.legacyRows?.[table]),
      );
    }
  }
}

function expectNativeEarlyPathParity(
  comparison: OtelRawReplayComparison,
): void {
  expect(comparableOtelReplayRows(comparison.earlyRust.storedRows)).toEqual(
    comparableOtelReplayRows(comparison.earlyTs.storedRows),
  );
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

type FocusedReplayParams = {
  attributes?: RawOtelAttribute[];
  resourceAttributes?: RawOtelAttribute[];
  scopeName?: string;
  scopeVersion?: string;
  spanName?: string;
};

function buildFocusedResourceSpans(
  params: FocusedReplayParams,
): ResourceSpan[] {
  return [
    {
      resource: { attributes: params.resourceAttributes ?? [] },
      scopeSpans: [
        {
          scope: {
            name: params.scopeName ?? "otel-replay",
            ...(params.scopeVersion ? { version: params.scopeVersion } : {}),
          },
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

function focusedReplayBytes(params: FocusedReplayParams): Buffer {
  return Buffer.from(JSON.stringify(buildFocusedResourceSpans(params)));
}

function skillReplayBytes(
  command = 'bash -lc "cat \'/tmp/alpha/SKILL.md\' " && bash -lc "cat /tmp/alpha/guide.md /tmp/alpha/SKILL.md"',
): Buffer {
  const [resourceSpan] = buildFocusedResourceSpans({});
  const [scopeSpan] = resourceSpan.scopeSpans ?? [];
  const [template] = scopeSpan?.spans ?? [];
  if (!scopeSpan || !template) throw new Error("missing replay span template");

  const span = (
    spanId: string,
    name: string,
    attributes: RawOtelAttribute[],
  ) => ({
    ...template,
    spanId: createBufferId(spanId),
    name,
    attributes,
  });

  return Buffer.from(
    JSON.stringify([
      {
        ...resourceSpan,
        scopeSpans: [
          {
            ...scopeSpan,
            spans: [
              span(FIRST_SPAN_ID, "skill-generation", [
                stringAttribute("langfuse.observation.type", "generation"),
                // Keep 1.0 in the source JSON: JavaScript JSON.stringify would
                // normalize it before the native parser sees it.
                stringAttribute(
                  "langfuse.observation.skills_available",
                  `[{"name":"alpha","version":1.0},{"skillName":${JSON.stringify(ASTRAL_SKILL_NAME)},"skillVersion":2}]`,
                ),
              ]),
              span(SECOND_SPAN_ID, "readFile", [
                stringAttribute("langfuse.observation.type", "tool"),
                stringAttribute(
                  "langfuse.observation.skills_available",
                  JSON.stringify([{ name: "alpha", version: 1 }]),
                ),
                stringAttribute(
                  "langfuse.observation.input",
                  JSON.stringify({ path: "/skills/alpha/SKILL.md" }),
                ),
                stringAttribute(
                  "langfuse.observation.output",
                  JSON.stringify({ ok: true }),
                ),
              ]),
              span("5555555555555555", "skill", [
                stringAttribute("langfuse.observation.type", "tool"),
                stringAttribute(
                  "langfuse.observation.skills_available",
                  JSON.stringify([{ name: "alpha", version: 1 }]),
                ),
                stringAttribute(
                  "langfuse.observation.input",
                  JSON.stringify({ name: ASTRAL_SKILL_NAME }),
                ),
                stringAttribute(
                  "langfuse.observation.output",
                  JSON.stringify({ isError: true }),
                ),
              ]),
              span("7777777777777777", "exec_command", [
                stringAttribute("langfuse.observation.type", "tool"),
                stringAttribute(
                  "langfuse.observation.metadata.resourceAttributes.service.name",
                  "codex",
                ),
                stringAttribute(
                  "langfuse.observation.skills_available",
                  '[{"name":"alpha","version":1}]',
                ),
                stringAttribute("langfuse.observation.input", command),
                stringAttribute(
                  "langfuse.observation.metadata",
                  JSON.stringify({ tools: [{ name: "weather" }] }),
                ),
                stringAttribute("langfuse.observation.output", "done"),
              ]),
              span("6666666666666666", "invalid-skill-version", [
                stringAttribute("langfuse.observation.type", "generation"),
                stringAttribute(
                  "langfuse.observation.skills_available",
                  '[{"name":"alpha","version":1},{"name":"beta","version":0}]',
                ),
              ]),
            ],
          },
        ],
      },
    ]),
  );
}

type SkillRuleResource = {
  skillName: string;
  filePath: string;
};

type SkillRuleCase = {
  name: string;
  toolName: string;
  input?: unknown;
  inputEncoding?: "json" | "raw";
  output?: string;
  omitOutput?: boolean;
  observationType?: "tool" | "generation" | "span";
  isError?: boolean;
  metadataBlob?: Record<string, unknown>;
  metadataAttributes?: Record<string, string>;
  expectedResources?: readonly SkillRuleResource[];
};

const SKILL_RULE_CATALOG = JSON.stringify([
  { name: "alpha", version: 1 },
  { name: "beta", version: 2 },
]);

function skillRuleSpanId(index: number): string {
  return (index + 1).toString(16).padStart(16, "0");
}

function buildSkillRuleMatrixBytes(cases: readonly SkillRuleCase[]): Buffer {
  const [resourceSpan] = buildFocusedResourceSpans({});
  const [scopeSpan] = resourceSpan.scopeSpans ?? [];
  const [template] = scopeSpan?.spans ?? [];
  if (!scopeSpan || !template) throw new Error("missing replay span template");

  const spans = cases.map((testCase, index) => {
    const inputAttribute =
      testCase.input === undefined
        ? []
        : [
            stringAttribute(
              "langfuse.observation.input",
              testCase.inputEncoding === "raw"
                ? String(testCase.input)
                : JSON.stringify(testCase.input),
            ),
          ];
    const outputAttribute = testCase.omitOutput
      ? []
      : [
          stringAttribute(
            "langfuse.observation.output",
            testCase.output ?? "ok",
          ),
        ];
    const metadataAttributes = [
      ...(testCase.metadataBlob === undefined
        ? []
        : [
            stringAttribute(
              "langfuse.observation.metadata",
              JSON.stringify(testCase.metadataBlob),
            ),
          ]),
      ...Object.entries(testCase.metadataAttributes ?? {}).map(([key, value]) =>
        stringAttribute(`langfuse.observation.metadata.${key}`, value),
      ),
    ];

    return {
      ...template,
      traceId: createBufferId(TRACE_ID),
      spanId: createBufferId(skillRuleSpanId(index)),
      name: testCase.toolName,
      attributes: [
        stringAttribute(
          "langfuse.observation.type",
          testCase.observationType ?? "tool",
        ),
        stringAttribute(
          "langfuse.observation.skills_available",
          SKILL_RULE_CATALOG,
        ),
        ...inputAttribute,
        ...outputAttribute,
        ...metadataAttributes,
      ],
      status: { code: testCase.isError ? 2 : 0 },
    };
  });

  return Buffer.from(
    JSON.stringify([
      {
        ...resourceSpan,
        scopeSpans: [{ ...scopeSpan, spans }],
      },
    ]),
  );
}

function storedSkillResources(
  resources: readonly SkillRuleResource[],
): Array<Record<string, unknown>> {
  return resources.map((resource) => {
    let reference: {
      langfuseSkillId: string | null;
      skillVersion: number | null;
    };
    if (resource.skillName === "alpha") {
      reference = { langfuseSkillId: "skill-alpha", skillVersion: 1 };
    } else if (resource.skillName === "beta") {
      reference = { langfuseSkillId: "skill-beta", skillVersion: 2 };
    } else {
      reference = { langfuseSkillId: null, skillVersion: null };
    }
    return { ...reference, ...resource };
  });
}

function structuredMetadataReplayBytes(params: {
  scopeVersion: string;
  telemetrySdkLanguage: "python" | "nodejs";
  dataUri: string;
}): {
  bytes: Buffer;
  jsonString: string;
  escapedJsonString: string;
  providerJson: string;
} {
  // A string-valued SDK metadata field can itself contain serialized JSON. The
  // SDK then JSON-encodes that value again for the per-key OTLP attribute.
  const jsonString = JSON.stringify({ image: params.dataUri });
  // Native handles escaped MIME separators that the TS text scan leaves inline.
  // Failed uploads must still restore this exact spelling.
  const escapedJsonString = JSON.stringify({ image: params.dataUri }).replace(
    "data:image/",
    "data:image\\/",
  );
  const providerJson = JSON.stringify({
    type: "file",
    mediaType: "image/png",
    data: params.dataUri.slice(params.dataUri.indexOf(",") + 1),
  });
  const metadata = {
    "": JSON.stringify({ collision: { key: "blob wins" } }),
    ".quoted": JSON.stringify("quoted value"),
    ".asset": JSON.stringify({ attachment: { image: params.dataUri } }),
    ".json_string": JSON.stringify(jsonString),
    ".escaped_json_string": JSON.stringify(escapedJsonString),
    ".quoted_provider": JSON.stringify(providerJson),
    ".truncated": '{"value":"cut',
    ".collision.key": JSON.stringify("dotted loses"),
  };

  return {
    bytes: focusedReplayBytes({
      scopeName: "langfuse-sdk",
      scopeVersion: params.scopeVersion,
      resourceAttributes: [
        stringAttribute("telemetry.sdk.language", params.telemetrySdkLanguage),
      ],
      attributes: Object.entries(metadata).map(([path, value]) =>
        stringAttribute(`langfuse.observation.metadata${path}`, value),
      ),
    }),
    jsonString,
    escapedJsonString,
    providerJson,
  };
}

function eventMetadataByPath(
  row: Record<string, unknown>,
): Map<string, string> {
  const names = row.metadata_names as string[];
  const values = row.metadata_values as string[];
  return new Map(names.map((name, index) => [name, values[index]]));
}

// Compare every persisted column, changing only the explicitly expected media
// values in this SDK metadata fixture. The general replay comparator stays exact.
function expectSdkMetadataExpansion(
  comparison: OtelRawReplayComparison,
  expandedValues: Record<string, string>,
) {
  const expected = structuredClone(comparison.originalTs);
  for (const row of expected.storedRows) {
    const metadata = eventMetadataByPath(row);
    const values = [...metadata].map(
      ([key, value]) => expandedValues[key] ?? value,
    );
    row.event_bytes =
      Number(row.event_bytes) +
      values.reduce((sum, value) => sum + Buffer.byteLength(value), 0) -
      (row.metadata_values as string[]).reduce(
        (sum, value) => sum + Buffer.byteLength(value),
        0,
      );
    row.metadata_values = values;
  }
  for (const row of Object.values(expected.legacyRows ?? {}).flat()) {
    row.metadata = { ...(row.metadata as object), ...expandedValues };
  }
  expectRawNativeParity({
    ...comparison,
    originalTs: expected,
  });
  expectLegacyReplayParity({
    ...comparison,
    originalTs: expected,
  });
}

// Vitest retries can overlap unfinished ClickHouse I/O and shared replay mocks.
describe(
  "OTEL replay persists enriched observations after media and overflow handling",
  { retry: 0, timeout: 120_000 },
  () => {
    beforeEach(() => {
      configureDefaultOtelReplayMocks();

      const model = {
        id: "otel-replay-model",
        modelName: "gpt-4o-mini",
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
      otelReplayMocks.fetchEvalRules.mockResolvedValue({
        observationRules: [{}],
        traceTranscriptRules: [],
      });
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
      // The test owns this mutable mock setup; restore its deterministic
      // defaults so another worker suite in the same process is unaffected.
      configureDefaultOtelReplayMocks();
    });

    it("matches pricing boundaries, tier ordering and supplied-cost precedence", async () => {
      const seed = randomInt(2 ** 31);
      process.stderr.write(`OTEL pricing replay seed=${seed}\n`);
      const pricingCase = fc.record({
        threshold: fc.integer({ min: 1, max: 100 }),
        delta: fc.constantFrom(-1, 0, 1),
        operator: fc.constantFrom("lt", "lte", "eq", "neq", "gte", "gt"),
        source: fc.constantFrom("metadata", "model_parameters"),
        region: fc.constantFrom("eu", "us"),
        provider: fc.option(
          fc.constantFrom("openai", "googleVertex", "vertex", "google"),
          { nil: undefined },
        ),
        responseTier: fc.constantFrom("flex", "ON_DEMAND_FLEX", "priority"),
        explicitTier: fc.option(fc.constantFrom("flex", "priority"), {
          nil: undefined,
        }),
        explicitParameterShape: fc.oneof(
          { weight: 3, arbitrary: fc.constant("object") },
          {
            weight: 1,
            arbitrary: fc.constantFrom(
              "null",
              "false",
              "zero",
              "emptyString",
              "string",
              "array",
              "encodedObject",
              "doubleEncodedObject",
            ),
          },
        ),
        googleTierField: fc.constantFrom("serviceTier", "trafficType"),
        regexCase: fc.constantFrom(...PRICING_REGEX_CASES),
        usageShape: fc.constantFrom("raw", "completion", "response"),
        usageOrder: fc.shuffledSubarray([0, 1, 2, 3], {
          minLength: 4,
          maxLength: 4,
        }),
        priceOrder: fc.shuffledSubarray([...PRICED_USAGE_TYPES], {
          minLength: 3,
          maxLength: 3,
        }),
        tinyPrices: fc.shuffledSubarray([...TINY_PRICES], {
          minLength: 3,
          maxLength: 3,
        }),
        output: fc.integer({ min: 0, max: 10 }),
        cacheRead: fc.integer({ min: 0, max: 10 }),
        order: fc.shuffledSubarray([0, 1, 2], {
          minLength: 3,
          maxLength: 3,
        }),
        costs: fc.option(
          fc.record({
            input: fc.integer({ min: 0, max: 10 }),
            output: fc.integer({ min: 0, max: 10 }),
          }),
          { nil: undefined },
        ),
      });
      const example = fc.sample(pricingCase, { seed: 1, numRuns: 1 })[0]!;
      await fc.assert(
        fc.asyncProperty(
          pricingCase,
          async ({
            threshold,
            delta,
            operator,
            source,
            region,
            provider,
            responseTier,
            explicitTier,
            explicitParameterShape,
            googleTierField,
            regexCase,
            usageShape,
            usageOrder,
            priceOrder,
            tinyPrices,
            output,
            cacheRead,
            order,
            costs,
          }) => {
            const input = threshold + delta;
            const usageKeys = ["input", "output", "cache_read", regexCase.key];
            const usageValues = [input, output, cacheRead, 1];
            const usageDetails = Object.fromEntries(
              usageOrder.map((index) => [usageKeys[index], usageValues[index]]),
            );
            const totalUsage = Object.values(usageDetails).reduce(
              (sum, value) => sum + value,
              0,
            );
            const normalizedUsage = { ...usageDetails, total: totalUsage };
            const submittedUsage =
              usageShape === "raw"
                ? usageDetails
                : {
                    ...usageDetails,
                    [usageShape === "completion"
                      ? "prompt_tokens"
                      : "input_tokens"]: input,
                    [usageShape === "completion"
                      ? "completion_tokens"
                      : "output_tokens"]: output,
                    total_tokens: totalUsage,
                  };
            const parameterObject = {
              region: region === "eu" ? "us" : "eu",
              service_tier: provider ? explicitTier : undefined,
            };
            const modelParameters = JSON.stringify(
              {
                object: parameterObject,
                null: null,
                false: false,
                zero: 0,
                emptyString: "",
                string: "model-parameters",
                array: [1, 2],
                encodedObject: JSON.stringify(parameterObject),
                doubleEncodedObject: JSON.stringify(
                  JSON.stringify(parameterObject),
                ),
              }[explicitParameterShape],
            );
            const { regex } = regexCase;
            const regexTotal = Object.entries(normalizedUsage)
              .filter(([key]) => regex.test(key))
              .reduce((sum, [, value]) => sum + value, 0);
            const usageCondition = {
              usageDetailPattern: "^input$",
              operator,
              value: threshold,
            };
            const regexCondition = {
              usageDetailPattern: regex.source,
              operator: "eq" as const,
              value: regexTotal,
              caseSensitive: !regex.ignoreCase,
            };
            const tiers = [
              {
                id: "conditional",
                priority: 1,
                conditions: [
                  usageCondition,
                  regexCondition,
                  provider
                    ? {
                        source: "model_parameters",
                        key: "service_tier",
                        values: ["flex", "ON_DEMAND_FLEX"],
                      }
                    : { source, key: "region", values: ["eu"] },
                ],
                isDefault: false,
              },
              {
                id: "usage",
                priority: 2,
                conditions: [usageCondition],
                isDefault: false,
              },
              { id: "default", priority: 0, conditions: [], isDefault: true },
            ].map((tier, index) => ({
              ...tier,
              name: tier.id,
              prices: priceOrder.map((usageType, priceIndex) => ({
                usageType,
                price: new Decimal(tinyPrices[priceIndex]).mul(index + 1),
              })),
            }));
            otelReplayMocks.findModel.mockResolvedValue({
              model: { id: "priced-model" },
              pricingTiers: order.map((index) => tiers[index]),
            });
            const comparison = await runOtelReplayComparison({
              bytes: focusedReplayBytes({
                scopeName: provider ? "ai" : undefined,
                attributes: [
                  stringAttribute("langfuse.observation.type", "generation"),
                  stringAttribute(
                    "langfuse.observation.model.name",
                    "priced-model",
                  ),
                  stringAttribute(
                    "langfuse.observation.usage_details",
                    JSON.stringify(submittedUsage),
                  ),
                  stringAttribute(
                    "langfuse.observation.metadata",
                    JSON.stringify({ region }),
                  ),
                  stringAttribute(
                    "langfuse.observation.model.parameters",
                    modelParameters,
                  ),
                  ...(provider
                    ? [
                        stringAttribute(
                          "gen_ai.request.service_tier",
                          "standard",
                        ),
                        stringAttribute(
                          "ai.response.providerMetadata",
                          JSON.stringify({
                            [provider]:
                              provider === "openai" ||
                              googleTierField === "serviceTier"
                                ? { serviceTier: responseTier }
                                : {
                                    usageMetadata: {
                                      trafficType: responseTier,
                                    },
                                  },
                          }),
                        ),
                      ]
                    : []),
                  ...(costs === undefined
                    ? []
                    : [
                        stringAttribute(
                          "langfuse.observation.cost_details",
                          JSON.stringify(costs),
                        ),
                      ]),
                ],
              }),
              projectId: PROJECT_ID,
              fileKey: FILE_KEY,
              mediaUploadEnabled: true,
            });
            expectRawNativeParity(comparison);
            expect(comparison.earlyRust.storedRows).toHaveLength(1);
            const matchesUsage = {
              lt: [-1],
              lte: [-1, 0],
              eq: [0],
              neq: [-1, 1],
              gte: [0, 1],
              gt: [1],
            }[operator].includes(delta);
            const hasExplicitObjectParameters =
              explicitParameterShape === "object" ||
              (!provider &&
                ["encodedObject", "doubleEncodedObject"].includes(
                  explicitParameterShape,
                ));
            let matchesAttribute =
              hasExplicitObjectParameters && region !== "eu";
            if (provider) {
              matchesAttribute = ["flex", "ON_DEMAND_FLEX"].includes(
                (hasExplicitObjectParameters ? explicitTier : undefined) ??
                  responseTier,
              );
            } else if (source === "metadata") {
              matchesAttribute = region === "eu";
            }
            let tierIndex = 2;
            if (matchesUsage) tierIndex = matchesAttribute ? 0 : 1;
            if (provider) {
              expect(
                JSON.parse(
                  String(comparison.earlyRust.storedRows[0].model_parameters),
                ),
              ).toMatchObject({
                service_tier:
                  (hasExplicitObjectParameters ? explicitTier : undefined) ??
                  responseTier,
              });
            }
            const selectedPrices = new Map<string, Decimal>(
              tiers[tierIndex].prices.map((price) => [
                price.usageType,
                price.price,
              ]),
            );
            const calculatedCosts = Object.fromEntries(
              Object.entries(usageDetails)
                .filter(([key]) => selectedPrices.has(key))
                .map(([key, value]) => [
                  key,
                  new Decimal(value).mul(selectedPrices.get(key)!).toNumber(),
                ]),
            );
            const calculatedCost = Object.values(calculatedCosts).reduce(
              (sum, value) => sum + value,
              0,
            );
            expect(comparison.earlyRust.storedRows[0]).toMatchObject({
              model_id: "priced-model",
              usage_details: { ...usageDetails, total: totalUsage },
              usage_pricing_tier_id: tiers[tierIndex].id,
              cost_details:
                costs === undefined
                  ? Object.fromEntries(
                      Object.entries({
                        ...calculatedCosts,
                        total: calculatedCost,
                      }).map(([key, value]) => [
                        key,
                        new Decimal(value)
                          .toDecimalPlaces(12, Decimal.ROUND_DOWN)
                          .toNumber(),
                      ]),
                    )
                  : { ...costs, total: costs.input + costs.output },
            });
          },
        ),
        {
          seed,
          numRuns: 64,
          examples: [
            "null",
            "false",
            "zero",
            "emptyString",
            "string",
            "array",
            "encodedObject",
            "doubleEncodedObject",
          ].flatMap((explicitParameterShape) =>
            [undefined, "google"].map((provider) => [
              {
                ...example,
                provider,
                explicitParameterShape,
                source: "model_parameters",
                region: "us",
                operator: "gte",
                delta: 1,
                costs: undefined,
              },
            ]),
          ),
        },
      );
    });

    it("keeps partial provider usage aligned with TypeScript", async () => {
      const seed = randomInt(2 ** 31);
      process.stderr.write(`OTEL usage parity replay seed=${seed}\n`);
      const count = fc.oneof(
        fc.constant(undefined),
        fc.constant(0),
        fc.integer({ min: -100, max: 100 }),
      );
      const usageCase = fc.record({
        kind: fc.constantFrom("genkit" as const, "ai"),
        input: count,
        output: count,
        total: count,
        thoughts: count,
        provider: fc.constantFrom("none" as const, "anthropic", "mixed"),
        breakdown: fc.boolean(),
        aggregate: count,
        fiveMinute: count,
        oneHour: count,
        bedrock: count,
      });
      const example = {
        input: undefined,
        output: undefined,
        total: 7,
        thoughts: undefined,
        provider: "none" as const,
        breakdown: true,
        aggregate: undefined,
        fiveMinute: undefined,
        oneHour: undefined,
        bedrock: undefined,
      };
      await fc.assert(
        fc.asyncProperty(usageCase, async (fixture) => {
          const attributes = [
            stringAttribute("langfuse.observation.type", "generation"),
          ];
          if (fixture.kind === "genkit") {
            attributes.push(
              stringAttribute(
                "genkit:output",
                JSON.stringify({
                  usage: {
                    inputTokens: fixture.input,
                    outputTokens: fixture.output,
                    totalTokens: fixture.total,
                    thoughtsTokens: fixture.thoughts,
                  },
                }),
              ),
            );
          } else {
            for (const [key, value] of [
              ["gen_ai.usage.input_tokens", fixture.input],
              ["gen_ai.usage.output_tokens", fixture.output],
              ["ai.usage.tokens", fixture.total],
            ] as const) {
              if (value !== undefined)
                attributes.push(stringAttribute(key, String(value)));
            }
            if (fixture.provider !== "none") {
              attributes.push(
                stringAttribute(
                  "ai.response.providerMetadata",
                  JSON.stringify({
                    anthropic: {
                      usage: {
                        cache_creation: fixture.breakdown
                          ? {
                              ephemeral_5m_input_tokens: fixture.fiveMinute,
                              ephemeral_1h_input_tokens: fixture.oneHour,
                            }
                          : undefined,
                        cache_creation_input_tokens: fixture.aggregate,
                      },
                    },
                    ...(fixture.provider === "mixed"
                      ? {
                          bedrock: {
                            usage: {
                              cacheCreationInputTokens: fixture.bedrock,
                            },
                          },
                        }
                      : {}),
                  }),
                ),
              );
            }
          }
          const comparison = await runOtelReplayComparison({
            bytes: focusedReplayBytes({
              scopeName: fixture.kind === "genkit" ? "genkit-tracer" : "ai",
              attributes,
            }),
            projectId: `${PROJECT_ID}-usage-parity`,
            fileKey: `${FILE_KEY}.usage-parity`,
          });
          expectRawNativeParity(comparison);
        }),
        {
          seed,
          numRuns: 64,
          examples: [
            [
              {
                ...example,
                kind: "ai",
                input: 100,
                output: 50,
                total: 150,
                provider: "mixed",
                fiveMinute: 20,
                oneHour: 5,
                bedrock: 99,
              },
            ],
            [{ ...example, kind: "genkit", output: 0, thoughts: 7 }],
            ...[undefined, 0].map((thoughts) => [
              { ...example, kind: "genkit", output: -1, thoughts },
            ]),
            [{ ...example, kind: "ai" }],
          ],
        },
      );
    });

    it("dispatches batch evaluations together and writes each settled observation", async () => {
      const evaluations = [
        Promise.withResolvers<void>(),
        Promise.withResolvers<void>(),
      ];
      otelReplayMocks.findModel.mockResolvedValue({
        model: null,
        pricingTiers: [],
      });
      otelReplayMocks.scheduleObservationEvals.mockImplementation(
        ({ observation }) =>
          evaluations[observation.span_id === FIRST_SPAN_ID ? 0 : 1]!.promise,
      );
      const writes = vi.spyOn(ClickhouseWriter.prototype, "addToQueue");
      const replay = runOneOtelReplay({
        mode: "early-rust",
        bytes: Buffer.from(JSON.stringify(buildResourceSpans())),
        projectId: PROJECT_ID,
        fileKey: FILE_KEY,
      });

      try {
        await vi.waitFor(
          () =>
            expect(
              otelReplayMocks.scheduleObservationEvals,
            ).toHaveBeenCalledTimes(2),
          { timeout: 5_000 },
        );
        evaluations[0]!.reject(
          new Error("simulated evaluation scheduling failure"),
        );
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(writes).toHaveBeenCalledTimes(1);
        expect(writes.mock.calls[0]?.[1]).toMatchObject({
          ids: { id: FIRST_SPAN_ID },
        });
        evaluations[1]!.resolve();
        const result = await replay;
        expect(result.storedRows.map((row) => row.span_id).sort()).toEqual(
          [FIRST_SPAN_ID, SECOND_SPAN_ID].sort(),
        );
      } finally {
        for (const evaluation of evaluations) evaluation.resolve();
        await replay.finally(() => writes.mockRestore());
      }
    });

    it.each([
      "langfuse.trace.name",
      "langfuse.version",
      "langfuse.release",
      "langfuse.observation.status_message",
    ])(
      "matches evaluation eligibility before %s is stringified",
      async (key) => {
        const resource = buildFocusedResourceSpans({})[0]!;
        const scope = resource.scopeSpans![0]!;
        const template = scope.spans![0]!;
        const values = [
          { boolValue: false },
          { intValue: "0" },
          { arrayValue: { values: [{ stringValue: "text" }] } },
          { stringValue: "false" },
          { stringValue: "0" },
          { stringValue: '["text"]' },
          { stringValue: "" },
          {},
        ];
        const ids = values.map((_, index) =>
          (index + 1).toString(16).padStart(16, "0"),
        );
        scope.spans = values.map((value, index) => ({
          ...template,
          spanId: createBufferId(ids[index]!),
          attributes: [{ key, value }],
        }));
        const comparison = await runOtelReplayComparison({
          bytes: Buffer.from(JSON.stringify([resource])),
          projectId: PROJECT_ID,
        });
        expect(comparison.originalTs.storedRows).toHaveLength(values.length);
        expect(
          comparison.originalTs.evaluatedSpans.map(([, id]) => id),
        ).toEqual(ids.slice(3));
        expectRawNativeParity(comparison);
      },
    );

    it.each([false, true])(
      "matches prompt lookup truthiness and alias precedence when lookups fail=%s",
      async (failLookup) => {
        const names = [false, 0, "", "false", "0", "named"];
        const sources = [
          "langfuse.observation.prompt.name",
          "langfuse.prompt.name",
          "ai.telemetry.metadata.langfusePrompt",
        ];
        const promptAttribute = (
          key: string,
          name: string | number | boolean,
        ): RawOtelAttribute => {
          if (typeof name === "boolean")
            return { key, value: { boolValue: name } };
          if (typeof name === "number") return intAttribute(key, name);
          return stringAttribute(key, name);
        };
        const resource = buildFocusedResourceSpans({})[0]!;
        const scope = resource.scopeSpans![0]!;
        const template = scope.spans![0]!;
        scope.spans = sources.flatMap((source, sourceIndex) =>
          names.map((name, nameIndex) => ({
            ...template,
            spanId: createBufferId(
              (sourceIndex * names.length + nameIndex + 1)
                .toString(16)
                .padStart(16, "0"),
            ),
            attributes: [
              stringAttribute("langfuse.observation.type", "generation"),
              intAttribute("langfuse.observation.prompt.version", 4),
              ...(sourceIndex < 2 ? [promptAttribute(source, name)] : []),
              ...(sourceIndex === 0
                ? [stringAttribute("langfuse.prompt.name", "alias-fallback")]
                : []),
              stringAttribute(
                "ai.telemetry.metadata.langfusePrompt",
                JSON.stringify({
                  name: sourceIndex === 2 ? name : "sdk-fallback",
                  version: 4,
                }),
              ),
            ],
          })),
        );
        otelReplayMocks.getPrompt.mockImplementation(async () => {
          if (failLookup) throw new Error("simulated prompt lookup failure");
          return { id: "replay-prompt-id" };
        });
        let promptCursor = 0;
        const comparison = await runOtelReplayComparison({
          bytes: Buffer.from(JSON.stringify([resource])),
          projectId: PROJECT_ID,
          captureSideEffects: () => {
            const prompts =
              otelReplayMocks.getPrompt.mock.calls.slice(promptCursor);
            promptCursor = otelReplayMocks.getPrompt.mock.calls.length;
            return prompts.map(([request]) => request.promptName).sort();
          },
        });
        const expectedLookups = sources
          .flatMap(() => ["false", "0", "named"])
          .sort();
        expect(comparison.earlyRust.storedRows).toHaveLength(
          failLookup ? 9 : 18,
        );
        expect(comparison.originalTs.sideEffects).toEqual(expectedLookups);
        expect(comparison.originalTs.evaluatedSpans).toHaveLength(
          failLookup ? 3 : 12,
        );
        expect(comparison.earlyTs.sideEffects).toEqual(
          comparison.originalTs.sideEffects,
        );
        // The Rust path resolves each distinct lookup once and shares the result.
        expect(comparison.earlyRust.sideEffects).toEqual([
          ...new Set(expectedLookups),
        ]);
        expect(comparison.originalTs.storedRows).toHaveLength(
          failLookup ? 9 : 18,
        );
        expectRawNativeParity(comparison);
      },
    );

    it("writes both enriched observations and preserves accounting through readback", async () => {
      // Load each snapshot the way the scheduler does: while it is scheduling.
      const snapshots: { span_id: string; output?: unknown }[] = [];
      otelReplayMocks.scheduleObservationEvals.mockImplementation(
        async ({ loadSnapshot }) => {
          snapshots.push(loadSnapshot());
        },
      );
      const comparison = await runOtelReplayComparison({
        bytes: Buffer.from(JSON.stringify(buildResourceSpans())),
        projectId: PROJECT_ID,
        fileKey: FILE_KEY,
        mediaUploadEnabled: true,
        overflowEnabled: true,
        overflowSizeLimitBytes: 256,
      });

      expectRawNativeParity(comparison);
      expect(otelReplayMocks.scheduleObservationEvals).toHaveBeenCalledTimes(6);
      expect(
        snapshots
          .filter((observation) => observation.span_id === SECOND_SPAN_ID)
          .map((observation) => observation.output),
      ).toEqual(Array(3).fill("x".repeat(1024)));

      const result = comparison.originalTs;
      expect(result.storedRows).toHaveLength(2);
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
        usage_pricing_tier_id: null,
        usage_pricing_tier_name: null,
        usage_details: {},
        cost_details: {},
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
    });

    // JavaScript's fallback parser treats offsetless tab/newline forms as local time.
    const localCompletionDate = new Date(2025, 9, 1, 8, 45, 26)
      .toISOString()
      .replace("T", " ")
      .replace("Z", "000");
    it.each([
      [
        "2025-10-01",
        "2025-10-01 00:00:00.000000",
        "2025-10-01 00:00:00.000000",
      ],
      [
        "2025-10-01 08:45:26",
        "2025-10-01 08:45:26.000000",
        "2025-10-01 08:45:26.000000",
      ],
      [
        "2025-10-01 08:45:26Z",
        "2025-10-01 08:45:26.000000",
        "2025-10-01 08:45:26.000000",
      ],
      [
        "2025-10-01 08:45:26+02:00",
        "2025-10-01 06:45:26.000000",
        "2025-10-01 06:45:26.000000",
      ],
      ["2025-10-01\t08:45:26", localCompletionDate, null],
      ["2025-10-01\n08:45:26", localCompletionDate, null],
      ["2025-10-0108:45:26", null, null],
    ] as const)(
      "persists completion date %s without losing sibling spans",
      async (value, expectedTs, expectedRust) => {
        const resourceSpans = buildFocusedResourceSpans({
          attributes: [
            stringAttribute(
              "langfuse.observation.completion_start_time",
              value,
            ),
          ],
        });
        const spans = resourceSpans[0].scopeSpans![0].spans!;
        spans.push({
          ...spans[0],
          spanId: createBufferId(SECOND_SPAN_ID),
          attributes: [],
        });
        const comparison = await runOtelReplayComparison({
          bytes: Buffer.from(JSON.stringify(resourceSpans)),
          projectId: `${PROJECT_ID}-completion-date`,
          fileKey: `${FILE_KEY}.completion-date`,
        });
        for (const result of Object.values(comparison)) {
          expect(result.storedRows).toHaveLength(2);
          const rows = new Map(
            result.storedRows.map((row) => [row.span_id, row]),
          );
          expect(rows.get(FIRST_SPAN_ID)?.completion_start_time).toBe(
            result === comparison.earlyRust ? expectedRust : expectedTs,
          );
          expect(rows.get(SECOND_SPAN_ID)?.completion_start_time).toBeNull();
        }
        // Unsupported native timestamp formats are checked above; all remaining row fields
        // must still match the TypeScript paths.
        const withoutCompletionTime = (
          result: OtelRawReplayComparison["originalTs"],
        ) => ({
          ...result,
          storedRows: result.storedRows.map((row) => ({
            ...row,
            completion_start_time: null,
          })),
        });
        expectRawNativeParity({
          originalTs: withoutCompletionTime(comparison.originalTs),
          earlyTs: withoutCompletionTime(comparison.earlyTs),
          earlyRust: withoutCompletionTime(comparison.earlyRust),
        });
      },
    );

    it("persists empty string span IDs with TypeScript parity", async () => {
      const resource = buildFocusedResourceSpans({})[0];
      const scope = resource.scopeSpans![0];
      const span = scope.spans![0];
      const bytes = Buffer.from(
        JSON.stringify([
          {
            ...resource,
            scopeSpans: [
              {
                ...scope,
                spans: [
                  { ...span, spanId: "" },
                  { ...span, spanId: createBufferId(SECOND_SPAN_ID) },
                ],
              },
            ],
          },
        ]),
      );
      const comparison = await runOtelReplayComparison({
        bytes,
        projectId: `${PROJECT_ID}-empty-span-id`,
        fileKey: `${FILE_KEY}.empty-span-id`,
      });
      expectRawNativeParity(comparison);
      for (const result of Object.values(comparison)) {
        expect(result.storedRows.map((row) => row.span_id).sort()).toEqual([
          "",
          SECOND_SPAN_ID,
        ]);
      }
    });

    it("drops a span whose time ClickHouse cannot store and keeps its sibling", async () => {
      const resource = buildFocusedResourceSpans({})[0];
      const scope = resource.scopeSpans![0];
      const span = scope.spans![0];
      const bytes = Buffer.from(
        JSON.stringify([
          {
            ...resource,
            scopeSpans: [
              {
                ...scope,
                spans: [
                  // Microseconds sent as milliseconds: year 57425.
                  { ...span, startTimeUnixNano: "1750000000123000000000" },
                  { ...span, spanId: createBufferId(SECOND_SPAN_ID) },
                ],
              },
            ],
          },
        ]),
      );
      const comparison = await runOtelReplayComparison({
        bytes,
        projectId: `${PROJECT_ID}-unstorable-time`,
        fileKey: `${FILE_KEY}.unstorable-time`,
      });
      expectRawNativeParity(comparison);
      for (const result of Object.values(comparison)) {
        expect(result.storedRows.map((row) => row.span_id)).toEqual([
          SECOND_SPAN_ID,
        ]);
      }
    });

    it("stores a span without an optional time ClickHouse cannot store", async () => {
      const resource = buildFocusedResourceSpans({})[0];
      const scope = resource.scopeSpans![0];
      const span = scope.spans![0];
      const withAttribute = (
        spanId: string,
        key: string,
        value: Record<string, unknown>,
      ) => ({
        ...span,
        spanId: createBufferId(spanId),
        attributes: [...(span.attributes ?? []), { key, value }],
      });
      const bytes = Buffer.from(
        JSON.stringify([
          {
            ...resource,
            scopeSpans: [
              {
                ...scope,
                spans: [
                  // Puts the completion start time in year 33713.
                  withAttribute(FIRST_SPAN_ID, "ai.response.msToFirstChunk", {
                    doubleValue: 1e15,
                  }),
                  // Year 10000 in UTC.
                  withAttribute(
                    SECOND_SPAN_ID,
                    "langfuse.observation.completion_start_time",
                    { stringValue: "9999-12-31T23:30:00-05:00" },
                  ),
                ],
              },
            ],
          },
        ]),
      );
      const comparison = await runOtelReplayComparison({
        bytes,
        projectId: `${PROJECT_ID}-unstorable-optional-time`,
        fileKey: `${FILE_KEY}.unstorable-optional-time`,
      });
      expectRawNativeParity(comparison);
      for (const result of Object.values(comparison)) {
        expect(
          result.storedRows
            .map((row) => [row.span_id, row.completion_start_time])
            .sort(),
        ).toEqual([
          [FIRST_SPAN_ID, null],
          [SECOND_SPAN_ID, null],
        ]);
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

      expectRawNativeParity(comparison);
      const result = comparison.originalTs;
      expect(result.storedRows).toHaveLength(1);
      const metadataIndex = (
        result.storedRows[0].metadata_names as string[]
      ).indexOf("attributes.gen_ai.request.temperature");
      expect(metadataIndex).toBeGreaterThanOrEqual(0);
      expect(result.storedRows[0].metadata_values?.[metadataIndex]).toBe(
        "9007199254740992",
      );
    });

    it("persists skill catalogs and tool resources with project references", async () => {
      const skillFindMany = vi
        .spyOn(prisma.skill, "findMany")
        .mockResolvedValue([
          { id: "skill-alpha", name: "alpha", version: 1 },
          { id: "skill-astral", name: ASTRAL_SKILL_NAME, version: 2 },
        ] as never);

      try {
        const comparison = await runOtelReplayComparison({
          bytes: skillReplayBytes(),
          projectId: `${PROJECT_ID}-skills`,
          fileKey: `${FILE_KEY}.skills`,
        });

        expectRawNativeParity(comparison);
        for (const result of [
          comparison.originalTs,
          comparison.earlyTs,
          comparison.earlyRust,
        ]) {
          const rows = new Map(
            result.storedRows.map((row) => [String(row.span_id), row]),
          );
          expect(rows.get(FIRST_SPAN_ID)?.skills_available).toEqual([
            {
              langfuseSkillId: "skill-alpha",
              skillVersion: 1,
              skillName: "alpha",
            },
            {
              langfuseSkillId: "skill-astral",
              skillVersion: 2,
              skillName: ASTRAL_SKILL_NAME,
            },
          ]);
          expect(rows.get(SECOND_SPAN_ID)?.skills_resource_loaded).toEqual([
            {
              langfuseSkillId: "skill-alpha",
              skillVersion: 1,
              skillName: "alpha",
              filePath: "SKILL.md",
            },
          ]);
          expect(rows.get("5555555555555555")?.skills_resource_loaded).toEqual([
            {
              langfuseSkillId: null,
              skillVersion: null,
              skillName: ASTRAL_SKILL_NAME,
              filePath: "SKILL.md",
            },
          ]);
          expect(rows.get("7777777777777777")?.skills_resource_loaded).toEqual(
            ["SKILL.md", "guide.md"].map((filePath) => ({
              langfuseSkillId: "skill-alpha",
              skillVersion: 1,
              skillName: "alpha",
              filePath,
            })),
          );
          expect(rows.get("6666666666666666")?.skills_available).toEqual([]);
        }
      } finally {
        skillFindMany.mockRestore();
      }
    });

    it("keeps tool-rule parity with the production TypeScript extractor", async () => {
      const skillFindMany = vi
        .spyOn(prisma.skill, "findMany")
        .mockResolvedValue([
          { id: "skill-alpha", name: "alpha", version: 1 },
          { id: "skill-beta", name: "beta", version: 2 },
        ] as never);
      const codexCommand = "cat /skills/alpha/guide.md";
      const successfulToolCases: SkillRuleCase[] = [
        {
          name: "skill canonicalizes /skills/name",
          toolName: "skill",
          input: { name: "/skills/alpha" },
          expectedResources: [{ skillName: "alpha", filePath: "SKILL.md" }],
        },
        {
          name: "Skill reads name",
          toolName: "Skill",
          input: { name: "alpha" },
          expectedResources: [{ skillName: "alpha", filePath: "SKILL.md" }],
        },
        {
          name: "Skill preserves a noncanonical name",
          toolName: "Skill",
          input: { name: "/skills/alpha" },
          expectedResources: [
            { skillName: "/skills/alpha", filePath: "SKILL.md" },
          ],
        },
        {
          name: "loadSkill reads skill",
          toolName: "loadSkill",
          input: { skill: "alpha" },
          expectedResources: [{ skillName: "alpha", filePath: "SKILL.md" }],
        },
        {
          name: "unknown named skill is retained for resolution",
          toolName: "loadSkill",
          input: { name: "unlisted" },
          expectedResources: [{ skillName: "unlisted", filePath: "SKILL.md" }],
        },
        {
          name: "langfuse_loadSkill uses skill after null name",
          toolName: "langfuse_loadSkill",
          input: { name: null, skill: "beta" },
          expectedResources: [{ skillName: "beta", filePath: "SKILL.md" }],
        },
        {
          name: "name wins over skill",
          toolName: "skill",
          input: { name: "alpha", skill: "beta" },
          expectedResources: [{ skillName: "alpha", filePath: "SKILL.md" }],
        },
        {
          name: "wrong-type name blocks skill fallback",
          toolName: "skill",
          input: { name: 7, skill: "alpha" },
          expectedResources: [],
        },
        {
          name: "skill_read canonicalizes /skills/name/SKILL.md",
          toolName: "skill_read",
          input: {
            skillName: "/skills/alpha/SKILL.md",
            path: "docs/guide.md",
          },
          expectedResources: [
            { skillName: "alpha", filePath: "docs/guide.md" },
          ],
        },
        {
          name: "skill_read canonicalizes /skills/name",
          toolName: "skill_read",
          input: { skillName: "/skills/alpha", path: "guide.md" },
          expectedResources: [{ skillName: "alpha", filePath: "guide.md" }],
        },
        {
          name: "loadSkillResource uses skill after null name",
          toolName: "loadSkillResource",
          input: { name: null, skill: "beta", path: "docs/guide.md" },
          expectedResources: [{ skillName: "beta", filePath: "docs/guide.md" }],
        },
        {
          name: "loadSkillResource gives name precedence",
          toolName: "loadSkillResource",
          input: { name: "alpha", skill: "beta", path: "guide.md" },
          expectedResources: [{ skillName: "alpha", filePath: "guide.md" }],
        },
        {
          name: "wrong-type name blocks loadSkillResource fallback",
          toolName: "loadSkillResource",
          input: { name: 7, skill: "alpha", path: "guide.md" },
          expectedResources: [],
        },
        {
          name: "langfuse_loadSkillResource reads skill and path",
          toolName: "langfuse_loadSkillResource",
          input: { skill: "alpha", path: "notes.md" },
          expectedResources: [{ skillName: "alpha", filePath: "notes.md" }],
        },
        {
          name: "readFile uses file_path after null path",
          toolName: "readFile",
          input: { path: null, file_path: "/skills/alpha/guide.md" },
          expectedResources: [{ skillName: "alpha", filePath: "guide.md" }],
        },
        {
          name: "Read reads file_path",
          toolName: "Read",
          input: { file_path: "/skills/beta/guide.md" },
          expectedResources: [{ skillName: "beta", filePath: "guide.md" }],
        },
        {
          name: "readFile gives path precedence",
          toolName: "readFile",
          input: {
            path: "/skills/alpha/guide.md",
            file_path: "/skills/beta/guide.md",
          },
          expectedResources: [{ skillName: "alpha", filePath: "guide.md" }],
        },
        {
          name: "wrong-type path blocks readFile fallback",
          toolName: "Read",
          input: { path: 7, file_path: "/skills/alpha/guide.md" },
          expectedResources: [],
        },
        {
          name: "Codex skill uses command when unnamed",
          toolName: "skill",
          input: codexCommand,
          inputEncoding: "raw",
          metadataAttributes: { "resourceAttributes.service.name": "codex" },
          expectedResources: [{ skillName: "alpha", filePath: "guide.md" }],
        },
        {
          name: "Codex skill variant uses nested metadata",
          toolName: "skill:load",
          input: codexCommand,
          inputEncoding: "raw",
          metadataBlob: { resourceAttributes: { "service.name": "codex" } },
          expectedResources: [{ skillName: "alpha", filePath: "guide.md" }],
        },
        {
          name: "Codex exec uses flat metadata",
          toolName: "exec",
          input: codexCommand,
          inputEncoding: "raw",
          metadataAttributes: { "resourceAttributes.service.name": "codex" },
          expectedResources: [{ skillName: "alpha", filePath: "guide.md" }],
        },
        {
          name: "Codex exec_command uses nested metadata",
          toolName: "exec_command",
          input: codexCommand,
          inputEncoding: "raw",
          metadataBlob: { resourceAttributes: { "service.name": "codex" } },
          expectedResources: [{ skillName: "alpha", filePath: "guide.md" }],
        },
        {
          name: "exec without Codex metadata is ineligible",
          toolName: "exec",
          input: codexCommand,
          inputEncoding: "raw",
          expectedResources: [],
        },
        {
          name: "Codex named arguments take precedence over command",
          toolName: "skill",
          input: { name: "beta", cmd: codexCommand },
          metadataAttributes: { "resourceAttributes.service.name": "codex" },
          expectedResources: [{ skillName: "beta", filePath: "SKILL.md" }],
        },
        {
          name: "wrong-type named argument blocks Codex command",
          toolName: "exec",
          input: { name: 7, cmd: codexCommand },
          metadataAttributes: { "resourceAttributes.service.name": "codex" },
          expectedResources: [],
        },
        {
          name: "flat metadata wins over nested Codex metadata",
          toolName: "exec",
          input: codexCommand,
          inputEncoding: "raw",
          metadataBlob: { resourceAttributes: { "service.name": "codex" } },
          metadataAttributes: { "resourceAttributes.service.name": "node" },
          expectedResources: [],
        },
      ];

      const eligibilityCases: SkillRuleCase[] = [
        {
          name: "generation still records its catalog",
          toolName: "generation-catalog",
          observationType: "generation",
          omitOutput: true,
          expectedResources: [],
        },
        {
          name: "tool without output is ineligible",
          toolName: "readFile",
          input: { path: "/skills/alpha/guide.md" },
          omitOutput: true,
          expectedResources: [],
        },
        {
          name: "tool with an error is ineligible",
          toolName: "readFile",
          input: { path: "/skills/alpha/guide.md" },
          isError: true,
          expectedResources: [],
        },
        {
          name: "non-tool observation is ineligible",
          toolName: "readFile",
          input: { path: "/skills/alpha/guide.md" },
          observationType: "span",
          expectedResources: [],
        },
      ];
      const toolNames = [
        "skill",
        "Skill",
        "loadSkill",
        "langfuse_loadSkill",
        "skill_read",
        "loadSkillResource",
        "langfuse_loadSkillResource",
        "readFile",
        "Read",
      ];
      const argumentValues = [undefined, null, false, 0, [], {}, ""];
      const argumentCases: SkillRuleCase[] = toolNames.flatMap((toolName) => {
        const args = {
          name: "alpha",
          skill: "beta",
          skillName: "alpha",
          path: ["readFile", "Read"].includes(toolName)
            ? "/skills/alpha/guide.md"
            : "guide.md",
          file_path: "/skills/beta/other.md",
        };
        return [
          ...argumentValues.flatMap((value, index) => [
            { name: `name ${index}`, input: { ...args, name: value } },
            {
              name: `skill ${index}`,
              input: { ...args, name: undefined, skill: value },
            },
            {
              name: `skillName ${index}`,
              input: { ...args, skillName: value },
            },
            { name: `path ${index}`, input: { ...args, path: value } },
            {
              name: `file_path ${index}`,
              input: { ...args, path: undefined, file_path: value },
            },
          ]),
          ...["/skills/alpha", "/skills/alpha/SKILL.md"].map((name) => ({
            name: `canonicalization ${name}`,
            input: { ...args, name, skillName: name },
          })),
          { name: "JSON text arguments", input: JSON.stringify(args) },
        ].map((testCase) => ({
          ...testCase,
          toolName,
          name: `${toolName}: ${testCase.name}`,
        }));
      });
      const codexCases: SkillRuleCase[] = [
        "skill",
        "skill:load",
        "exec",
        "exec_command",
      ].flatMap((toolName) => [
        ...["name", "skill"].flatMap((key) =>
          [...argumentValues, "beta"].map((value, index) => ({
            name: `${toolName}: Codex ${key} ${index}`,
            toolName,
            input: { cmd: codexCommand, [key]: value },
            metadataBlob: { "resourceAttributes.service.name": "codex" },
          })),
        ),
        ...[undefined, null, false, 0, "node"].map((serviceName, index) => ({
          name: `${toolName}: flat metadata fallback ${index}`,
          toolName,
          input: { cmd: codexCommand },
          metadataBlob: {
            "resourceAttributes.service.name": serviceName,
            resourceAttributes: { "service.name": "codex" },
          },
        })),
      ]);
      const matrixCases = [
        ...successfulToolCases,
        ...eligibilityCases,
        ...argumentCases,
        ...codexCases,
        ...successfulToolCases
          .filter((testCase) => (testCase.expectedResources?.length ?? 0) > 0)
          .flatMap((testCase) => [
            {
              ...testCase,
              name: `${testCase.name} without output`,
              omitOutput: true,
              expectedResources: [],
            },
            {
              ...testCase,
              name: `${testCase.name} with error`,
              isError: true,
              expectedResources: [],
            },
            {
              ...testCase,
              name: `${testCase.name} on a span`,
              observationType: "span" as const,
              expectedResources: [],
            },
            {
              ...testCase,
              name: `${testCase.name} with empty output`,
              output: "",
              expectedResources: testCase.expectedResources,
            },
          ]),
      ];

      try {
        const comparison = await runOtelReplayComparison({
          bytes: buildSkillRuleMatrixBytes(matrixCases),
          projectId: `${PROJECT_ID}-tool-rules`,
          fileKey: `${FILE_KEY}.tool-rules`,
        });

        expect(comparison.originalTs.storedRows).toHaveLength(
          matrixCases.length,
        );

        const rowsBySpan = (result: OtelRawReplayComparison["originalTs"]) =>
          new Map(result.storedRows.map((row) => [String(row.span_id), row]));
        const originalRows = rowsBySpan(comparison.originalTs);
        const earlyTsRows = rowsBySpan(comparison.earlyTs);
        const earlyRustRows = rowsBySpan(comparison.earlyRust);

        for (const [index, testCase] of matrixCases.entries()) {
          const spanId = skillRuleSpanId(index);
          const originalRow = originalRows.get(spanId);
          expect(originalRow, `${testCase.name} TS row`).toBeDefined();
          if (testCase.expectedResources !== undefined) {
            expect(originalRow?.skills_resource_loaded, testCase.name).toEqual(
              storedSkillResources(testCase.expectedResources),
            );
          }

          for (const [label, rows] of [
            ["early TS", earlyTsRows],
            ["early Rust", earlyRustRows],
          ] as const) {
            const row = rows.get(spanId);
            expect(row, `${testCase.name} ${label} row`).toBeDefined();
            expect(
              row?.skills_resource_loaded,
              `${testCase.name} ${label}`,
            ).toEqual(originalRow?.skills_resource_loaded);
          }
        }

        const rowFor = (name: string) => {
          const index = matrixCases.findIndex(
            (testCase) => testCase.name === name,
          );
          expect(index, `${name} case index`).toBeGreaterThanOrEqual(0);
          return originalRows.get(skillRuleSpanId(index));
        };

        expect(
          rowFor("generation still records its catalog")?.skills_available,
        ).toEqual([
          {
            langfuseSkillId: "skill-alpha",
            skillVersion: 1,
            skillName: "alpha",
          },
          {
            langfuseSkillId: "skill-beta",
            skillVersion: 2,
            skillName: "beta",
          },
        ]);
        expectRawNativeParity(comparison);
      } finally {
        skillFindMany.mockRestore();
      }
    });

    it.each([
      {
        name: "escaped quotes in a wrapper",
        command: String.raw`bash -lc "echo \"Don't\"; cat 'skills/alpha/SKILL.md'; echo \"won't\""`,
      },
      ...[
        {
          name: "dash comments around quoted statements",
          before: "-- Let's read it\n",
          after: "\n-- It's done",
        },
        {
          name: "prose around quoted statements",
          before: "Let's read it.\n",
          after: "\nIt's done.",
        },
        {
          name: "line comments around quoted statements",
          before: "// Let's read it\n",
          after: "\n// It's done",
        },
        {
          name: "inline block comments around quoted statements",
          before: "/* Let's read it */",
          after: "/* It's done */",
        },
        {
          name: "multiline block comments around quoted statements",
          before: "/* Let's\nread it */\n",
          after: "\n/* It's\ndone */",
        },
      ].map(({ name, before, after }) => ({
        name,
        command: `${before}runner(${JSON.stringify(
          "echo 'start'; cd /tmp; cat 'skills/alpha/SKILL.md'; echo 'done'",
        )});${after}`,
      })),
    ])("preserves skill read parity with $name", async ({ command }) => {
      const skillFindMany = vi
        .spyOn(prisma.skill, "findMany")
        .mockResolvedValue([
          { id: "skill-alpha", name: "alpha", version: 1 },
        ] as never);
      try {
        const comparison = await runOtelReplayComparison({
          bytes: skillReplayBytes(command),
          projectId: `${PROJECT_ID}-quoted-command-parity`,
          fileKey: `${FILE_KEY}.quoted-command-parity`,
        });
        const resources = (result: OtelRawReplayComparison["originalTs"]) =>
          result.storedRows.find(
            (row) => String(row.span_id) === "7777777777777777",
          )?.skills_resource_loaded;
        expect(resources(comparison.originalTs)).toEqual([
          {
            langfuseSkillId: "skill-alpha",
            skillVersion: 1,
            skillName: "alpha",
            filePath: "SKILL.md",
          },
        ]);
        expect(resources(comparison.earlyRust)).toEqual(
          resources(comparison.originalTs),
        );
        expectRawNativeParity(comparison);
      } finally {
        skillFindMany.mockRestore();
      }
    });

    it("persists native quote-aware cat extractor results", async () => {
      const skillFindMany = vi
        .spyOn(prisma.skill, "findMany")
        .mockResolvedValue([
          { id: "skill-alpha", name: "alpha", version: 1 },
        ] as never);
      const cases = [
        {
          name: "keeps the outer read separate from a quoted wrapper",
          command:
            'bash -lc "cat skills/alpha/SKILL.md " && cat skills/alpha/guide.md && echo "done"',
          filePaths: ["SKILL.md", "guide.md"],
        },
        {
          name: "keeps both wrapper reads when the outer command redirects output",
          command:
            'bash -lc "cat skills/alpha/SKILL.md " && cat skills/alpha/guide.md > /tmp/guide.txt && echo "done"',
          filePaths: ["SKILL.md", "guide.md"],
        },
        {
          name: "preserves operators inside a quoted filename",
          command: 'cat "skills/alpha/guide.md && echo "',
          filePaths: ["guide.md && echo "],
        },
        {
          name: "keeps lexical matches inside function syntax",
          command:
            "cat /skills/alpha/before.md; fn() { cat /skills/alpha/fake.md; }; cat /skills/alpha/after.md",
          filePaths: ["before.md", "fake.md", "after.md"],
        },
        {
          name: "keeps lexical matches in quoted strings, functions, and comments",
          command:
            "echo 'cat /skills/alpha/echo.md'; bash -lc 'cat /skills/alpha/before.md; fn() { cat /skills/alpha/nested.md; }'; cat /skills/alpha/after.md # cat /skills/alpha/comment.md",
          filePaths: [
            "echo.md",
            "before.md",
            "nested.md",
            "after.md",
            "comment.md",
          ],
        },
        {
          name: "finds later reads around redirects and expansions",
          command:
            'cat /skills/alpha/before.md 2>/dev/null; echo "$HOME"; cat /skills/alpha/after.md',
          filePaths: ["before.md", "after.md"],
        },
      ] as const;

      try {
        for (const [index, testCase] of cases.entries()) {
          const result = await runOneOtelReplay({
            bytes: skillReplayBytes(testCase.command),
            projectId: `${PROJECT_ID}-shell-scanner-${index}`,
            fileKey: `${FILE_KEY}.shell-scanner-${index}`,
            mode: "early-rust",
          });
          const row = result.storedRows.find(
            (candidate) => String(candidate.span_id) === "7777777777777777",
          );

          expect(row?.skills_resource_loaded, testCase.name).toEqual(
            testCase.filePaths.map((filePath) => ({
              langfuseSkillId: "skill-alpha",
              skillVersion: 1,
              skillName: "alpha",
              filePath,
            })),
          );
        }
      } finally {
        skillFindMany.mockRestore();
      }
    });

    it.each([
      ...[
        {
          sdkLabel: "Python 5.0",
          sdkName: "python",
          sdkVersion: "5.0.0",
          telemetrySdkLanguage: "python",
          scopeVersion: "5.0.0",
        },
        {
          sdkLabel: "JavaScript 6.0 fallback",
          sdkName: "unknown",
          sdkVersion: "unknown",
          telemetrySdkLanguage: "nodejs",
          scopeVersion: "6.0.0",
        },
      ].flatMap((sdk) =>
        (["events_only", "dual"] as const).map((writeMode) => ({
          ...sdk,
          writeMode,
          uploadOutcome: "success" as const,
        })),
      ),
      {
        sdkLabel: "Python 5.0 failure",
        sdkName: "python",
        sdkVersion: "5.0.0",
        telemetrySdkLanguage: "python",
        scopeVersion: "5.0.0",
        writeMode: "events_only",
        uploadOutcome: "failure",
      },
      {
        sdkLabel: "JavaScript 6.0 fallback failure",
        sdkName: "unknown",
        sdkVersion: "unknown",
        telemetrySdkLanguage: "nodejs",
        scopeVersion: "6.0.0",
        writeMode: "dual",
        uploadOutcome: "failure",
      },
    ] as const)(
      "processes structured metadata for $sdkLabel",
      async ({
        sdkName,
        sdkVersion,
        telemetrySdkLanguage,
        scopeVersion,
        writeMode,
        uploadOutcome,
      }) => {
        const imageBytes = Buffer.alloc(1024, 42);
        const dataUri = `data:image/png;base64,${imageBytes.toString("base64")}`;
        const structuredMetadata = structuredMetadataReplayBytes({
          scopeVersion,
          telemetrySdkLanguage,
          dataUri,
        });
        const createdProject =
          writeMode === "dual" ? await createOrgProjectAndApiKey() : undefined;
        const projectId =
          createdProject?.projectId ??
          `${PROJECT_ID}-${sdkName}-${uploadOutcome}`;
        const fileKey = `${FILE_KEY}.structured-${sdkName}-${writeMode}-${uploadOutcome}`;
        const { compactedBatches, preparation } = capturePreparedBatches();
        if (uploadOutcome === "failure") {
          otelReplayMocks.uploadMediaForTrace.mockRejectedValue(
            new Error("simulated structured media upload failure"),
          );
        }

        try {
          const replayParams = {
            bytes: structuredMetadata.bytes,
            projectId,
            orgId: createdProject?.orgId,
            fileKey,
            mediaUploadEnabled: true,
            writeMode,
            sdkName,
            sdkVersion,
            captureSideEffects: createMediaAssociationCapture(),
          } as const;
          const comparison = await runOtelReplayComparison(replayParams);
          const expandedImage =
            "@@@langfuseMedia:type=image/png|id=overflow-media-id|source=base64_data_uri@@@";
          const expandedProvider = structuredMetadata.providerJson.replace(
            imageBytes.toString("base64"),
            "@@@langfuseMedia:type=image/png|id=overflow-media-id|source=bytes@@@",
          );
          // The TS text scan misses escaped MIME separators and bare base64
          // provider data; only native extraction handles them.
          const expandedJsonString = JSON.stringify({ image: expandedImage });
          const earlyExpandedValues = {
            json_string: expandedJsonString,
            escaped_json_string: expandedJsonString,
            quoted_provider: expandedProvider,
          };
          expectSdkMetadataExpansion(
            comparison,
            uploadOutcome === "success" ? earlyExpandedValues : {},
          );
          expect(comparison.earlyTs.sideEffects).toEqual(
            comparison.originalTs.sideEffects,
          );
          expect(comparison.earlyRust.sideEffects).toEqual(
            comparison.originalTs.sideEffects,
          );

          expect(compactedBatches).toHaveLength(2);
          for (const compactedBatch of compactedBatches) {
            expect(compactedBatch.references).toHaveLength(4);
            for (const reference of compactedBatch.references) {
              expect(compactedBatch.json).toContain(reference);
            }
            expect(compactedBatch.json).not.toContain("data:image");
          }
          const uploadedBodies =
            otelReplayMocks.uploadMediaForTrace.mock.calls.map(([params]) =>
              Buffer.from(params.contentBytes),
            );
          expect(uploadedBodies.length).toBeGreaterThan(0);
          expect(uploadedBodies.every((body) => body.equals(imageBytes))).toBe(
            true,
          );

          const expectedImage =
            uploadOutcome === "success"
              ? "@@@langfuseMedia:type=image/png|id=overflow-media-id|source=base64_data_uri@@@"
              : dataUri;
          const inlineJsonLookingValues = {
            json_string: JSON.stringify({ image: expectedImage }),
            escaped_json_string: structuredMetadata.escapedJsonString,
            quoted_provider: structuredMetadata.providerJson,
          };
          expect(comparison.originalTs.storedRows).toHaveLength(1);
          const originalMetadata = Object.fromEntries(
            eventMetadataByPath(comparison.originalTs.storedRows[0]),
          );
          expect(originalMetadata).toMatchObject({
            quoted: "quoted value",
            "asset.attachment.image": expectedImage,
            ...inlineJsonLookingValues,
            truncated: '{"value":"cut',
            "collision.key": "blob wins",
          });
          if (writeMode === "dual") {
            expect(comparison.originalTs.legacyRows?.observations).toHaveLength(
              1,
            );
            expect(
              comparison.originalTs.legacyRows!.observations![0].metadata,
            ).toMatchObject({
              quoted: "quoted value",
              asset: JSON.stringify({
                attachment: { image: expectedImage },
              }),
              ...inlineJsonLookingValues,
              truncated: '{"value":"cut',
              collision: JSON.stringify({ key: "blob wins" }),
              "collision.key": "dotted loses",
            });
          }
          if (uploadOutcome === "success") {
            const earlyMetadata = Object.fromEntries(
              eventMetadataByPath(comparison.earlyTs.storedRows[0]),
            );
            expect(earlyMetadata).toMatchObject(earlyExpandedValues);
          }
        } finally {
          preparation.mockRestore();
          if (createdProject) {
            await prisma.project.delete({
              where: { id: createdProject.projectId },
            });
            await prisma.organization.delete({
              where: { id: createdProject.orgId },
            });
          }
        }
      },
    );

    it.each([
      {
        sdkLabel: "Python 4.15",
        sdkName: "python",
        sdkVersion: "4.15.6",
        telemetrySdkLanguage: "python",
        scopeVersion: "4.15.6",
      },
      {
        sdkLabel: "JavaScript 5.11",
        sdkName: "javascript",
        sdkVersion: "5.11.1",
        telemetrySdkLanguage: "nodejs",
        scopeVersion: "5.11.1",
      },
    ] as const)(
      "keeps per-key values encoded for older $sdkLabel scope versions",
      async ({ sdkName, sdkVersion, telemetrySdkLanguage, scopeVersion }) => {
        const dataUri = `data:image/png;base64,${Buffer.alloc(1024, 42).toString("base64")}`;
        const structuredMetadata = structuredMetadataReplayBytes({
          scopeVersion,
          telemetrySdkLanguage,
          dataUri,
        });
        const comparison = await runOtelReplayComparison({
          bytes: structuredMetadata.bytes,
          projectId: `${PROJECT_ID}-old-${sdkName}`,
          fileKey: `${FILE_KEY}.old-${sdkName}`,
          mediaUploadEnabled: true,
          sdkName,
          sdkVersion,
        });

        const expandedImage =
          "@@@langfuseMedia:type=image/png|id=overflow-media-id|source=base64_data_uri@@@";
        const expandedJson = JSON.stringify({ image: expandedImage });
        const expandedProvider = structuredMetadata.providerJson.replace(
          dataUri.slice(dataUri.indexOf(",") + 1),
          "@@@langfuseMedia:type=image/png|id=overflow-media-id|source=bytes@@@",
        );
        expectSdkMetadataExpansion(comparison, {
          json_string: JSON.stringify(expandedJson),
          escaped_json_string: JSON.stringify(expandedJson),
          quoted_provider: JSON.stringify(expandedProvider),
        });
        expect(comparison.originalTs.storedRows).toHaveLength(1);
        const originalMetadata = Object.fromEntries(
          eventMetadataByPath(comparison.originalTs.storedRows[0]),
        );
        expect(originalMetadata).toMatchObject({
          quoted: JSON.stringify("quoted value"),
          asset: JSON.stringify({
            attachment: {
              image:
                "@@@langfuseMedia:type=image/png|id=overflow-media-id|source=base64_data_uri@@@",
            },
          }),
          json_string: JSON.stringify(structuredMetadata.jsonString),
          escaped_json_string: JSON.stringify(
            structuredMetadata.escapedJsonString,
          ),
          quoted_provider: JSON.stringify(structuredMetadata.providerJson),
          truncated: '{"value":"cut',
          "collision.key": "blob wins",
        });
        const earlyMetadata = Object.fromEntries(
          eventMetadataByPath(comparison.earlyTs.storedRows[0]),
        );
        expect(earlyMetadata).toMatchObject({
          json_string: JSON.stringify(expandedJson),
          escaped_json_string: JSON.stringify(expandedJson),
          quoted_provider: JSON.stringify(expandedProvider),
        });
      },
    );

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

      const { compactedBatches, preparation } = capturePreparedBatches({
        includeBodies: true,
      });

      try {
        const comparison = await runOtelReplayComparison({
          bytes: rawBytes,
          projectId: `${PROJECT_ID}-masking-media`,
          fileKey: `${FILE_KEY}.masking-media`,
          mediaUploadEnabled: true,
          captureSideEffects: createMediaAssociationCapture(),
        });

        expect(fetch).toHaveBeenCalledTimes(3);
        expect(maskingRequests).toHaveLength(3);
        for (const request of maskingRequests) {
          expect(request).toEqual(rawBytes);
        }
        expect(compactedBatches).toHaveLength(2);
        for (const earlyBatch of compactedBatches) {
          const earlyMedia = earlyBatch.media!;
          expect(earlyMedia).toEqual([
            {
              reference: expect.any(String),
              bodyBase64: maskedMedia.toString("base64"),
            },
          ]);
          expect(earlyBatch.json).toContain(earlyMedia[0]!.reference);
          expect(earlyBatch.json).not.toContain(
            `data:image/png;base64,${maskedMedia.toString("base64")}`,
          );
        }
        const associations = comparison.originalTs
          .sideEffects as MediaAssociation[];
        expect(associations).toHaveLength(1);
        expect(associations[0]?.contentBase64).toBe(
          maskedMedia.toString("base64"),
        );
        expect(comparison.earlyTs.sideEffects).toEqual(associations);
        expect(comparison.earlyRust.sideEffects).toEqual(associations);
        expect(comparison.originalTs.storedRows).toHaveLength(1);
        expect(String(comparison.originalTs.storedRows[0]?.input)).toContain(
          "id=image-media-id",
        );
        expect(
          String(comparison.originalTs.storedRows[0]?.input),
        ).not.toContain(originalMedia.toString("base64"));
        expectRawNativeParity(comparison);
      } finally {
        preparation.mockRestore();
        fetch.mockRestore();
        configuredMasking.mockImplementation(applyMasking);
        configuredMaskingEnabled.mockImplementation(isMaskingEnabled);
      }
    });

    it("keeps tag media inline before scalar tag values are split", async () => {
      const body = Buffer.alloc(1_024, "tag-media").toString("base64");
      const dataUri = `data:image/png;base64,${body}`;
      const comparison = await runOtelReplayComparison({
        bytes: focusedReplayBytes({
          attributes: [stringAttribute("langfuse.trace.tags", dataUri)],
        }),
        projectId: `${PROJECT_ID}-tag-media`,
        fileKey: `${FILE_KEY}.tag-media`,
        mediaUploadEnabled: true,
      });

      expectRawNativeParity(comparison);
      expect(comparison.originalTs.storedRows).toHaveLength(1);
      expect(comparison.originalTs.storedRows[0]?.tags).toEqual([
        "data:image/png;base64",
        body,
      ]);
    });

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

    it.each([
      ["deep JSON nesting", Buffer.from(shallowDocument)],
      ["out-of-range number", Buffer.from(overflowingNumber)],
    ] as const)(
      "preserves persisted values for %s input",
      async (name, bytes) => {
        const comparison = await runOtelReplayComparison({
          bytes,
          projectId: `${PROJECT_ID}-edge-${name}`,
          fileKey: `${FILE_KEY}.edge-${name}`,
          mediaUploadEnabled: true,
        });

        expectRawNativeParity(comparison);
        expect(comparison.originalTs.storedRows).toHaveLength(1);
      },
    );

    it("persists native surrogate strings through UTF-8 storage boundaries", async () => {
      // The native writer replaces lone surrogate code units in strings with U+FFFD.
      const result = await runOneOtelReplay({
        mode: "early-rust",
        bytes: focusedReplayBytes({
          spanName: "surrogate-\ud800",
          scopeName: "langfuse-sdk",
          scopeVersion: "5.0.0",
          resourceAttributes: [
            stringAttribute("telemetry.sdk.language", "python"),
          ],
          attributes: [
            stringAttribute("langfuse.observation.input", '{"text":"\ud800"}'),
            stringAttribute("langfuse.observation.output", "plain-\udfff"),
            stringAttribute(
              "langfuse.observation.metadata.detail",
              JSON.stringify({ "\ud800": "\ud801", text: "\udfff" }),
            ),
          ],
        }),
        projectId: `${PROJECT_ID}-native-surrogates`,
        fileKey: `${FILE_KEY}.native-surrogates`,
      });
      expect(result.storedRows).toHaveLength(1);
      expect(result.storedRows[0]).toMatchObject({
        name: "surrogate-�",
        input: '{"text":"�"}',
        output: "plain-�",
      });
      expect(result.storedRows[0].metadata_names).toContain("detail.�");
    });

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
      expectRawNativeParity(comparison);
      expect(comparison.originalTs.storedRows).toHaveLength(1);
      expect(comparison.originalTs.storedRows[0].input).toContain("�tf8-probe");
    });

    it("uploads a native provider candidate beyond the TS discovery limits", async () => {
      const contentBytes = Buffer.from("replay-deep-media".repeat(512));
      const encoded = contentBytes.toString("base64");
      // TS stops provider discovery after ten object levels. Keep the unsafe
      // integer as source text to also catch parse-and-reserialize corruption.
      const provider = `{"type":"file","mediaType":"image/png","data":"${encoded}","large":9007199254740993}`;
      const input = `${'{"nested":'.repeat(12)}${provider}${"}".repeat(12)}`;
      const { compactedBatches, preparation } = capturePreparedBatches({
        includeBodies: true,
      });

      try {
        const comparison = await runOtelReplayComparison({
          bytes: focusedReplayBytes({
            attributes: [stringAttribute("langfuse.observation.input", input)],
          }),
          projectId: `${PROJECT_ID}-deep-expansion`,
          fileKey: `${FILE_KEY}.deep-expansion`,
          mediaUploadEnabled: true,
          captureSideEffects: createMediaAssociationCapture(),
        });
        // Assert extraction before normalization or the late TS detector runs.
        expect(compactedBatches).toHaveLength(2);
        for (const compacted of compactedBatches) {
          const compactedMedia = compacted.media!;
          expect(compactedMedia).toHaveLength(1);
          expect(compactedMedia[0]?.bodyBase64).toBe(encoded);
          expect(compacted.json).not.toContain(encoded);
          expect(compacted.json).toContain(compactedMedia[0]!.reference);
        }
        const pendingReference = compactedBatches[0]!.media![0]!.reference;
        const publicReference = pendingReference.replace(
          /\|id=[^|@]+/,
          "|id=image-media-id",
        );
        expect(comparison.originalTs.storedRows).toHaveLength(1);
        expect(comparison.originalTs.storedRows[0]?.input).toBe(input);
        expect(comparison.originalTs.sideEffects).toEqual([]);
        expect(comparison.earlyTs.storedRows).toHaveLength(1);
        expect(comparison.earlyTs.storedRows[0]?.input).toBe(
          input.replace(encoded, publicReference),
        );
        expect(comparison.earlyTs.sideEffects).toEqual([
          expect.objectContaining({
            mediaId: "image-media-id",
            traceId: TRACE_ID,
            observationId: FIRST_SPAN_ID,
            field: "input",
            contentType: "image/png",
            contentLength: contentBytes.length,
            contentBase64: encoded,
            origin: MediaAssociationOrigin.INGESTION_MEDIA_EXTRACTION,
          }),
        ]);
        expectNativeEarlyPathParity(comparison);
        expect(comparison.earlyRust.storedRows[0]?.input).toBe(
          input.replace(encoded, publicReference),
        );
        expect(comparison.earlyRust.sideEffects).toEqual(
          comparison.earlyTs.sideEffects,
        );
      } finally {
        preparation.mockRestore();
      }
    });

    it.each(
      [16, 4096].flatMap((bytes) =>
        [1, 2].flatMap((extraAts) =>
          [false, true].map((uploadFails) => ({
            bytes,
            extraAts,
            uploadFails,
          })),
        ),
      ),
    )(
      "preserves overlapping media markers for $bytes bytes, $extraAts adjacent @ characters, upload failure=$uploadFails",
      async ({ bytes, extraAts, uploadFails }) => {
        const uri = `data:image/png;base64,${Buffer.alloc(bytes, 120).toString("base64")}`;
        const source = `quoted @@@langfuseMedia:unfinished ${"@".repeat(extraAts)}${uri} tail`;
        const reference =
          "@@@langfuseMedia:type=image/png|id=image-media-id|source=base64_data_uri@@@";
        const expectedInput = uploadFails
          ? source
          : source.replace(uri, reference);
        let uploadCursor = 0;
        if (uploadFails) {
          otelReplayMocks.uploadMediaForTrace.mockRejectedValue(
            new Error("simulated overlap media upload failure"),
          );
        }

        const comparison = await runOtelReplayComparison({
          bytes: focusedReplayBytes({
            attributes: [stringAttribute("langfuse.observation.input", source)],
          }),
          projectId: `${PROJECT_ID}-media-overlap-${bytes}-${extraAts}-${uploadFails}`,
          fileKey: `${FILE_KEY}.media-overlap-${bytes}-${extraAts}-${uploadFails}`,
          mediaUploadEnabled: true,
          captureSideEffects: () => {
            const attempts =
              otelReplayMocks.uploadMediaForTrace.mock.calls.length -
              uploadCursor;
            uploadCursor =
              otelReplayMocks.uploadMediaForTrace.mock.calls.length;
            return { attempts };
          },
        });

        expectRawNativeParity(comparison);
        for (const replay of [
          comparison.originalTs,
          comparison.earlyTs,
          comparison.earlyRust,
        ]) {
          expect(replay.storedRows).toHaveLength(1);
          expect(replay.storedRows[0]?.input).toBe(expectedInput);
          expect(replay.sideEffects).toEqual({ attempts: 1 });
        }
      },
    );

    it.each(
      [false, true].flatMap((wrapped) =>
        [false, true].map((uploadFails) => ({ wrapped, uploadFails })),
      ),
    )(
      "preserves all mixed-size media in one string with JSON wrapper=$wrapped, upload failure=$uploadFails",
      async ({ wrapped, uploadFails }) => {
        const sizes = [2048, 200, 2048];
        const uris = sizes.map(
          (size, index) =>
            `data:image/png;base64,${Buffer.alloc(size, 97 + index).toString("base64")}`,
        );
        const raw = `${uris[0]} caption ${uris[1]} ${uris[2]}`;
        const source = wrapped ? JSON.stringify({ text: raw }) : raw;
        const reference =
          "@@@langfuseMedia:type=image/png|id=image-media-id|source=base64_data_uri@@@";
        const expectedRaw = uploadFails
          ? raw
          : uris.reduce((value, uri) => value.replace(uri, reference), raw);
        const expectedInput = wrapped
          ? JSON.stringify({ text: expectedRaw })
          : expectedRaw;
        let uploadCursor = 0;
        if (uploadFails) {
          otelReplayMocks.uploadMediaForTrace.mockRejectedValue(
            new Error("simulated mixed-size media upload failure"),
          );
        }

        const comparison = await runOtelReplayComparison({
          bytes: focusedReplayBytes({
            attributes: [stringAttribute("langfuse.observation.input", source)],
          }),
          projectId: `${PROJECT_ID}-media-sandwich-${wrapped}-${uploadFails}`,
          fileKey: `${FILE_KEY}.media-sandwich-${wrapped}-${uploadFails}`,
          mediaUploadEnabled: true,
          captureSideEffects: () => {
            const attempts =
              otelReplayMocks.uploadMediaForTrace.mock.calls.length -
              uploadCursor;
            uploadCursor =
              otelReplayMocks.uploadMediaForTrace.mock.calls.length;
            return { attempts };
          },
        });

        expectRawNativeParity(comparison);
        for (const replay of [
          comparison.originalTs,
          comparison.earlyTs,
          comparison.earlyRust,
        ]) {
          expect(replay.storedRows).toHaveLength(1);
          expect(replay.storedRows[0]?.input).toBe(expectedInput);
          expect(replay.sideEffects).toEqual({ attempts: 3 });
        }
      },
    );

    it("dispatches native media and lookup I/O together and preserves request order", async () => {
      const mediaBodies = Array.from({ length: 6 }, (_, index) =>
        Buffer.alloc(2048, index + 65),
      );
      const dataUris = mediaBodies.map(
        (body) => `data:image/png;base64,${body.toString("base64")}`,
      );
      const uploads = mediaBodies.map(() =>
        Promise.withResolvers<{ mediaId: string; outcome: "uploaded" }>(),
      );
      const started: number[] = [];
      otelReplayMocks.uploadMediaForTrace.mockImplementation(
        async (params: MediaUploadCall) => {
          const body = Buffer.from(params.contentBytes);
          const index = mediaBodies.findIndex((candidate) =>
            candidate.equals(body),
          );
          if (index < 0) throw new Error("unexpected media body");
          started.push(index);
          return uploads[index]!.promise;
        },
      );

      const replay = runOneOtelReplay({
        mode: "early-rust",
        bytes: focusedReplayBytes({
          attributes: [
            stringAttribute("gen_ai.request.model", "gpt-4o-mini"),
            stringAttribute(
              "langfuse.observation.usage_details",
              '{"input":1}',
            ),
            stringAttribute(
              "langfuse.observation.input",
              JSON.stringify(dataUris),
            ),
          ],
        }),
        projectId: `${PROJECT_ID}-concurrent-media`,
        fileKey: `${FILE_KEY}.concurrent-media`,
        mediaUploadEnabled: true,
      });

      try {
        await vi.waitFor(() => expect(started).toHaveLength(5), {
          timeout: 5_000,
        });
        expect(otelReplayMocks.findModel).toHaveBeenCalledOnce();
        uploads[1]!.reject(new Error("simulated media failure"));
        await vi.waitFor(() => expect(started).toHaveLength(6), {
          timeout: 5_000,
        });
        for (const index of [5, 4, 3, 2, 0]) {
          uploads[index]!.resolve({
            mediaId: `media-${index}`,
            outcome: "uploaded",
          });
        }

        const result = await replay;
        expect(started).toEqual(expect.arrayContaining([0, 1, 2, 3, 4, 5]));
        expect(result.storedRows).toHaveLength(1);
        expect(result.storedRows[0]?.input).toBe(
          JSON.stringify(
            dataUris.map((uri, index) =>
              index === 1
                ? uri
                : `@@@langfuseMedia:type=image/png|id=media-${index}|source=base64_data_uri@@@`,
            ),
          ),
        );
      } finally {
        for (const upload of uploads) {
          upload.resolve({ mediaId: "cleanup-media-id", outcome: "uploaded" });
        }
        await replay.catch(() => undefined);
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
        expectRawNativeParity(comparison);
        expect(comparison.originalTs.sideEffects).toEqual(
          comparison.earlyTs.sideEffects,
        );
        expect(comparison.originalTs.sideEffects).toEqual(
          comparison.earlyRust.sideEffects,
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

        expect(comparison.originalTs.storedRows).toHaveLength(2);
        expect(
          comparison.originalTs.legacyRows?.traces?.length,
        ).toBeGreaterThan(0);
        expect(comparison.originalTs.legacyRows?.observations).toHaveLength(2);
        expect(
          comparison.originalTs.legacyRows?.observations_batch_staging,
        ).toHaveLength(0);

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
        const { compactedBatches, preparation } = capturePreparedBatches();
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
          expect(compactedBatches).toHaveLength(2);
          for (const compacted of compactedBatches) {
            expect(compacted.json).toContain(existingReference);
            expect(compacted.json).not.toContain(dataUri);
            expect(compacted.references.length).toBeGreaterThan(0);
            for (const reference of compacted.references) {
              expect(reference).not.toBe(existingReference);
              expect(compacted.json).toContain(reference);
            }
          }
          expectRawNativeParity(comparison);
          expectLegacyReplayParity(comparison);
          const expectedInput = JSON.stringify([
            existingReference,
            uploadFails
              ? dataUri
              : "@@@langfuseMedia:type=image/png|id=image-media-id|source=base64_data_uri@@@",
          ]);
          expect(comparison.originalTs.storedRows).toHaveLength(1);
          expect(comparison.originalTs.legacyRows?.traces).toHaveLength(1);
          expect(comparison.originalTs.legacyRows?.observations).toHaveLength(
            1,
          );
          for (const row of [
            comparison.originalTs.storedRows[0],
            comparison.originalTs.legacyRows?.traces?.[0],
            comparison.originalTs.legacyRows?.observations?.[0],
          ]) {
            expect(row?.input).toBe(expectedInput);
          }
          if (uploadFails) {
            expect(
              otelReplayMocks.linkMediaToTraceOrObservation,
            ).not.toHaveBeenCalled();
          } else {
            expect(comparison.earlyTs.sideEffects).toEqual(
              comparison.originalTs.sideEffects,
            );
            expect(comparison.earlyRust.sideEffects).toEqual(
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
  },
);
