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
 * This allows fast-check to shrink BOTH the query AND the test data when failures occur.
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

            // Generate 1-5 traces inline using fc.gen()
            const numTraces = g(fc.integer, { min: 1, max: 5 });
            const traces = Array.from({ length: numTraces }, () =>
              generateTrace(g),
            );

            // Generate 0-2 observations per trace
            const observations = traces.flatMap((trace) => {
              const numObs = g(fc.integer, { min: 0, max: 2 });
              return Array.from({ length: numObs }, () =>
                generateObservation(g, trace.id, trace.timestamp),
              );
            });

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
          numRuns: 50,
          timeout: 10000,
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

            const numTraces = g(fc.integer, { min: 1, max: 5 });
            const traces = Array.from({ length: numTraces }, () =>
              generateTrace(g),
            );

            const observations = traces.flatMap((trace) => {
              const numObs = g(fc.integer, { min: 0, max: 2 });
              return Array.from({ length: numObs }, () =>
                generateObservation(g, trace.id, trace.timestamp),
              );
            });

            await insertTestData(projectId, { traces, observations });

            const v1Results = await executeQuery(projectId, query, "v1");
            const v2Results = await executeQuery(projectId, query, "v2");

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
          numRuns: 50,
          timeout: 10000,
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

            const numTraces = g(fc.integer, { min: 1, max: 5 });
            const traces = Array.from({ length: numTraces }, () =>
              generateTrace(g),
            );

            const observations = traces.flatMap((trace) => {
              const numObs = g(fc.integer, { min: 0, max: 2 });
              return Array.from({ length: numObs }, () =>
                generateObservation(g, trace.id, trace.timestamp),
              );
            });

            // Generate numeric scores
            const scores = traces.flatMap((trace) => {
              const numScores = g(fc.integer, { min: 0, max: 2 });
              return Array.from({ length: numScores }, () =>
                generateScore(g, trace.id, trace.timestamp, true),
              );
            });

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
          numRuns: 50,
          timeout: 10000,
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

            const numTraces = g(fc.integer, { min: 1, max: 5 });
            const traces = Array.from({ length: numTraces }, () =>
              generateTrace(g),
            );

            const observations = traces.flatMap((trace) => {
              const numObs = g(fc.integer, { min: 0, max: 2 });
              return Array.from({ length: numObs }, () =>
                generateObservation(g, trace.id, trace.timestamp),
              );
            });

            // Generate categorical scores
            const scores = traces.flatMap((trace) => {
              const numScores = g(fc.integer, { min: 0, max: 2 });
              return Array.from({ length: numScores }, () =>
                generateScore(g, trace.id, trace.timestamp, false),
              );
            });

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
          numRuns: 50,
          timeout: 10000,
          verbose: false,
        },
      );
    }, 600000);
  });
});
