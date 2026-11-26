import "./helpers/otelReplaySetup";

import { createHash, randomInt } from "node:crypto";
import { Decimal } from "decimal.js";
import fc, { type Arbitrary } from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { MediaAssociationOrigin } from "@langfuse/shared";
import * as dispatchConfig from "../features/eventsDispatch/config";
import * as traceSampling from "../features/traceDispatch/traceDispatchSampling";
import type { TraceSpanActivity } from "../features/traceDispatch/traceRuleRecording";
import {
  expectRawNativeParity,
  type OtelReplayResult,
  runOneOtelReplay,
  runOtelReplayComparison,
} from "./helpers/otelReplayHarness";
import {
  configureDefaultOtelReplayMocks,
  otelReplayMocks,
} from "./helpers/otelReplaySetup";
import {
  FILE_KEY,
  PROJECT_PREFIX,
  SCOPE_NAME,
  SERVICE_NAME,
  paddedHex,
  stringAttributes,
  unixNanos,
} from "./helpers/otelReplayPropertyFixtures";
import type { Json } from "./helpers/arbitraries/json";

type AnyValue = Record<string, unknown> | null;

const textValue = (stringValue: string): AnyValue => ({ stringValue });

// OTLP lets any attribute carry any value type, so a key ingestion maps to a
// string column, a lookup or an enum can arrive as any of these.
const stringShapes = ["x", "", " ", "0", "false"].map(textValue);
const falsyScalarShapes: AnyValue[] = [
  { boolValue: false },
  { intValue: "0" },
  { intValue: 0 },
  { doubleValue: 0 },
];
const truthyScalarShapes: AnyValue[] = [
  { boolValue: true },
  { intValue: "5" },
  { intValue: 5 },
  { doubleValue: 1.5 },
];
const arrayShapes: AnyValue[] = [
  { arrayValue: { values: [] } },
  { arrayValue: { values: [textValue("x")] } },
  { arrayValue: { values: [textValue("a"), textValue("b")] } },
];
const structuredShapes: AnyValue[] = [
  { kvlistValue: { values: [{ key: "a", value: { intValue: "1" } }] } },
  { kvlistValue: { values: [] } },
  {},
  null,
];
const anyValueShapes = [
  ...stringShapes,
  ...falsyScalarShapes,
  ...truthyScalarShapes,
  ...arrayShapes,
  ...structuredShapes,
];

type WrongTypeTarget = {
  place: "span" | "resource" | "scope" | "spanField";
  key: string;
  shapes: AnyValue[];
};

