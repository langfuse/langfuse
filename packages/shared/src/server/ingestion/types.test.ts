import { describe, expect, it } from "vitest";
import {
  createIngestionEventSchema,
  LegacySpanPostSchema,
  LegacySpanPatchSchema,
  LegacyGenerationsCreateSchema,
  LegacyGenerationPatchSchema,
} from "./types";

describe("observation status ingestion", () => {
  it.each([false, true])(
    "normalizes status at the %s ingestion boundary",
    (internal) => {
      const schema = createIngestionEventSchema(internal);
      for (const type of [
        "event-create",
        "span-create",
        "span-update",
        "generation-create",
        "generation-update",
        "agent-create",
        "tool-create",
        "chain-create",
        "retriever-create",
        "evaluator-create",
        "embedding-create",
        "guardrail-create",
        "observation-create",
        "observation-update",
      ]) {
        const event = {
          id: "event-id",
          timestamp: "2026-01-01T00:00:00Z",
          type,
          body: { id: "observation-id", type: "SPAN" },
        };
        for (const [fields, expected] of [
          [{ status: "ERROR" }, "ERROR"],
          [{ level: "WARNING" }, "WARNING"],
          [{ status: "ERROR", level: "WARNING" }, "ERROR"],
          [{ status: null, level: "WARNING" }, "WARNING"],
        ] as const) {
          const result = schema.parse({
            ...event,
            body: { ...event.body, ...fields },
          });
          expect(result.body).toHaveProperty("level", expected);
        }
        expect(
          schema.safeParse({
            ...event,
            body: { ...event.body, status: "INVALID" },
          }).success,
        ).toBe(false);
      }
    },
  );

  it("supports status on legacy observation write endpoints", () => {
    for (const schema of [
      LegacySpanPostSchema,
      LegacySpanPatchSchema,
      LegacyGenerationsCreateSchema,
      LegacyGenerationPatchSchema,
    ]) {
      expect(
        schema.parse({
          spanId: "span",
          generationId: "generation",
          status: "ERROR",
          level: "DEBUG",
        }),
      ).toHaveProperty("level", "ERROR");
    }
  });
});
