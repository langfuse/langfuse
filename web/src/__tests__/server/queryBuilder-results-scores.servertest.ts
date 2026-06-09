import {
  QueryBuilder,
  executeQuery,
  createTrace,
  createObservation,
  createTracesCh,
  createObservationsCh,
  createTraceScore,
  createScoresCh,
  randomUUID,
  setupScores,
} from "./queryBuilder.fixtures";
import type { QueryType } from "./queryBuilder.fixtures";

describe("queryBuilder", () => {
  describe("query result correctness", () => {
    describe("scores-numeric view", () => {
      it("should aggregate numeric scores correctly", async () => {
        // Setup
        const projectId = randomUUID();

        // Create traces
        const traces = [
          createTrace({
            project_id: projectId,
            name: "qa-trace-1",
            environment: "production",
          }),
          createTrace({
            project_id: projectId,
            name: "qa-trace-2",
            environment: "production",
          }),
          createTrace({
            project_id: projectId,
            name: "summarization-trace",
            environment: "production",
          }),
        ];
        await createTracesCh(traces);

        // Create observations
        const observations = [
          createObservation({
            project_id: projectId,
            trace_id: traces[0].id,
            name: "qa-observation-1",
            environment: "production",
          }),
          createObservation({
            project_id: projectId,
            trace_id: traces[1].id,
            name: "qa-observation-2",
            environment: "production",
          }),
          createObservation({
            project_id: projectId,
            trace_id: traces[2].id,
            name: "summarization-observation",
            environment: "production",
          }),
        ];
        await createObservationsCh(observations);

        // Create scores
        const scores = [
          // Accuracy scores for QA traces - different values
          {
            name: "accuracy",
            traceId: traces[0].id,
            observationId: observations[0].id,
            value: 0.85,
            dataType: "NUMERIC" as const,
            source: "human",
          },
          {
            name: "accuracy",
            traceId: traces[1].id,
            observationId: observations[1].id,
            value: 0.92,
            dataType: "NUMERIC" as const,
            source: "human",
          },

          // Relevance scores for QA traces
          {
            name: "relevance",
            traceId: traces[0].id,
            observationId: observations[0].id,
            value: 0.75,
            dataType: "NUMERIC" as const,
            source: "auto",
          },
          {
            name: "relevance",
            traceId: traces[1].id,
            observationId: observations[1].id,
            value: 0.8,
            dataType: "NUMERIC" as const,
            source: "auto",
          },

          // Coherence score for summarization trace
          {
            name: "coherence",
            traceId: traces[2].id,
            observationId: observations[2].id,
            value: 0.95,
            dataType: "NUMERIC" as const,
            source: "human",
          },

          // Adding a CATEGORICAL score that should be excluded by the segments filter
          {
            name: "evaluation",
            traceId: traces[0].id,
            observationId: observations[0].id,
            stringValue: "good",
            dataType: "CATEGORICAL" as const,
            source: "human",
          },

          // Adding a TEXT (free-text) score that should also be excluded by the segments filter
          {
            name: "feedback",
            traceId: traces[0].id,
            observationId: observations[0].id,
            stringValue: "looks good to me",
            dataType: "TEXT" as const,
            source: "human",
          },

          // Adding a CORRECTION score that should also be excluded by the segments filter
          {
            name: "correction",
            traceId: traces[0].id,
            observationId: observations[0].id,
            dataType: "CORRECTION" as const,
            source: "human",
          },
        ];

        await setupScores(projectId, scores);

        // Define query for numeric scores
        const query: QueryType = {
          view: "scores-numeric",
          dimensions: [{ field: "name" }],
          metrics: [
            { measure: "count", aggregation: "count" },
            { measure: "value", aggregation: "avg" },
            { measure: "value", aggregation: "min" },
            { measure: "value", aggregation: "max" },
          ],
          filters: [],
          timeDimension: null,
          fromTimestamp: new Date(
            new Date().setDate(new Date().getDate() - 1),
          ).toISOString(),
          toTimestamp: new Date(
            new Date().setDate(new Date().getDate() + 1),
          ).toISOString(),
          orderBy: null,
        };

        const queryBuilder = new QueryBuilder();
        const { query: compiledQuery, parameters } = await queryBuilder.build(
          query,
          projectId,
        );

        // Verify SQL restricts scores-numeric to the NUMERIC/BOOLEAN allow-list
        expect(compiledQuery).toContain(
          "scores_numeric.data_type IN ({stringOptionsFilter",
        );
        expect(compiledQuery).toContain(": Array(String)})");
        expect(Object.values(parameters)).toContainEqual([
          "NUMERIC",
          "BOOLEAN",
        ]);

        // Execute query
        const result: { data: Array<any> } = { data: [] };
        result.data = await executeQuery(projectId, query);

        // Assert
        // CATEGORICAL ("evaluation"), TEXT ("feedback"), and CORRECTION ("correction")
        // scores must be excluded by the segments allow-list
        expect(result.data).toHaveLength(3); // accuracy, relevance, coherence
        expect(
          result.data.find((row: any) => row.name === "feedback"),
        ).toBeUndefined();
        expect(
          result.data.find((row: any) => row.name === "evaluation"),
        ).toBeUndefined();
        expect(
          result.data.find((row: any) => row.name === "correction"),
        ).toBeUndefined();

        // Check each score type
        const accuracyRow = result.data.find(
          (row: any) => row.name === "accuracy",
        );
        expect(Number(accuracyRow.count_count)).toBe(2);
        expect(parseFloat(accuracyRow.avg_value)).toBeCloseTo(0.885, 2); // (0.85 + 0.92) / 2
        expect(parseFloat(accuracyRow.min_value)).toBeCloseTo(0.85, 2);
        expect(parseFloat(accuracyRow.max_value)).toBeCloseTo(0.92, 2);

        const relevanceRow = result.data.find(
          (row: any) => row.name === "relevance",
        );
        expect(Number(relevanceRow.count_count)).toBe(2);
        expect(parseFloat(relevanceRow.avg_value)).toBeCloseTo(0.775, 2); // (0.75 + 0.80) / 2
        expect(parseFloat(relevanceRow.min_value)).toBeCloseTo(0.75, 2);
        expect(parseFloat(relevanceRow.max_value)).toBeCloseTo(0.8, 2);

        const coherenceRow = result.data.find(
          (row: any) => row.name === "coherence",
        );
        expect(Number(coherenceRow.count_count)).toBe(1);
        expect(parseFloat(coherenceRow.avg_value)).toBeCloseTo(0.95, 2);
      });

      it("should filter numeric scores by source", async () => {
        // Setup
        const projectId = randomUUID();

        // Create trace
        const trace = createTrace({
          project_id: projectId,
          name: "qa-trace",
          environment: "production",
        });
        await createTracesCh([trace]);

        // Create observation
        const observation = createObservation({
          project_id: projectId,
          trace_id: trace.id,
          name: "qa-observation",
          environment: "production",
        });
        await createObservationsCh([observation]);

        // Create scores with different sources
        const scores = [
          {
            name: "quality",
            traceId: trace.id,
            observationId: observation.id,
            value: 0.95,
            dataType: "NUMERIC" as const,
            source: "human",
          },
          {
            name: "quality",
            traceId: trace.id,
            observationId: observation.id,
            value: 0.88,
            dataType: "NUMERIC" as const,
            source: "auto",
          },
          {
            name: "quality",
            traceId: trace.id,
            observationId: observation.id,
            value: 0.92,
            dataType: "NUMERIC" as const,
            source: "external",
          },
        ];

        await setupScores(projectId, scores);

        // Define query with filter for human-source scores
        const query: QueryType = {
          view: "scores-numeric",
          dimensions: [{ field: "source" }],
          metrics: [
            { measure: "count", aggregation: "count" },
            { measure: "value", aggregation: "avg" },
          ],
          filters: [
            {
              column: "source",
              operator: "=",
              value: "human",
              type: "string",
            },
          ],
          timeDimension: null,
          fromTimestamp: new Date(
            new Date().setDate(new Date().getDate() - 1),
          ).toISOString(),
          toTimestamp: new Date(
            new Date().setDate(new Date().getDate() + 1),
          ).toISOString(),
          orderBy: null,
        };

        // Execute query
        const result: { data: Array<any> } = { data: [] };
        result.data = await executeQuery(projectId, query);

        // Assert - should only return human scores
        expect(result.data).toHaveLength(1);
        expect(result.data[0].source).toBe("human");
        expect(Number(result.data[0].count_count)).toBe(1);
        expect(parseFloat(result.data[0].avg_value)).toBeCloseTo(0.95, 2);
      });

      it("should join with traces and observations to get related dimensions", async () => {
        // Setup
        const projectId = randomUUID();

        // Create traces with different names
        const traces = [
          createTrace({
            project_id: projectId,
            name: "qa-trace",
            environment: "production",
            user_id: "user-1",
          }),
          createTrace({
            project_id: projectId,
            name: "summarization-trace",
            environment: "production",
            user_id: "user-2",
          }),
        ];
        await createTracesCh(traces);

        // Create observations with different model names
        const observations = [
          createObservation({
            project_id: projectId,
            trace_id: traces[0].id,
            name: "qa-observation",
            environment: "production",
            provided_model_name: "gpt-4",
          }),
          createObservation({
            project_id: projectId,
            trace_id: traces[1].id,
            name: "summarization-observation",
            environment: "production",
            provided_model_name: "claude-3",
          }),
        ];
        await createObservationsCh(observations);

        // Create numeric scores
        const scores = [
          {
            name: "accuracy",
            traceId: traces[0].id,
            observationId: observations[0].id,
            value: 0.9,
            dataType: "NUMERIC" as const,
          },
          {
            name: "relevance",
            traceId: traces[0].id,
            observationId: observations[0].id,
            value: 0.85,
            dataType: "NUMERIC" as const,
          },
          {
            name: "accuracy",
            traceId: traces[1].id,
            observationId: observations[1].id,
            value: 0.95,
            dataType: "NUMERIC" as const,
          },
        ];

        await setupScores(projectId, scores);

        // Define query to group by trace name and observation model
        const query: QueryType = {
          view: "scores-numeric",
          dimensions: [
            { field: "traceName" },
            { field: "observationModelName" },
          ],
          metrics: [
            { measure: "count", aggregation: "count" },
            { measure: "value", aggregation: "avg" },
          ],
          filters: [],
          timeDimension: null,
          fromTimestamp: new Date(
            new Date().setDate(new Date().getDate() - 1),
          ).toISOString(),
          toTimestamp: new Date(
            new Date().setDate(new Date().getDate() + 1),
          ).toISOString(),
          orderBy: null,
        };

        const queryBuilder = new QueryBuilder();
        const { query: compiledQuery } = await queryBuilder.build(
          query,
          projectId,
        );

        // Verify joins included
        expect(compiledQuery).toContain("INNER JOIN traces");
        expect(compiledQuery).toContain("INNER JOIN observations");

        // Execute query
        const result: { data: Array<any> } = { data: [] };
        result.data = await executeQuery(projectId, query);

        // Assert - should have 2 rows (1 for each trace/model combination)
        expect(result.data).toHaveLength(2);

        // Check qa trace with gpt-4
        const qaTraceRow = result.data.find(
          (row: any) =>
            row.traceName === "qa-trace" &&
            row.observationModelName === "gpt-4",
        );
        expect(Number(qaTraceRow.count_count)).toBe(2); // 2 scores (accuracy + relevance)
        expect(parseFloat(qaTraceRow.avg_value)).toBeCloseTo(0.875, 2); // (0.90 + 0.85) / 2

        // Check summarization trace with claude-3
        const summaryTraceRow = result.data.find(
          (row: any) =>
            row.traceName === "summarization-trace" &&
            row.observationModelName === "claude-3",
        );
        expect(Number(summaryTraceRow.count_count)).toBe(1); // 1 score (accuracy)
        expect(parseFloat(summaryTraceRow.avg_value)).toBeCloseTo(0.95, 2);
      });

      it("should filter boolean scores correctly", async () => {
        // Setup
        const projectId = randomUUID();

        // Create traces
        const traces = [
          createTrace({
            project_id: projectId,
            name: "trace-1",
            environment: "production",
          }),
          createTrace({
            project_id: projectId,
            name: "trace-2",
            environment: "production",
          }),
        ];
        await createTracesCh(traces);

        // Create observations
        const observations = [
          createObservation({
            project_id: projectId,
            trace_id: traces[0].id,
            name: "observation-1",
            environment: "production",
          }),
          createObservation({
            project_id: projectId,
            trace_id: traces[1].id,
            name: "observation-2",
            environment: "production",
          }),
        ];
        await createObservationsCh(observations);

        // Create boolean scores
        const scores = [
          {
            name: "is_hallucination",
            traceId: traces[0].id,
            observationId: observations[0].id,
            stringValue: "true",
            dataType: "BOOLEAN" as const,
          },
          {
            name: "is_hallucination",
            traceId: traces[1].id,
            observationId: observations[1].id,
            stringValue: "false",
            dataType: "BOOLEAN" as const,
          },
          {
            name: "is_helpful",
            traceId: traces[0].id,
            observationId: observations[0].id,
            stringValue: "false",
            dataType: "BOOLEAN" as const,
          },
          {
            name: "is_helpful",
            traceId: traces[1].id,
            observationId: observations[1].id,
            stringValue: "true",
            dataType: "BOOLEAN" as const,
          },
        ];

        await setupScores(projectId, scores);

        // Define query to filter for true Boolean scores only
        const query: QueryType = {
          view: "scores-numeric",
          dimensions: [{ field: "name" }],
          metrics: [{ measure: "count", aggregation: "count" }],
          filters: [
            {
              column: "name",
              operator: "any of",
              value: ["is_hallucination", "is_helpful"],
              type: "stringOptions",
            },
          ],
          timeDimension: null,
          fromTimestamp: new Date(
            new Date().setDate(new Date().getDate() - 1),
          ).toISOString(),
          toTimestamp: new Date(
            new Date().setDate(new Date().getDate() + 1),
          ).toISOString(),
          orderBy: null,
        };

        // Execute query
        const result: { data: Array<any> } = { data: [] };
        result.data = await executeQuery(projectId, query);

        // Assert - should only return true scores
        expect(result.data).toHaveLength(2);

        // Check which scores were true
        const isHallucination = result.data.find(
          (row: any) => row.name === "is_hallucination",
        );
        const isHelpful = result.data.find(
          (row: any) => row.name === "is_helpful",
        );

        expect(Number(isHallucination.count_count)).toBe(2);
        expect(Number(isHelpful.count_count)).toBe(2);
      });

      it("should filter scores-numeric by metadata correctly", async () => {
        // Setup
        const projectId = randomUUID();
        const traceId = randomUUID();

        // Create a trace
        const trace = await createTrace({
          id: traceId,
          name: "trace-for-scores",
          project_id: projectId,
        });
        await createTracesCh([trace]);

        // Create scores with different metadata
        const scores = [
          await createTraceScore({
            id: randomUUID(),
            trace_id: traceId,
            project_id: projectId,
            name: "score-premium",
            value: 0.95,
            metadata: { customer: "test1" },
          }),
          await createTraceScore({
            id: randomUUID(),
            trace_id: traceId,
            project_id: projectId,
            name: "score-basic",
            value: 0.75,
            metadata: { customer: "test2" },
          }),
          await createTraceScore({
            id: randomUUID(),
            trace_id: traceId,
            project_id: projectId,
            name: "score-no-metadata",
            value: 0.5,
            metadata: undefined,
          }),
        ];

        await createScoresCh(scores);

        // Define query with metadata filter for scores-numeric
        const query: QueryType = {
          view: "scores-numeric",
          dimensions: [{ field: "name" }],
          metrics: [{ measure: "value", aggregation: "avg" }],
          filters: [
            {
              column: "metadata",
              operator: "contains",
              key: "customer",
              value: "test",
              type: "stringObject",
            },
          ],
          timeDimension: null,
          fromTimestamp: new Date(
            new Date().setDate(new Date().getDate() - 1),
          ).toISOString(),
          toTimestamp: new Date(
            new Date().setDate(new Date().getDate() + 1),
          ).toISOString(),
          orderBy: null,
        };

        // Execute query
        const result: { data: Array<any> } = { data: [] };
        result.data = await executeQuery(projectId, query);

        expect(result.data).toHaveLength(2);
        expect(result.data[0].name).toBe("score-premium");
        expect(parseFloat(result.data[0].avg_value)).toBeCloseTo(0.95);
      });

      it("LFE-4838: should filter scores-numeric by scoreName (fallback handling) without errors", async () => {
        // Setup
        const projectId = randomUUID();

        // Create trace
        const trace = createTrace({
          project_id: projectId,
          name: "score-name-test-trace",
          environment: "production",
        });
        await createTracesCh([trace]);

        // Create scores with different names
        const scores = [
          {
            name: "accuracy",
            traceId: trace.id,
            value: 0.9,
            dataType: "NUMERIC" as const,
          },
          {
            name: "relevance",
            traceId: trace.id,
            value: 0.85,
            dataType: "NUMERIC" as const,
          },
        ];

        await setupScores(projectId, scores);

        // Define query with filter using "scoreName" instead of "name"
        // This tests the fallback handling in queryBuilder.ts that handles column names ending with "Name"
        const query: QueryType = {
          view: "scores-numeric",
          dimensions: [{ field: "name" }],
          metrics: [{ measure: "count", aggregation: "count" }],
          filters: [
            {
              column: "scoreName", // Using scoreName instead of name to test the fallback logic
              operator: "=",
              value: "accuracy",
              type: "string",
            },
          ],
          timeDimension: null,
          fromTimestamp: new Date(
            new Date().setDate(new Date().getDate() - 1),
          ).toISOString(),
          toTimestamp: new Date(
            new Date().setDate(new Date().getDate() + 1),
          ).toISOString(),
          orderBy: null,
        };

        const queryBuilder = new QueryBuilder();
        const { query: compiledQuery } = await queryBuilder.build(
          query,
          projectId,
        );

        // Verify the compiled query contains filtering on name
        expect(compiledQuery).toContain("scores_numeric.name");

        // Execute query
        const result: { data: Array<any> } = { data: [] };
        result.data = await executeQuery(projectId, query);

        // Assert - should only return scores with name "accuracy"
        expect(result.data).toHaveLength(1);
        expect(result.data[0].name).toBe("accuracy");
        expect(Number(result.data[0].count_count)).toBe(1);
      });
    });

    describe("scores-categorical view", () => {
      it("should group categorical scores by value correctly", async () => {
        // Setup
        const projectId = randomUUID();

        // Create trace
        const trace = createTrace({
          project_id: projectId,
          name: "trace-with-categorical-scores",
          environment: "production",
        });
        await createTracesCh([trace]);

        // Create observation
        const observation = createObservation({
          project_id: projectId,
          trace_id: trace.id,
          name: "observation",
          environment: "production",
        });
        await createObservationsCh([observation]);

        // Create categorical and boolean scores
        const scores = [
          // Categorical scores
          {
            name: "evaluation",
            traceId: trace.id,
            observationId: observation.id,
            stringValue: "excellent",
            dataType: "CATEGORICAL" as const,
            source: "human",
          },
          {
            name: "evaluation",
            traceId: trace.id,
            observationId: observation.id,
            stringValue: "good",
            dataType: "CATEGORICAL" as const,
            source: "human",
          },
          {
            name: "evaluation",
            traceId: trace.id,
            observationId: observation.id,
            stringValue: "good",
            dataType: "CATEGORICAL" as const,
            source: "human",
          },
          {
            name: "category",
            traceId: trace.id,
            observationId: observation.id,
            stringValue: "question",
            dataType: "CATEGORICAL" as const,
            source: "auto",
          },
          {
            name: "category",
            traceId: trace.id,
            observationId: observation.id,
            stringValue: "factual",
            dataType: "CATEGORICAL" as const,
            source: "auto",
          },

          // Boolean scores
          {
            name: "is_correct",
            traceId: trace.id,
            observationId: observation.id,
            stringValue: "true",
            dataType: "BOOLEAN" as const,
            source: "auto",
          },
          {
            name: "is_correct",
            traceId: trace.id,
            observationId: observation.id,
            stringValue: "false",
            dataType: "BOOLEAN" as const,
            source: "auto",
          },

          // Adding a NUMERIC score that should be excluded by the segments filter
          {
            name: "numeric_score",
            traceId: trace.id,
            observationId: observation.id,
            value: 0.95,
            dataType: "NUMERIC" as const,
            source: "human",
          },
        ];

        await setupScores(projectId, scores);

        // Define query to count by score name and string value
        const query: QueryType = {
          view: "scores-categorical",
          dimensions: [{ field: "name" }, { field: "stringValue" }],
          metrics: [{ measure: "count", aggregation: "count" }],
          filters: [],
          timeDimension: null,
          fromTimestamp: new Date(
            new Date().setDate(new Date().getDate() - 1),
          ).toISOString(),
          toTimestamp: new Date(
            new Date().setDate(new Date().getDate() + 1),
          ).toISOString(),
          orderBy: null,
        };

        const queryBuilder = new QueryBuilder();
        const { query: compiledQuery, parameters } = await queryBuilder.build(
          query,
          projectId,
        );

        // Verify SQL includes segment filter for CATEGORICAL type
        expect(compiledQuery).toContain("data_type = {");
        expect(Object.values(parameters)).toContain("CATEGORICAL");

        // Execute query
        const result: { data: Array<any> } = { data: [] };
        result.data = await executeQuery(projectId, query);

        // Assert - should have 4 rows for different name+value combinations
        expect(result.data).toHaveLength(4);

        // Check each combination
        const evaluationExcellent = result.data.find(
          (row: any) =>
            row.name === "evaluation" && row.stringValue === "excellent",
        );
        expect(Number(evaluationExcellent.count_count)).toBe(1);

        const evaluationGood = result.data.find(
          (row: any) => row.name === "evaluation" && row.stringValue === "good",
        );
        expect(Number(evaluationGood.count_count)).toBe(2);

        const categoryQuestion = result.data.find(
          (row: any) =>
            row.name === "category" && row.stringValue === "question",
        );
        expect(Number(categoryQuestion.count_count)).toBe(1);

        const categoryFactual = result.data.find(
          (row: any) =>
            row.name === "category" && row.stringValue === "factual",
        );
        expect(Number(categoryFactual.count_count)).toBe(1);
      });

      it("should filter categorical scores by source", async () => {
        // Setup
        const projectId = randomUUID();

        // Create trace
        const trace = createTrace({
          project_id: projectId,
          name: "trace",
          environment: "production",
        });
        await createTracesCh([trace]);

        // Create observation
        const observation = createObservation({
          project_id: projectId,
          trace_id: trace.id,
          name: "observation",
          environment: "production",
        });
        await createObservationsCh([observation]);

        // Create categorical scores with different sources
        const scores = [
          {
            name: "classification",
            traceId: trace.id,
            observationId: observation.id,
            stringValue: "question",
            dataType: "CATEGORICAL" as const,
            source: "human",
          },
          {
            name: "classification",
            traceId: trace.id,
            observationId: observation.id,
            stringValue: "statement",
            dataType: "CATEGORICAL" as const,
            source: "auto",
          },
          {
            name: "classification",
            traceId: trace.id,
            observationId: observation.id,
            stringValue: "command",
            dataType: "CATEGORICAL" as const,
            source: "auto",
          },
        ];

        await setupScores(projectId, scores);

        // Define query with filter for auto-source scores only
        const query: QueryType = {
          view: "scores-categorical",
          dimensions: [{ field: "stringValue" }],
          metrics: [{ measure: "count", aggregation: "count" }],
          filters: [
            {
              column: "source",
              operator: "=",
              value: "auto",
              type: "string",
            },
          ],
          timeDimension: null,
          fromTimestamp: new Date(
            new Date().setDate(new Date().getDate() - 1),
          ).toISOString(),
          toTimestamp: new Date(
            new Date().setDate(new Date().getDate() + 1),
          ).toISOString(),
          orderBy: null,
        };

        // Execute query
        const result: { data: Array<any> } = { data: [] };
        result.data = await executeQuery(projectId, query);

        // Assert - should only return auto-source scores
        expect(result.data).toHaveLength(2);
        expect(
          result.data.every((row: any) => Number(row.count_count) === 1),
        ).toBe(true);

        // Check specific values
        const stringValues = result.data
          .map((row: any) => row.stringValue)
          .sort();
        expect(stringValues).toEqual(["command", "statement"]);
      });
    });
  });
});