const wrongTypeTargets: WrongTypeTarget[] = [
  ...[
    "langfuse.trace.name",
    "langfuse.version",
    "langfuse.release",
    "langfuse.observation.status_message",
    "langfuse.user.id",
    "user.id",
    "langfuse.observation.metadata.langfuse_user_id",
    "langfuse.trace.metadata.langfuse_user_id",
    "ai.telemetry.metadata.userId",
    "user.name",
    "langfuse.session.id",
    "session.id",
    "gen_ai.conversation.id",
    "langfuse.observation.metadata.langfuse_session_id",
    "langfuse.trace.metadata.langfuse_session_id",
    "ai.telemetry.metadata.sessionId",
    "langfuse.evaluator.id",
    "langfuse.evaluation.rule.id",
    "langfuse.experiment.id",
    "langfuse.experiment.name",
    "langfuse.experiment.description",
    "langfuse.experiment.dataset.id",
    "langfuse.experiment.item.id",
    "langfuse.experiment.item.expected_output",
    "langfuse.experiment.item.root_observation_id",
    "gen_ai.tool.name",
    "genkit:name",
    "logfire.msg",
    "ai.toolCall.name",
    "ai.operationId",
    "ai.telemetry.functionId",
    "langfuse.observation.model.name",
    "litellm.provider.model",
    "gen_ai.response.model",
    "ai.model.id",
    "gen_ai.request.model",
    "llm.response.model",
    "llm.model_name",
    "model",
    "langfuse.observation.prompt.version",
    "langfuse.prompt.version",
    "langfuse.observation.type",
    "openinference.span.kind",
    "gen_ai.operation.name",
    "genkit:metadata:subtype",
    "langfuse.environment",
    "deployment.environment",
    "deployment.environment.name",
    "langfuse.observation.level",
    "langfuse.trace.public",
    "langfuse.public",
    "langfuse.trace.tags",
    "langfuse.tags",
    "langfuse.observation.input",
    "langfuse.observation.output",
    "langfuse.trace.input",
    "langfuse.trace.output",
    "langfuse.observation.metadata",
    "langfuse.trace.metadata",
    "langfuse.observation.metadata.k",
  ].map((key): WrongTypeTarget => ({
    place: "span",
    key,
    shapes: anyValueShapes,
  })),
  // TypeScript hands a truthy number, boolean or array to the prompt service
  // unchanged, where Rust sends its text form. Strings and falsy values agree.
  ...["langfuse.observation.prompt.name", "langfuse.prompt.name"].map(
    (key): WrongTypeTarget => ({
      place: "span",
      key,
      shapes: [...stringShapes, ...falsyScalarShapes, ...structuredShapes],
    }),
  ),
  ...[
    "service.name",
    "service.version",
    "langfuse.release",
    "telemetry.sdk.language",
    "telemetry.sdk.name",
    "telemetry.sdk.version",
    "langfuse.user.id",
    "user.id",
    "user.name",
    "langfuse.environment",
    "deployment.environment",
    "deployment.environment.name",
  ].map((key): WrongTypeTarget => ({
    place: "resource",
    key,
    shapes: anyValueShapes,
  })),
  // TypeScript rejects the whole batch when the scope name is not a string.
  { place: "scope", key: "name", shapes: stringShapes },
  { place: "scope", key: "version", shapes: anyValueShapes },
  { place: "spanField", key: "name", shapes: anyValueShapes },
  { place: "spanField", key: "status.message", shapes: anyValueShapes },
];

type WrongTypeOverride = Pick<WrongTypeTarget, "place" | "key"> & {
  value: AnyValue;
};

type WrongTypeSpanSeed = {
  // Each default can be dropped so a lower-priority alias becomes the source.
  defaults: {
    type: boolean;
    model: boolean;
    promptName: boolean;
    promptVersion: boolean;
  };
  overrides: WrongTypeOverride[];
};

const wrongTypeSpanArbitrary: Arbitrary<WrongTypeSpanSeed> = fc.record({
  defaults: fc.record({
    type: fc.boolean(),
    model: fc.boolean(),
    promptName: fc.boolean(),
    promptVersion: fc.boolean(),
  }),
  overrides: fc.uniqueArray(
    fc
      .constantFrom(...wrongTypeTargets)
      .chain(({ place, key, shapes }) =>
        fc.constantFrom(...shapes).map((value) => ({ place, key, value })),
      ),
    {
      minLength: 1,
      maxLength: 3,
      selector: ({ place, key }) => `${place}:${key}`,
    },
  ),
});

