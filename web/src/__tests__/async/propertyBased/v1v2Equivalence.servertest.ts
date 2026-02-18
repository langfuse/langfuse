import * as fc from "fast-check";
import { randomUUID } from "crypto";
import { executeQuery } from "@/src/features/query/server/queryExecutor";
import { queryArbitrary } from "../../propertyBased/arbitraries";
import { compareResults } from "../../propertyBased/comparators/resultComparator";
import {
  generateTrace,
  generateObservation,
  generateScore,
} from "../../propertyBased/dataGenerators";
import { insertTestData } from "../../propertyBased/testData/fastInsert";

/**
 * Property-Based Testing for v1/v2 View Equivalence
 *
 * Uses fc.gen() to generate test data inline as recommended by fast-check:
 * https://fast-check.dev/docs/advanced/fake-data/
 *
 * Entity IDs are pre-generated via fc.uniqueArray(fc.uuid(), ...) so that
 * fast-check maintains uniqueness through shrinking — this prevents dedup
 * discrepancies between v1/v2 ClickHouse tables whose ORDER BY keys differ.
 */
describe("v1/v2 View Equivalence", () => {
  describe("Traces View", () => {
    it("should return equivalent results for any valid traces query", async () => {
      await fc.assert(
        fc.asyncProperty(
          queryArbitrary("traces"),
          fc.gen(),
          async (query, g) => {
            const projectId = randomUUID();

            // Determine entity counts first so we can pre-allocate unique IDs
            const numTraces = g(fc.integer, { min: 1, max: 3 });
            const obsPerTrace = Array.from({ length: numTraces }, () =>
              g(fc.integer, { min: 1, max: 2 }),
            );
            const totalObs = obsPerTrace.reduce((a, b) => a + b, 0);
            const totalIds = numTraces + totalObs;

            // Generate a pool of unique UUIDs — uniqueness is preserved
            // through fast-check shrinking
            const ids: string[] = g(fc.uniqueArray, fc.uuid(), {
              minLength: totalIds,
              maxLength: totalIds,
            });
            let idx = 0;

            // Generate 1-3 traces inline using fc.gen()
            const traces = Array.from({ length: numTraces }, () =>
              generateTrace(g, ids[idx++]),
            );

            // Generate 1-2 observations per trace (min 1 to avoid v1 LEFT JOIN
            // quirk: observation-dependent measures trigger a LEFT JOIN whose
            // time filter in WHERE eliminates traces with 0 observations)
            const observations = traces.flatMap((trace, i) =>
              Array.from({ length: obsPerTrace[i] }, () =>
                generateObservation(g, ids[idx++], trace.id, trace.timestamp),
              ),
            );

            // Insert generated data
            await insertTestData(projectId, { traces, observations });

            // Execute query against both versions
            const v1Results = await executeQuery(projectId, query, "v1");
            const v2Results = await executeQuery(projectId, query, "v2");

            // Compare results
            const comparison = compareResults(v1Results, v2Results, query);
            if (!comparison.equal) {
              throw new Error(
                [
                  "\nv1/v2 results differ:",
                  ...(comparison.differences || []),
                  `\nData: ${traces.length} traces, ${observations.length} observations`,
                  `\nv1 (${v1Results.length} rows): ${JSON.stringify(v1Results)}`,
                  `\nv2 (${v2Results.length} rows): ${JSON.stringify(v2Results)}`,
                ].join("\n"),
              );
            }

            return comparison.equal;
          },
        ),
        {
          numRuns: 20,
          timeout: 30000,
          interruptAfterTimeLimit: 120000,
          verbose: false,
        },
      );
    }, 600000);
  });

  describe("Observations View", () => {
    it("should return equivalent results for any valid observations query", async () => {
      await fc.assert(
        fc.asyncProperty(
          queryArbitrary("observations"),
          fc.gen(),
          async (query, g) => {
            const projectId = randomUUID();

            const numTraces = g(fc.integer, { min: 1, max: 3 });
            const obsPerTrace = Array.from({ length: numTraces }, () =>
              g(fc.integer, { min: 0, max: 2 }),
            );
            const totalObs = obsPerTrace.reduce((a, b) => a + b, 0);
            const totalIds = numTraces + totalObs;

            const ids: string[] = g(fc.uniqueArray, fc.uuid(), {
              minLength: totalIds,
              maxLength: totalIds,
            });
            let idx = 0;

            const traces = Array.from({ length: numTraces }, () =>
              generateTrace(g, ids[idx++]),
            );

            const observations = traces.flatMap((trace, i) =>
              Array.from({ length: obsPerTrace[i] }, () =>
                generateObservation(g, ids[idx++], trace.id, trace.timestamp),
              ),
            );

            await insertTestData(projectId, { traces, observations });

            const v1Results = await executeQuery(projectId, query, "v1");
            const v2Results = await executeQuery(projectId, query, "v2");

            // v2 observations view includes trace-level events (no
            // parent_span_id segment), so use superset comparison:
            // match by dimension key, compare sum non-count metrics, and
            // verify counts precisely using trace-event offsets.
            const comparison = compareResults(v1Results, v2Results, query, {
              v2SupersetMode: true,
              traces,
            });
            if (!comparison.equal) {
              throw new Error(
                [
                  "\nv1/v2 results differ:",
                  ...(comparison.differences || []),
                  `\nData: ${traces.length} traces, ${observations.length} observations`,
                  `\nv1 (${v1Results.length} rows): ${JSON.stringify(v1Results)}`,
                  `\nv2 (${v2Results.length} rows): ${JSON.stringify(v2Results)}`,
                ].join("\n"),
              );
            }

            return comparison.equal;
          },
        ),
        {
          numRuns: 20,
          timeout: 30000,
          interruptAfterTimeLimit: 120000,
          verbose: false,
        },
      );
    }, 600000);
  });

  describe("Scores-Numeric View", () => {
    it("should return equivalent results for any valid scores-numeric query", async () => {
      await fc.assert(
        fc.asyncProperty(
          queryArbitrary("scores-numeric"),
          fc.gen(),
          async (query, g) => {
            const projectId = randomUUID();

            const numTraces = g(fc.integer, { min: 1, max: 3 });
            const obsPerTrace = Array.from({ length: numTraces }, () =>
              g(fc.integer, { min: 0, max: 2 }),
            );
            const scoresPerTrace = Array.from({ length: numTraces }, () =>
              g(fc.integer, { min: 0, max: 2 }),
            );
            const totalObs = obsPerTrace.reduce((a, b) => a + b, 0);
            const totalScores = scoresPerTrace.reduce((a, b) => a + b, 0);
            const totalIds = numTraces + totalObs + totalScores;

            const ids: string[] = g(fc.uniqueArray, fc.uuid(), {
              minLength: totalIds,
              maxLength: totalIds,
            });
            let idx = 0;

            const traces = Array.from({ length: numTraces }, () =>
              generateTrace(g, ids[idx++]),
            );

            const observations = traces.flatMap((trace, i) =>
              Array.from({ length: obsPerTrace[i] }, () =>
                generateObservation(g, ids[idx++], trace.id, trace.timestamp),
              ),
            );

            // Generate numeric scores
            const scores = traces.flatMap((trace, i) =>
              Array.from({ length: scoresPerTrace[i] }, () =>
                generateScore(g, ids[idx++], trace.id, trace.timestamp, true),
              ),
            );

            await insertTestData(projectId, { traces, observations, scores });

            const v1Results = await executeQuery(projectId, query, "v1");
            const v2Results = await executeQuery(projectId, query, "v2");

            const comparison = compareResults(v1Results, v2Results, query);
            if (!comparison.equal) {
              throw new Error(
                [
                  "\nv1/v2 results differ:",
                  ...(comparison.differences || []),
                  `\nData: ${traces.length} traces, ${observations.length} observations, ${scores.length} scores`,
                  `\nv1 (${v1Results.length} rows): ${JSON.stringify(v1Results)}`,
                  `\nv2 (${v2Results.length} rows): ${JSON.stringify(v2Results)}`,
                ].join("\n"),
              );
            }

            return comparison.equal;
          },
        ),
        {
          numRuns: 20,
          timeout: 30000,
          interruptAfterTimeLimit: 120000,
          verbose: false,
        },
      );
    }, 600000);
  });

  describe("Scores-Categorical View", () => {
    it("should return equivalent results for any valid scores-categorical query", async () => {
      await fc.assert(
        fc.asyncProperty(
          queryArbitrary("scores-categorical"),
          fc.gen(),
          async (query, g) => {
            const projectId = randomUUID();

            const numTraces = g(fc.integer, { min: 1, max: 3 });
            const obsPerTrace = Array.from({ length: numTraces }, () =>
              g(fc.integer, { min: 0, max: 2 }),
            );
            const scoresPerTrace = Array.from({ length: numTraces }, () =>
              g(fc.integer, { min: 0, max: 2 }),
            );
            const totalObs = obsPerTrace.reduce((a, b) => a + b, 0);
            const totalScores = scoresPerTrace.reduce((a, b) => a + b, 0);
            const totalIds = numTraces + totalObs + totalScores;

            const ids: string[] = g(fc.uniqueArray, fc.uuid(), {
              minLength: totalIds,
              maxLength: totalIds,
            });
            let idx = 0;

            const traces = Array.from({ length: numTraces }, () =>
              generateTrace(g, ids[idx++]),
            );

            const observations = traces.flatMap((trace, i) =>
              Array.from({ length: obsPerTrace[i] }, () =>
                generateObservation(g, ids[idx++], trace.id, trace.timestamp),
              ),
            );

            // Generate categorical scores
            const scores = traces.flatMap((trace, i) =>
              Array.from({ length: scoresPerTrace[i] }, () =>
                generateScore(g, ids[idx++], trace.id, trace.timestamp, false),
              ),
            );

            await insertTestData(projectId, { traces, observations, scores });

            const v1Results = await executeQuery(projectId, query, "v1");
            const v2Results = await executeQuery(projectId, query, "v2");

            const comparison = compareResults(v1Results, v2Results, query);
            if (!comparison.equal) {
              throw new Error(
                [
                  "\nv1/v2 results differ:",
                  ...(comparison.differences || []),
                  `\nData: ${traces.length} traces, ${observations.length} observations, ${scores.length} scores`,
                  `\nv1 (${v1Results.length} rows): ${JSON.stringify(v1Results)}`,
                  `\nv2 (${v2Results.length} rows): ${JSON.stringify(v2Results)}`,
                ].join("\n"),
              );
            }

            return comparison.equal;
          },
        ),
        {
          numRuns: 20,
          timeout: 30000,
          interruptAfterTimeLimit: 120000,
          verbose: false,
        },
      );
    }, 600000);
  });
});
