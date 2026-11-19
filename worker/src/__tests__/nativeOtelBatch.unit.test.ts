import { describe, expect, it } from "vitest";
import { prepareOtelJson, validateOtelJson } from "@langfuse/native";
import { convertEventRecordToObservationForEval } from "@langfuse/shared";

const nativeContext = {
  projectId: "native-boundary",
  fileKey: "generated-lookups.json",
  now: "2026-09-24T00:00:00.000Z",
  ingestionApiKey: "",
  ingestionSdkName: "test",
  ingestionSdkVersion: "test",
  isLangfuseInternal: false,
};

const spanId = (index: number) => (index + 1).toString(16).padStart(16, "0");

describe("Native OTEL batch NAPI boundary", () => {
  it("keeps inline media through completion when extraction is disabled", async () => {
    const input = "data:image/png;base64,aGk=";
    const span = {
      traceId: "a".repeat(32),
      spanId: spanId(0),
      name: "disabled-media",
      attributes: [
        { key: "langfuse.observation.input", value: { stringValue: input } },
      ],
    };
    const batch = await prepareOtelJson(
      Buffer.from(JSON.stringify([{ scopeSpans: [{ spans: [span] }] }])),
      false,
    );
    try {
      const { batch: processing, mediaRequests } =
        await batch.process(nativeContext);
      try {
        expect(mediaRequests).toEqual([]);
        const { finalized } = await processing.complete(
          [],
          [],
          undefined,
          true,
        );
        expect(finalized?.evaluationRows).toMatchObject([{ input }]);
      } finally {
        await processing.dispose();
      }
    } finally {
      await batch.dispose();
    }
  });

  it("matches TypeScript optional experiment fields in evaluation snapshots", async () => {
    const experimentFields = [
      ["id", "experiment_id"],
      ["name", "experiment_name"],
      ["description", "experiment_description"],
      ["dataset.id", "experiment_dataset_id"],
      ["item.id", "experiment_item_id"],
      ["item.expected_output", "experiment_item_expected_output"],
      ["item.root_observation_id", "experiment_item_root_span_id"],
    ] as const;
    const expectedExperimentFields = Object.fromEntries(
      experimentFields.map(([, column], index) => [
        column,
        `experiment-${index}`,
      ]),
    );
    const spans = [
      {
        traceId: "a".repeat(32),
        spanId: spanId(0),
        name: "without-experiment",
      },
      {
        traceId: "a".repeat(32),
        spanId: spanId(1),
        name: "with-experiment",
        attributes: experimentFields.map(([suffix], index) => ({
          key: `langfuse.experiment.${suffix}`,
          value: { stringValue: `experiment-${index}` },
        })),
      },
    ];
    const validated = await validateOtelJson(
      Buffer.from(JSON.stringify([{ resource: {}, scopeSpans: [{ spans }] }])),
    );
    const batch = await validated.extract(true);
    const { batch: processing } = await batch.process(nativeContext);
    try {
      const { finalized } = await processing.complete([], [], undefined, true);
      const rows = finalized!.evaluationRows as Record<string, unknown>[];

      for (const [, column] of experimentFields) {
        expect(rows[0]).not.toHaveProperty(column);
      }
      expect(rows[1]).toMatchObject(expectedExperimentFields);
    } finally {
      await processing.dispose();
      await batch.dispose();
      await validated.dispose();
    }
  });

  it.each([undefined, 1])(
    "retains raw evaluation types across completion with overflow limit %s",
    async (limit) => {
      const spans = [
        { arrayValue: { values: [{ stringValue: "trace-name" }] } },
        { stringValue: '["trace-name"]' },
      ].map((value, index) => ({
        traceId: "a".repeat(32),
        spanId: spanId(index),
        name: "evaluation-types",
        startTimeUnixNano: "1750000000000000000",
        endTimeUnixNano: "1750000001000000000",
        attributes: [
          { key: "langfuse.trace.name", value },
          {
            key: "langfuse.observation.input",
            value: { stringValue: "full input" },
          },
        ],
      }));
      const validated = await validateOtelJson(
        Buffer.from(
          JSON.stringify([{ resource: {}, scopeSpans: [{ spans }] }]),
        ),
      );
      const batch = await validated.extract(true);
      const { batch: processing } = await batch.process(nativeContext);
      try {
        const completion = await processing.complete([], [], limit, true);
        const finalized =
          completion.finalized ??
          (await processing.finalize(
            completion.overflowRequests.map(({ index }) => ({ index })),
            true,
          ));
        expect(finalized.events).toHaveLength(2);
        const rows = finalized.evaluationRows as Parameters<
          typeof convertEventRecordToObservationForEval
        >[0][];
        expect(rows.map((row) => row.input)).toEqual([
          "full input",
          "full input",
        ]);
        expect(() =>
          convertEventRecordToObservationForEval(rows[0]!),
        ).toThrow();
        expect(
          convertEventRecordToObservationForEval(rows[1]!).trace_name,
        ).toBe('["trace-name"]');
      } finally {
        await processing.dispose();
        await batch.dispose();
        await validated.dispose();
      }
    },
  );

  it("associates sparse lookup results with their events and retains events needing no I/O", async () => {
    const selectedTraceId = "0123456789abcdef0123456789abcdef";
    const unselectedTraceId = "fedcba9876543210fedcba9876543210";
    const spans = [0, 1, 2].map((index) => ({
      traceId: index === 2 ? unselectedTraceId : selectedTraceId,
      spanId: `0123456789abcde${index}`,
      name: "sparse-lookups".repeat(1000),
      startTimeUnixNano: "1750000000000000000",
      endTimeUnixNano: "1750000001000000000",
      attributes:
        index === 1
          ? [
              {
                key: "gen_ai.request.model",
                value: { stringValue: "test-model" },
              },
            ]
          : [],
    }));
    const validated = await validateOtelJson(
      Buffer.from(JSON.stringify([{ resource: {}, scopeSpans: [{ spans }] }])),
    );
    const batch = await validated.extract(true);
    const {
      batch: processing,
      mediaRequests,
      lookupRequests,
    } = await batch.process({
      projectId: "native-boundary",
      fileKey: "sparse-lookups.json",
      now: "2026-09-24T00:00:00.000Z",
      ingestionApiKey: "",
      ingestionSdkName: "test",
      ingestionSdkVersion: "test",
      isLangfuseInternal: false,
    });
    try {
      await expect(batch.copyJsonBuffer()).rejects.toMatchObject({
        code: "ERR_OTEL_CLOSED",
      });
      expect(mediaRequests).toEqual([]);
      expect(lookupRequests).toMatchObject([
        { spanId: "0123456789abcde1", modelName: "test-model" },
      ]);
      await expect(
        processing.complete([], [], undefined, true),
      ).rejects.toThrow("incomplete OTEL lookup results");
      const skillsAvailable = [
        { skillName: "bar", skillVersion: 17 },
        { skillName: "baz", langfuseSkillId: "skill-baz" },
      ];
      const skillsResourceLoaded = skillsAvailable.map((skill) => ({
        ...skill,
        filePath: "guide.md",
      }));
      const { finalized } = await processing.complete(
        [],
        [
          {
            model: { id: "matched-model" },
            skillsAvailable,
            skillsResourceLoaded,
          },
        ],
        undefined,
        true,
        [selectedTraceId],
      );
      expect(finalized).toBeDefined();
      expect(finalized!.evaluationRows).toMatchObject([
        { span_id: "0123456789abcde0", model_id: null },
        { span_id: "0123456789abcde1", model_id: "matched-model" },
        { span_id: "0123456789abcde2", model_id: null },
      ]);
      const skillRow = finalized!.evaluationRows[1] as Record<string, unknown>;
      expect(skillRow.skills_available).toEqual(skillsAvailable);
      expect(skillRow.skills_resource_loaded).toEqual(skillsResourceLoaded);
      expect(finalized!.events).toHaveLength(3);
      expect(finalized!.events[0]?.serializedEventBytes).toBeGreaterThan(
        Buffer.byteLength(spans[0].name),
      );
      expect(finalized!.events[2]?.serializedEventBytes).toBeUndefined();
    } finally {
      await processing.dispose();
      await batch.dispose();
      await validated.dispose();
    }
  });

  it("weights the payload retained after each overflow upload for trace dispatch", async () => {
    const traceId = "a".repeat(32);
    const input = 'é"'.repeat(200);
    const reference =
      "@@@langfuseMedia:type=text/plain|id=example|source=field_size_limit@@@";
    const spans = [spanId(0), spanId(1)].map((id) => ({
      traceId,
      spanId: id,
      name: "overflow",
      attributes: [
        { key: "langfuse.observation.input", value: { stringValue: input } },
      ],
    }));
    const batch = await prepareOtelJson(
      Buffer.from(JSON.stringify([{ scopeSpans: [{ spans }] }])),
      false,
    );
    try {
      const { batch: processing } = await batch.process(nativeContext);
      try {
        const { overflowRequests } = await processing.complete(
          [],
          [],
          256,
          false,
          [traceId],
        );
        expect(overflowRequests.map((request) => request.field)).toEqual([
          "input",
          "input",
        ]);
        const { events } = await processing.finalize(
          overflowRequests.map(({ index, observationId }) => ({
            index,
            reference: observationId === spanId(0) ? reference : undefined,
          })),
          false,
          [traceId],
        );
        const [uploaded, retained] = events.map(
          (event) => event.serializedEventBytes!,
        );
        expect(retained! - uploaded!).toBe(
          Buffer.byteLength(input) - Buffer.byteLength(reference),
        );
      } finally {
        await processing.dispose();
      }
    } finally {
      await batch.dispose();
    }
  });

  it("drops invalid usage entries while preserving valid rows and pricing", async () => {
    const spans = [
      { input: 7, input_cached_tokens: 2 ** 64 },
      { input: 2 ** 63, output: 2 ** 63 },
      { input: 3 },
    ].map((usageDetails, index) => ({
      traceId: "0123456789abcdef0123456789abcdef",
      spanId: `0123456789abcde${index}`,
      name: "storage-boundary",
      startTimeUnixNano: "1750000000000000000",
      endTimeUnixNano: "1750000001000000000",
      attributes: [
        {
          key: "gen_ai.request.model",
          value: { stringValue: "storage-boundary-model" },
        },
        {
          key: "langfuse.observation.usage_details",
          value: { stringValue: JSON.stringify(usageDetails) },
        },
      ],
    }));
    const validated = await validateOtelJson(
      Buffer.from(JSON.stringify([{ resource: {}, scopeSpans: [{ spans }] }])),
    );
    const batch = await validated.extract(true);
    const {
      batch: processing,
      mediaRequests,
      lookupRequests,
    } = await batch.process({
      projectId: "native-boundary",
      fileKey: "storage-boundary.json",
      now: "2026-09-24T00:00:00.000Z",
      ingestionApiKey: "",
      ingestionSdkName: "test",
      ingestionSdkVersion: "test",
      isLangfuseInternal: false,
    });
    try {
      expect(mediaRequests).toEqual([]);
      expect(lookupRequests).toHaveLength(spans.length);
      const lookup = {
        model: { id: "storage-boundary-model-id" },
        pricingTiers: [
          {
            id: "usage-tier",
            name: "usage-tier",
            isDefault: false,
            priority: 0,
            conditions: [
              {
                usageDetailPattern: "^input_cached_tokens$",
                operator: "eq",
                value: 0,
                caseSensitive: true,
              },
            ],
            prices: [
              { usageType: "input", price: "0.000000000000000001" },
              { usageType: "output", price: "0.000000000000000001" },
            ],
          },
        ],
      };
      const { finalized } = await processing.complete(
        [],
        lookupRequests.map(() => lookup),
        undefined,
        true,
      );
      expect(finalized).toBeDefined();
      expect(finalized!.events).toHaveLength(spans.length);
      const rows = new Map(
        finalized!.evaluationRows.map((row) => {
          const value = row as Record<string, unknown>;
          return [value.span_id as string, value];
        }),
      );
      expect(rows.get(spans[0].spanId)).toMatchObject({
        usage_details: { input: 7, total: 7 },
        usage_pricing_tier_name: "usage-tier",
        cost_details: {
          input: expect.closeTo(7e-18, 30),
          total: expect.closeTo(7e-18, 30),
        },
      });
      expect(rows.get(spans[0].spanId)?.usage_details).toEqual({
        input: 7,
        total: 7,
      });
      expect(rows.get(spans[1].spanId)).toMatchObject({
        usage_pricing_tier_name: "usage-tier",
        cost_details: {
          input: expect.any(Number),
          output: expect.any(Number),
          total: expect.any(Number),
        },
      });
      expect(rows.get(spans[1].spanId)?.usage_details).toEqual({
        input: 2n ** 63n,
        output: 2n ** 63n,
      });
      expect(rows.get(spans[2].spanId)).toMatchObject({
        usage_details: { input: 3, total: 3 },
        usage_pricing_tier_name: "usage-tier",
      });
    } finally {
      await processing.dispose();
      await batch.dispose();
      await validated.dispose();
    }
  });
});
