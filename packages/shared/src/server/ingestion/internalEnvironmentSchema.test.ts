import { describe, expect, it } from "vitest";

import { createIngestionEventSchema } from "./types";

const INTERNAL_ENVIRONMENT = "langfuse-llm-as-a-judge";
const TIMESTAMP = "2026-07-06T12:00:00.000Z";

const traceEvent = {
  type: "trace-create",
  id: "event-1",
  timestamp: TIMESTAMP,
  body: {
    id: "trace-1",
    timestamp: TIMESTAMP,
    environment: INTERNAL_ENVIRONMENT,
  },
};

const generationEvent = {
  type: "generation-create",
  id: "event-2",
  timestamp: TIMESTAMP,
  body: {
    id: "obs-1",
    traceId: "trace-1",
    startTime: TIMESTAMP,
    environment: INTERNAL_ENVIRONMENT,
  },
};

/**
 * Internal telemetry (LLM-as-a-judge / prompt-experiment executions published
 * through the OTel ingestion queue) must keep its reserved "langfuse-"
 * environment prefix through ingestion parsing. The public schema strips the
 * prefix, which would expose internal traces as user environments and bypass
 * the trace-upsert eval-loop guard in evalService.createEvalJobs().
 */
describe("ingestion environment schema for internal telemetry", () => {
  it("preserves langfuse-prefixed environments with the internal schema", () => {
    const schema = createIngestionEventSchema(true);

    const trace = schema.parse(traceEvent);
    expect((trace.body as { environment: string }).environment).toBe(
      INTERNAL_ENVIRONMENT,
    );

    const generation = schema.parse(generationEvent);
    expect((generation.body as { environment: string }).environment).toBe(
      INTERNAL_ENVIRONMENT,
    );
  });

  it("strips the langfuse prefix with the public schema", () => {
    const schema = createIngestionEventSchema(false);

    const trace = schema.parse(traceEvent);
    expect((trace.body as { environment: string }).environment).toBe(
      "llm-as-a-judge",
    );

    const generation = schema.parse(generationEvent);
    expect((generation.body as { environment: string }).environment).toBe(
      "llm-as-a-judge",
    );
  });
});