// Span and scope fields are plain JSON rather than OTLP AnyValue wrappers.
function plainValue(value: AnyValue): unknown {
  if (value === null) return null;
  if ("stringValue" in value) return value.stringValue;
  if ("boolValue" in value) return value.boolValue;
  if ("intValue" in value) return Number(value.intValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("arrayValue" in value) {
    return (value.arrayValue as { values: AnyValue[] }).values.map(plainValue);
  }
  if ("kvlistValue" in value) {
    return Object.fromEntries(
      (
        value.kvlistValue as { values: { key: string; value: AnyValue }[] }
      ).values.map(({ key, value }) => [key, plainValue(value)]),
    );
  }
  return {};
}

function buildWrongTypeReplay(seeds: WrongTypeSpanSeed[]): Buffer {
  const resourceSpans = seeds.map((seed, index) => {
    const at = (place: WrongTypeTarget["place"]) =>
      seed.overrides.filter((override) => override.place === place);
    const overridden = new Set(at("span").map(({ key }) => key));
    const defaults: [string, AnyValue, boolean][] = [
      ["langfuse.observation.input", textValue("hello"), true],
      [
        "langfuse.observation.type",
        textValue("generation"),
        seed.defaults.type,
      ],
      ["gen_ai.request.model", textValue("base-model"), seed.defaults.model],
      [
        "langfuse.observation.prompt.name",
        textValue("base-prompt"),
        seed.defaults.promptName,
      ],
      [
        "langfuse.observation.prompt.version",
        { intValue: "3" },
        seed.defaults.promptVersion,
      ],
    ];
    const span: Record<string, unknown> = {
      traceId: paddedHex(BigInt(index + 1), 32),
      spanId: paddedHex(BigInt(index + 1), 16),
      name: "wrong-type",
      kind: 1,
      startTimeUnixNano: unixNanos(Date.UTC(2026, 0, 1) + index, 0),
      endTimeUnixNano: unixNanos(Date.UTC(2026, 0, 1) + index + 1, 0),
      attributes: [
        ...defaults.flatMap(([key, value, present]) =>
          present && !overridden.has(key) ? [{ key, value }] : [],
        ),
        ...at("span").map(({ key, value }) => ({ key, value })),
      ],
    };
    for (const { key, value } of at("spanField")) {
      if (key === "status.message") {
        span.status = { code: 2, message: plainValue(value) };
      } else {
        span[key] = plainValue(value);
      }
    }
    return {
      resource: {
        attributes: [
          ...(at("resource").some(({ key }) => key === "service.name")
            ? []
            : [{ key: "service.name", value: textValue(SERVICE_NAME) }]),
          ...at("resource").map(({ key, value }) => ({
            key: key,
            value,
          })),
        ],
      },
      scopeSpans: [
        {
          scope: {
            name: "wrong-type-scope",
            version: "1.0.0",
            ...Object.fromEntries(
              at("scope").map(({ key, value }) => [key, plainValue(value)]),
            ),
          },
          spans: [span],
        },
      ],
    };
  });
  return Buffer.from(JSON.stringify(resourceSpans));
}

const distinct = (values: string[]) => [...new Set(values)];

/**
 * A row comparison cannot see what was asked of the model and prompt services,
 * so the requests are compared too, with their JavaScript type: `false` and
 * `"false"` store the same text but only one of them is looked up.
 *
 * TypeScript rejects some wrong-typed documents outright, for example when it
 * calls a string method on the value. There is then no reference result, so
 * the case is skipped rather than compared.
 */
async function assertWrongTypeReplayParity(
  seeds: WrongTypeSpanSeed[],
): Promise<void> {
  const requests: string[] = [];
  const typed = (value: unknown) => `${typeof value} ${JSON.stringify(value)}`;
  otelReplayMocks.findModel.mockImplementation(
    async ({ model }: { model: unknown }) => {
      requests.push(`model ${typed(model)}`);
      return { model: { id: "replay-model-id" }, pricingTiers: [] };
    },
  );
  otelReplayMocks.getPrompt.mockImplementation(
    async (request: { promptName: unknown; version: unknown }) => {
      requests.push(
        `prompt ${typed(request.promptName)} ${typed(request.version)}`,
      );
      return { id: "replay-prompt-id" };
    },
  );
  const bytes = buildWrongTypeReplay(seeds);
  const replay = (mode: OtelReplayResult["mode"]) =>
    runOneOtelReplay({
      mode,
      bytes: Buffer.from(bytes),
      projectId: `${PROJECT_PREFIX}-wrong-type-${seeds.length}`,
      fileKey: FILE_KEY,
      mediaUploadEnabled: true,
      captureSideEffects: () => requests.splice(0).sort(),
    });
  try {
    const originalTs = await replay("original-ts").catch(() => {
      requests.length = 0;
      return undefined;
    });
    fc.pre(originalTs !== undefined);
    const comparison = {
      originalTs: originalTs!,
      earlyTs: await replay("early-ts"),
      earlyRust: await replay("early-rust"),
    };
    expect(comparison.originalTs.storedRows).toHaveLength(seeds.length);
    expect(comparison.earlyTs.sideEffects).toEqual(
      comparison.originalTs.sideEffects,
    );
    // The Rust path resolves each distinct lookup request once, so it may
    // repeat fewer lookups than the other paths, but it makes the same ones.
    expect(distinct(comparison.earlyRust.sideEffects as string[])).toEqual(
      distinct(comparison.originalTs.sideEffects as string[]),
    );
    expectRawNativeParity(comparison);
  } finally {
    configureDefaultOtelReplayMocks();
  }
}

// Decisions the generator reaches rarely: a falsy prompt name is stored but not
// looked up, a non-string trace name or name override is stored as text but
// not evaluated.
const allDefaults = {
  type: true,
  model: true,
  promptName: true,
  promptVersion: true,
};
// Name sources in priority order; the span name itself is the last resort.
const nameSourceKeys = [
  "gen_ai.tool.name",
  "genkit:name",
  "logfire.msg",
  "ai.toolCall.name",
];
const noDefaults = {
  type: false,
  model: false,
  promptName: false,
  promptVersion: false,
};
// Each kind of value as the span name, then on every name source above
// lower-priority string aliases, under a valid override, and as the function
// id that prefixes an operation name.
const competingNameSources: WrongTypeSpanSeed[] = (
  [
    [{ intValue: "5" }, { intValue: "5" }],
    [{ boolValue: false }, { boolValue: false }],
    [
      { arrayValue: { values: [textValue("tool")] } },
      { arrayValue: { values: [textValue("tool")] } },
    ],
    [textValue("5"), textValue("5")],
    [textValue(""), textValue("")],
    // A null span name, and an attribute with no value set.
    [null, {}],
  ] satisfies [AnyValue, AnyValue][]
).flatMap(([spanName, attribute]) => {
  const named = (...attributes: [string, AnyValue][]): WrongTypeSpanSeed => ({
    defaults: noDefaults,
    overrides: [
      { place: "spanField", key: "name", value: spanName },
      ...attributes.map(([key, value]): WrongTypeOverride => ({
        place: "span",
        key,
        value,
      })),
    ],
  });
  return [
    named(),
    ...nameSourceKeys.map((key, index) =>
      named(
        [key, attribute],
        ...nameSourceKeys
          .slice(index + 1)
          .map((alias): [string, AnyValue] => [
            alias,
            textValue("lower priority"),
          ]),
      ),
    ),
    named(["genkit:name", textValue("valid override")]),
    named(
      ["ai.operationId", textValue("generate")],
      ["ai.telemetry.functionId", attribute],
    ),
  ];
});

const directedWrongTypeExamples: WrongTypeSpanSeed[][] = [
  competingNameSources,
  [
    {
      defaults: allDefaults,
      overrides: [
        {
          place: "span",
          key: "langfuse.observation.prompt.name",
          value: { boolValue: false },
        },
      ],
    },
  ],
  [
    {
      defaults: allDefaults,
      overrides: [
        {
          place: "span",
          key: "langfuse.trace.name",
          value: { arrayValue: { values: [textValue("x")] } },
        },
      ],
    },
  ],
  [
    {
      defaults: allDefaults,
      overrides: [
        {
          place: "span",
          key: "ai.toolCall.name",
          value: { intValue: "5" },
        },
      ],
    },
  ],
  [
    {
      defaults: allDefaults,
      overrides: [
        {
          place: "spanField",
          key: "name",
          value: { intValue: 5 },
        },
      ],
    },
  ],
];

type LifecycleSpanSeed = {
  // Only generations carry a model, a prompt and usage, so only they can be
  // dropped by a failed lookup.
  generation: {
    model: number | null;
    prompt: { name: number; version: number } | null;
  } | null;
  input: string | null;
  output: string | null;
  note: string;
  padding: number;
};

type LifecycleCase = {
  spans: LifecycleSpanSeed[];
  // Selects which models, prompts and uploads fail in this case.
  salt: number;
  overflow: boolean;
  mediaUploadEnabled: boolean;
};

const LIFECYCLE_OVERFLOW_LIMIT_BYTES = 256;

const mediaTypeArbitrary = fc.constantFrom(
  "image/png",
  "image/jpeg",
  "application/pdf",
  "audio/wav",
  "text/plain",
);
// Small bodies stay below the overflow limit and large ones cross it, so one
// case can hold uploaded media, inline media and overflowing fields.
const mediaBodyArbitrary = fc
  .oneof(
    fc.uint8Array({ minLength: 1, maxLength: 48 }),
    fc.uint8Array({ minLength: 300, maxLength: 420 }),
  )
  .map((bytes) => Buffer.from(bytes).toString("base64"));
const dataUriArbitrary = fc
  .tuple(mediaTypeArbitrary, mediaBodyArbitrary)
  .map(([type, body]) => `data:${type};base64,${body}`);
const typedBodyArbitrary = fc.tuple(mediaTypeArbitrary, mediaBodyArbitrary);

// Shapes both media detectors extract identically: whitespace-delimited data
// URIs in text, and provider parts at most one JSON layer deep.
const mediaPartArbitrary: Arbitrary<Json> = fc.oneof(
  fc.tuple(dataUriArbitrary, dataUriArbitrary).map(([first, second]) => ({
    type: "text",
    text: `Please look at ${first} and ${second} thanks`,
  })),
  typedBodyArbitrary.map(([media_type, data]) => ({
    type: "image",
    source: { type: "base64", media_type, data },
  })),
  typedBodyArbitrary.map(([mediaType, data]) => ({
    type: "file",
    mediaType,
    data,
  })),
  typedBodyArbitrary.map(([mime_type, data]) => ({
    inline_data: { mime_type, data },
  })),
  typedBodyArbitrary.map(([mime_type, data]) => ({
    type: "media",
    mime_type,
    data,
  })),
  dataUriArbitrary.map((url) => ({ type: "image_url", image_url: { url } })),
  fc
    .nat(60)
    .map((words) => ({ type: "text", text: "plain words ".repeat(words) })),
);

const lifecycleSpanArbitrary: Arbitrary<LifecycleSpanSeed> = fc.record({
  generation: fc.option(
    fc.record({
      model: fc.option(fc.nat(7), { nil: null }),
      prompt: fc.option(
        fc.record({ name: fc.nat(5), version: fc.integer({ min: 1, max: 4 }) }),
        { nil: null },
      ),
    }),
    { nil: null },
  ),
  input: fc.oneof(
    fc.constant(null),
    dataUriArbitrary.map((uri) => `Summarise ${uri} now`),
    fc
      .array(
        fc.record({
          role: fc.constantFrom("user", "assistant"),
          content: fc.array(mediaPartArbitrary, { minLength: 1, maxLength: 3 }),
        }),
        { minLength: 1, maxLength: 2 },
      )
      .map((messages) => JSON.stringify(messages)),
  ),
  output: fc.oneof(
    fc.constant(null),
    mediaPartArbitrary.map((part) =>
      JSON.stringify({ role: "assistant", content: [part] }),
    ),
    fc
      .tuple(dataUriArbitrary, fc.nat(600))
      .map(([uri, filler]) => `done ${uri} ok ${"z".repeat(filler)}`),
  ),
  note: fc.oneof(fc.constant("note"), dataUriArbitrary),
  // The large value exceeds the fixed per-span allowance of the native estimate.
  padding: fc.constantFrom(20, 2_000),
});

const lifecycleCaseArbitrary: Arbitrary<LifecycleCase> = fc.record({
  // The first span needs no lookup: the replay harness requires at least one
  // stored row, and a batch can otherwise lose every span to failed lookups.
  spans: fc
    .tuple(
      lifecycleSpanArbitrary.map((span) => ({ ...span, generation: null })),
      fc.array(lifecycleSpanArbitrary, { maxLength: 5 }),
    )
    .map(([first, rest]) => [first, ...rest]),
  salt: fc.nat(0xffff),
  overflow: fc.boolean(),
  mediaUploadEnabled: fc.boolean(),
});

const lifecycleModelName = (model: number) => `lifecycle-model-${model}`;
const lifecyclePromptName = (prompt: number) => `lifecycle-prompt-${prompt}`;
const lifecycleSpanId = (index: number) => paddedHex(BigInt(index + 1), 16);
// Three spans share a trace so byte totals are summed across rows.
const lifecycleTraceId = (index: number) =>
  paddedHex(BigInt(Math.floor(index / 3) + 1), 32);

function buildLifecycleReplay(spans: LifecycleSpanSeed[]): Buffer {
  const baseMillis = Date.UTC(2026, 0, 1);
  return Buffer.from(
    JSON.stringify([
      {
        resource: {
          attributes: stringAttributes({ "service.name": SERVICE_NAME }),
        },
        scopeSpans: [
          {
            scope: { name: SCOPE_NAME, version: "1.0.0" },
            spans: spans.map((seed, index) => ({
              traceId: lifecycleTraceId(index),
              spanId: lifecycleSpanId(index),
              name: `lifecycle-${index}`,
              kind: 1,
              startTimeUnixNano: unixNanos(baseMillis + index * 1_000, 0),
              endTimeUnixNano: unixNanos(baseMillis + index * 1_000 + 500, 0),
              attributes: [
                ...stringAttributes({
                  "langfuse.observation.type": seed.generation
                    ? "generation"
                    : "span",
                  "langfuse.observation.input": seed.input,
                  "langfuse.observation.output": seed.output,
                  "langfuse.observation.metadata.note": seed.note,
                  "langfuse.observation.metadata.padding": "m".repeat(
                    seed.padding,
                  ),
                  "langfuse.observation.model.name":
                    seed.generation?.model == null
                      ? null
                      : lifecycleModelName(seed.generation.model),
                  "langfuse.observation.prompt.name": seed.generation?.prompt
                    ? lifecyclePromptName(seed.generation.prompt.name)
                    : null,
                }),
                ...(seed.generation?.prompt
                  ? [
                      {
                        key: "langfuse.observation.prompt.version",
                        value: {
                          intValue: String(seed.generation.prompt.version),
                        },
                      },
                    ]
                  : []),
                ...(seed.generation
                  ? [
                      {
                        key: "gen_ai.usage.input_tokens",
                        value: { intValue: String(100 + index) },
                      },
                      {
                        key: "gen_ai.usage.output_tokens",
                        value: { intValue: String(10 + index) },
                      },
                    ]
                  : []),
              ],
            })),
          },
        ],
      },
    ]),
  );
}

// The same key fails in every mode of one case and in a different set of
// cases for each salt.
function faultBucket(salt: number, key: string, buckets: number): number {
  return createHash("sha256").update(`${salt}:${key}`).digest()[0]! % buckets;
}
const modelLookupFails = (salt: number, model: string) =>
  faultBucket(salt, `model:${model}`, 8) === 0;
const promptLookupFails = (salt: number, name: string, version: number) =>
  faultBucket(salt, `prompt:${name}:${version}`, 6) === 0;

type LifecycleEffects = {
  lookups: string[];
  overflowUploads: string[];
  mediaUploads: number;
  activity: TraceSpanActivity[];
};

// What trace dispatch reads back for a span: input, output and metadata.
function dispatchPayloadBytes(row: Record<string, unknown>): number {
  const text = (value: unknown) =>
    typeof value === "string" ? Buffer.byteLength(value) : 0;
  const list = (value: unknown) =>
    Array.isArray(value)
      ? value.reduce<number>((sum, item) => sum + text(item), 0)
      : 0;
  return (
    text(row.input) +
    text(row.output) +
    list(row.metadata_names) +
    list(row.metadata_values)
  );
}

function sumByTrace<T>(
  items: readonly T[],
  traceId: (item: T) => string,
  bytes: (item: T) => number,
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const item of items) {
    totals.set(traceId(item), (totals.get(traceId(item)) ?? 0) + bytes(item));
  }
  return totals;
}

