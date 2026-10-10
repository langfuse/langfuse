import { describe, expect, it } from "vitest";

import { createIngestionEventSchema } from "./types";

const scoreCreateEvent = (source?: string) => ({
  id: "evt-1",
  type: "score-create",
  timestamp: "2026-01-01T00:00:00.000Z",
  body: {
    name: "answer-correctness",
    value: 1,
    dataType: "NUMERIC",
    traceId: "trace-1",
    ...(source ? { source } : {}),
  },
});

describe("ingestion score-create source restrictions", () => {
  it("rejects source EVAL on the public ingestion schema", () => {
    const schema = createIngestionEventSchema(false);
    const result = schema.safeParse(scoreCreateEvent("EVAL"));
    expect(result.success).toBe(false);
  });

  it("accepts source API on the public ingestion schema", () => {
    const schema = createIngestionEventSchema(false);
    const result = schema.safeParse(scoreCreateEvent("API"));
    expect(result.success).toBe(true);
  });

  it("defaults an omitted source to API on the public ingestion schema", () => {
    const schema = createIngestionEventSchema(false);
    const result = schema.safeParse(scoreCreateEvent());
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as any).body.source).toBe("API");
    }
  });

  it("keeps source EVAL available on the internal ingestion schema", () => {
    const schema = createIngestionEventSchema(true);
    const result = schema.safeParse(scoreCreateEvent("EVAL"));
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as any).body.source).toBe("EVAL");
    }
  });
});
