import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { PreparedEvent, validateOtelJson } from "@langfuse/native";

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
  it("keeps sparse lookup results correlated across grouped batches", async () => {
    const attribute = (key: string, value: string) => ({
      key,
      value: { stringValue: value },
    });
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
              return plan.outcome === "error"
                ? { error: "lookup failed" }
                : {
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
            if (results.length) {
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
              expect(rows.get(spanId(index))).toMatchObject({
                model_id:
                  plan.model && plan.outcome === "found"
                    ? `model-id-${index}`
                    : null,
                prompt_id:
                  plan.prompt && plan.outcome === "found"
                    ? `prompt-id-${index}`
                    : null,
              });
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
    expect(
      PreparedEvent.columns().some(({ name }) => name === "event_bytes"),
    ).toBe(false);
  });

  it("rejects the entire Rust batch when an event cannot fit the storage schema", async () => {
    // A usage count of 1e30 exceeds ClickHouse's UInt64 maximum. Finalization must
    // reject the whole batch so all its observations remain eligible for retry.
    const spans = [1, 1e30].map((usage, index) => ({
      traceId: "0123456789abcdef0123456789abcdef",
      spanId: `0123456789abcde${index}`,
      name: "storage-boundary",
      startTimeUnixNano: "1750000000000000000",
      endTimeUnixNano: "1750000001000000000",
      attributes: [
        {
          key: "langfuse.observation.usage_details",
          value: { stringValue: JSON.stringify({ input: usage }) },
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
      expect(lookupRequests).toEqual([]);
      await expect(
        processing.complete([], [], undefined, true),
      ).rejects.toThrow("usage_details");
    } finally {
      await processing.dispose();
      await batch.dispose();
      await validated.dispose();
    }
  });
});