/**
 * Replays documents with media, models and prompts while a salted subset of
 * lookups and uploads fails, with field overflow and media upload switched per
 * case. Rows and evaluation decisions must match across paths, and so must the
 * side effects a row comparison cannot see.
 */
async function assertLifecycleParity(testCase: LifecycleCase): Promise<void> {
  const { spans, salt, overflow, mediaUploadEnabled } = testCase;
  const effects: LifecycleEffects = {
    lookups: [],
    overflowUploads: [],
    mediaUploads: 0,
    activity: [],
  };
  otelReplayMocks.findModel.mockImplementation(
    async ({ model }: { model: string }) => {
      effects.lookups.push(`model ${model}`);
      if (modelLookupFails(salt, model)) {
        throw new Error("simulated model lookup failure");
      }
      // Unknown models and priced models both stay in the batch.
      if (faultBucket(salt, `known:${model}`, 3) === 0) {
        return { model: null, pricingTiers: [] };
      }
      return {
        model: { id: `id-of-${model}` },
        pricingTiers: [
          {
            id: "tier-default",
            name: "Standard",
            isDefault: true,
            priority: 0,
            conditions: [],
            prices: [
              { usageType: "input", price: new Decimal("0.0000025") },
              { usageType: "output", price: new Decimal("0.00001") },
            ],
          },
        ],
      };
    },
  );
  otelReplayMocks.getPrompt.mockImplementation(
    async (request: { promptName: string; version: number }) => {
      effects.lookups.push(`prompt ${request.promptName} ${request.version}`);
      if (promptLookupFails(salt, request.promptName, request.version)) {
        throw new Error("simulated prompt lookup failure");
      }
      return faultBucket(salt, `known:${request.promptName}`, 3) === 0
        ? null
        : { id: `id-of-${request.promptName}` };
    },
  );
  otelReplayMocks.uploadMediaForTrace.mockImplementation(
    async (upload: {
      contentBytes: Uint8Array;
      field: string;
      origin?: MediaAssociationOrigin;
    }) => {
      const digest = createHash("sha256")
        .update(upload.contentBytes)
        .digest("hex");
      if (upload.origin === MediaAssociationOrigin.INGESTION_FIELD_OVERFLOW) {
        effects.overflowUploads.push(`${upload.field} ${digest}`);
      } else {
        effects.mediaUploads += 1;
      }
      if (faultBucket(salt, `upload:${digest}`, 4) === 0) {
        throw new Error("simulated upload failure");
      }
      return { mediaId: digest.slice(0, 22), outcome: "uploaded" as const };
    },
  );
  otelReplayMocks.createEvalSchedulerDeps.mockImplementation(() => ({
    collectTraceActivity: (activity: TraceSpanActivity) => {
      effects.activity.push(activity);
    },
    flushTraceActivity: async () => undefined,
    traceTranscriptRules: Promise.resolve([]),
  }));
  // Sample every trace so each accepted span reports its dispatch weight.
  const dispatch = vi
    .spyOn(dispatchConfig, "isEventsDispatchEnabled")
    .mockReturnValue(true);
  const sampling = vi
    .spyOn(traceSampling, "resolveTraceDispatchSamplingRate")
    .mockResolvedValue(1);

  try {
    const comparison = await runOtelReplayComparison({
      bytes: buildLifecycleReplay(spans),
      projectId: `${PROJECT_PREFIX}-lifecycle-${spans.length}`,
      fileKey: FILE_KEY,
      mediaUploadEnabled,
      overflowEnabled: overflow,
      overflowSizeLimitBytes: LIFECYCLE_OVERFLOW_LIMIT_BYTES,
      captureSideEffects: (): LifecycleEffects => ({
        lookups: effects.lookups.splice(0).sort(),
        overflowUploads: effects.overflowUploads.splice(0).sort(),
        mediaUploads: effects.mediaUploads - (effects.mediaUploads = 0),
        activity: effects.activity.splice(0),
      }),
    });

    // A failed model or prompt lookup drops that span and nothing else.
    const expectedSpanIds = spans.flatMap(({ generation }, index) =>
      (generation?.model != null &&
        modelLookupFails(salt, lifecycleModelName(generation.model))) ||
      (generation?.prompt &&
        promptLookupFails(
          salt,
          lifecyclePromptName(generation.prompt.name),
          generation.prompt.version,
        ))
        ? []
        : [lifecycleSpanId(index)],
    );
    const activityKeys = (result: OtelReplayResult) =>
      (result.sideEffects as LifecycleEffects).activity
        .map(
          ({ traceId, spanStartTimeISO, ruleIds }) =>
            `${traceId} ${spanStartTimeISO} ${ruleIds.join(",")}`,
        )
        .sort();
    const reference = comparison.originalTs.sideEffects as LifecycleEffects;

    for (const result of [
      comparison.originalTs,
      comparison.earlyTs,
      comparison.earlyRust,
    ]) {
      const observed = result.sideEffects as LifecycleEffects;
      expect(
        result.storedRows.map((row) => String(row.span_id)).sort(),
        result.mode,
      ).toEqual(expectedSpanIds);
      // The Rust path resolves each distinct lookup request once.
      const lookups = (values: string[]) =>
        result.mode === "early-rust" ? distinct(values) : values;
      expect(lookups(observed.lookups), result.mode).toEqual(
        lookups(reference.lookups),
      );
      expect(observed.overflowUploads, result.mode).toEqual(
        reference.overflowUploads,
      );
      if (!mediaUploadEnabled) {
        expect(observed.mediaUploads, result.mode).toBe(0);
      }
      if (!overflow) expect(observed.overflowUploads, result.mode).toEqual([]);

      // Every accepted span is recorded once for trace dispatch, and a trace's
      // recorded weight never undercounts the payload dispatch reads back.
      expect(activityKeys(result), result.mode).toEqual(
        activityKeys(comparison.originalTs),
      );
      expect(observed.activity, result.mode).toHaveLength(
        result.storedRows.length,
      );
      const recorded = sumByTrace(
        observed.activity,
        ({ traceId }) => traceId,
        ({ serializedEventBytes }) => serializedEventBytes,
      );
      const stored = sumByTrace(
        result.storedRows,
        (row) => String(row.trace_id),
        dispatchPayloadBytes,
      );
      for (const [traceId, payloadBytes] of stored) {
        expect(
          recorded.get(traceId),
          `${result.mode} ${traceId}`,
        ).toBeGreaterThanOrEqual(payloadBytes);
      }
    }
    expectRawNativeParity(comparison);
  } finally {
    dispatch.mockRestore();
    sampling.mockRestore();
    configureDefaultOtelReplayMocks();
  }
}

