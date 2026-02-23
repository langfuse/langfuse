import * as fc from "fast-check";

/**
 * Data generation helpers for property-based testing using fc.gen()
 * Following fast-check best practices: https://fast-check.dev/docs/advanced/fake-data/
 *
 * All entity IDs are accepted as parameters rather than generated internally.
 * This allows callers to use fc.uniqueArray(fc.uuid(), ...) to guarantee
 * uniqueness across entities — fast-check maintains the uniqueness invariant
 * through shrinking, preventing dedup discrepancies between v1/v2 tables
 * whose ORDER BY keys differ.
 *
 * Usage:
 *   fc.asyncProperty(queryArbitrary("traces"), fc.gen(), async (query, g) => {
 *     const ids = g(fc.uniqueArray, fc.uuid(), { minLength: 3, maxLength: 3 });
 *     const trace = generateTrace(g, ids[0]);
 *     const obs = generateObservation(g, ids[1], trace.id, trace.timestamp);
 *     // ...
 *   })
 */

/**
 * Generate a trace using fc.gen()
 */
export const generateTrace = (g: any, id: string) => {
  const traceNames = [
    "chat-completion",
    "text-generation",
    "embedding",
    "qa",
  ] as const;
  const environments = ["production", "staging", "development"] as const;

  const timestamp = g(fc.date, {
    min: new Date("2024-01-01T00:00:00.000Z"),
    max: new Date("2025-12-31T00:00:00.000Z"),
  });

  const tagPool = ["alpha", "beta", "gamma", "delta", "epsilon"] as const;
  const numTags = g(fc.integer, { min: 0, max: 3 });
  const tags = Array.from({ length: numTags }, () =>
    g(fc.constantFrom, ...tagPool),
  );

  return {
    id,
    name: g(fc.constantFrom, ...traceNames),
    environment: g(fc.constantFrom, ...environments),
    userId: g(fc.string, { minLength: 5, maxLength: 20 }),
    sessionId: g(fc.string, { minLength: 5, maxLength: 20 }),
    release: g(fc.string, { minLength: 2, maxLength: 10 }),
    version: g(fc.string, { minLength: 1, maxLength: 10 }),
    tags,
    timestamp: timestamp.getTime(),
  };
};

/**
 * Generate an observation using fc.gen()
 */
export const generateObservation = (
  g: any,
  id: string,
  traceId: string,
  traceTimestamp: number,
) => {
  const types = ["SPAN", "GENERATION", "EVENT"] as const;
  const modelNames = ["gpt-3", "gpt-4", "claude-3"] as const;

  const versions = ["1.0", "2.0", "3.0", "0.1.0", "latest"] as const;

  const startTimeOffset = g(fc.integer, { min: 0, max: 10000 });
  const duration = g(fc.integer, { min: 100, max: 5000 });
  const inputTokens = g(fc.integer, { min: 100, max: 10000 });
  const outputTokens = g(fc.integer, { min: 50, max: 5000 });
  const totalCost = g(fc.double, { min: 0.0001, max: 1, noNaN: true });

  return {
    id,
    traceId,
    type: g(fc.constantFrom, ...types),
    name: g(fc.string, { minLength: 1, maxLength: 50 }),
    version: g(fc.constantFrom, ...versions),
    providedModelName: g(fc.constantFrom, ...modelNames),
    startTime: traceTimestamp + startTimeOffset,
    endTime: traceTimestamp + startTimeOffset + duration,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    totalCost,
  };
};

/**
 * Generate a score using fc.gen()
 */
export const generateScore = (
  g: any,
  id: string,
  traceId: string,
  traceTimestamp: number,
  isNumeric: boolean,
  observationId: string | null = null,
) => {
  const scoreNames = ["accuracy", "quality", "relevance"] as const;
  const sources = ["API", "ANNOTATION", "EVAL"] as const;
  const categoricalValues = ["good", "bad", "excellent"] as const;

  const timestampOffset = g(fc.integer, { min: 0, max: 100000 });

  return {
    id,
    traceId,
    observationId,
    name: g(fc.constantFrom, ...scoreNames),
    source: g(fc.constantFrom, ...sources),
    dataType: isNumeric ? ("NUMERIC" as const) : ("CATEGORICAL" as const),
    value: isNumeric ? g(fc.double, { min: 0, max: 1, noNaN: true }) : 0,
    stringValue: !isNumeric ? g(fc.constantFrom, ...categoricalValues) : "",
    timestamp: traceTimestamp + timestampOffset,
  };
};
