import { describe, expect, it } from "vitest";
import fc from "fast-check";
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

  it("keeps sparse lookup results correlated across grouped batches", async () => {
    const attribute = (key: string, value: string) => ({
      key,
      value: { stringValue: value },
    });
    const skillsAvailable = [
      { skillName: "bar", skillVersion: 17 },
      { skillName: "baz", langfuseSkillId: "skill-baz" },
    ];
    const skillsResourceLoaded = skillsAvailable.map((skill) => ({
      ...skill,
      filePath: "guide.md",
    }));
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            model: fc.boolean(),
            prompt: fc.boolean(),
            outcome: fc.constantFrom("found", "missing", "error"),
            group: fc.integer({ min: 0, max: 3 }),
            selected: fc.boolean(),
          }),
          { maxLength: 12 },
        ),
        async (plans) => {
          const spans = plans.map((plan, index) => ({
            traceId: (plan.selected ? "a" : "b").repeat(32),
            spanId: spanId(index),
            name: `generated-${index}`.repeat(1000),
            startTimeUnixNano: "1750000000000000000",
            endTimeUnixNano: "1750000001000000000",
            attributes: [
              attribute(
                "langfuse.observation.type",
                plan.model || plan.prompt ? "generation" : "span",
              ),
              ...(plan.model
                ? [attribute("gen_ai.request.model", `model-${index}`)]
                : []),
              ...(plan.prompt
                ? [
                    attribute(
                      "langfuse.observation.prompt.name",
                      `prompt-${index}`,
                    ),
                    attribute("langfuse.observation.prompt.version", "1"),
                  ]
                : []),
            ],
          }));
          const payload = [0, 1].map((resource) => ({
            resource: {},
            scopeSpans: [0, 1].map((scope) => ({
              scope: { name: `scope-${scope}` },
              spans: spans.filter(
                (_, index) => plans[index].group === resource * 2 + scope,
              ),
            })),
          }));
          const validated = await validateOtelJson(
            Buffer.from(JSON.stringify(payload)),
          );
          const batch = await validated.extract(true);
          const {
            batch: processing,
            mediaRequests,
            lookupRequests,
          } = await batch.process(nativeContext);
          try {
            await expect(batch.copyJsonBuffer()).rejects.toMatchObject({
              code: "ERR_OTEL_CLOSED",
            });
            expect(mediaRequests).toEqual([]);
            expect(
              lookupRequests.map((request) => request.spanId).sort(),
            ).toEqual(
              plans
                .flatMap((plan, index) =>
                  plan.model || plan.prompt ? [spanId(index)] : [],
                )
                .sort(),
            );
            const results = lookupRequests.map((request) => {
              const index = spans.findIndex(
                (span) => span.spanId === request.spanId,
              );
              const plan = plans[index];
              expect(request.modelName ?? null).toBe(
                plan.model ? `model-${index}` : null,
              );
              expect(request.promptName ?? null).toBe(
                plan.prompt ? `prompt-${index}` : null,
              );
              expect(request.promptVersion ?? null).toBe(
                plan.prompt ? 1 : null,
              );
              if (plan.outcome === "error") return { error: "lookup failed" };
              return {
                skillsAvailable,
                skillsResourceLoaded,
                model:
                  plan.model && plan.outcome === "found"
                    ? { id: `model-id-${index}` }
                    : null,
                promptId:
                  plan.prompt && plan.outcome === "found"
                    ? `prompt-id-${index}`
                    : null,
              };
            });
            if (results.length > 0) {
              await expect(
                processing.complete([], results.slice(0, -1), undefined, true),
              ).rejects.toThrow("incomplete OTEL lookup results");
            }
            const { finalized } = await processing.complete(
              [],
              results,
              undefined,
              true,
              ["a".repeat(32)],
            );
            expect(finalized).toBeDefined();
            const rows = new Map(
              finalized!.evaluationRows.map((row) => {
                const value = row as Record<string, unknown>;
                return [value.span_id, value];
              }),
            );
            const events = new Map(
              finalized!.events.map((event) => [event.event.ids.id, event]),
            );
            const retained = plans.flatMap((plan, index) =>
              (plan.model || plan.prompt) && plan.outcome === "error"
                ? []
                : [index],
            );
            expect([...rows.keys()].sort()).toEqual(
              retained.map(spanId).sort(),
            );
            expect([...events.keys()].sort()).toEqual(
              retained.map(spanId).sort(),
            );
            for (const index of retained) {
              const plan = plans[index];
              const row = rows.get(spanId(index))!;
              expect(row).toMatchObject({
                model_id:
                  plan.model && plan.outcome === "found"
                    ? `model-id-${index}`
                    : null,
                prompt_id:
                  plan.prompt && plan.outcome === "found"
                    ? `prompt-id-${index}`
                    : null,
              });
              const hasLookup = plan.model || plan.prompt;
              expect(row.skills_available).toEqual(
                hasLookup ? skillsAvailable : [],
              );
              expect(row.skills_resource_loaded).toEqual(
                hasLookup ? skillsResourceLoaded : [],
              );
              const event = events.get(spanId(index))!;
              expect(event.traceId).toBe(spans[index].traceId);
              if (plan.selected)
                expect(event.serializedEventBytes).toBeGreaterThan(
                  Buffer.byteLength(spans[index].name),
                );
              else expect(event.serializedEventBytes).toBeUndefined();
            }
            await expect(
              processing.complete([], results, undefined, true),
            ).rejects.toThrow();
          } finally {
            await processing.dispose();
            await batch.dispose();
            await validated.dispose();
          }
        },
      ),
      {
        numRuns: 64,
        examples: [
          [[]],
          [
            [
              {
                model: true,
                prompt: false,
                outcome: "found",
                group: 3,
                selected: true,
              },
              {
                model: false,
                prompt: false,
                outcome: "found",
                group: 1,
                selected: false,
              },
              {
                model: false,
                prompt: true,
                outcome: "missing",
                group: 0,
                selected: true,
              },
              {
                model: true,
                prompt: true,
                outcome: "error",
                group: 2,
                selected: false,
              },
            ],
          ],
        ],
      },
    );
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
    } = await batch.process(nativeContext);
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