// Shrinking replays the queue once per step. Stop early enough that a found
// counterexample is reported instead of being lost to the Vitest timeout.
const REPORT_BEFORE_TIMEOUT_MS = 90_000;

// The replay writer retries internally; Vitest retries could overlap an
// unfinished replay and race the shared writer singleton.
describe(
  "OTEL replay adversarial properties",
  { retry: 0, timeout: 120_000 },
  () => {
    it("keeps rows, lookups and evaluation decisions aligned when known attributes carry the wrong type", async () => {
      const seed = randomInt(2 ** 31);
      process.stderr.write(`OTEL wrong-type replay seed=${seed}\n`);
      await fc.assert(
        fc.asyncProperty(
          fc.array(wrongTypeSpanArbitrary, { minLength: 1, maxLength: 3 }),
          assertWrongTypeReplayParity,
        ),
        {
          seed,
          numRuns: 192,
          interruptAfterTimeLimit: REPORT_BEFORE_TIMEOUT_MS,
          examples: directedWrongTypeExamples.map((example) => [example]),
        },
      );
    });

    it("keeps rows, lookups, overflow uploads and trace activity aligned when lookups and uploads fail", async () => {
      const seed = randomInt(2 ** 31);
      process.stderr.write(`OTEL lifecycle replay seed=${seed}\n`);
      await fc.assert(
        fc.asyncProperty(lifecycleCaseArbitrary, assertLifecycleParity),
        {
          seed,
          numRuns: 96,
          interruptAfterTimeLimit: REPORT_BEFORE_TIMEOUT_MS,
        },
      );
    });
  },
);
