import {
  createDatasetRunItemsCh,
  createObservationsCh,
  createScoresCh,
  getDatasetRunsTableMetricsCh,
  createDatasetRunItem,
  createManyDatasetItems,
  v4,
  prisma,
  createObservation,
  createTraceScore,
  projectId,
} from "./dataset-service.fixtures";

describe("Fetch datasets for UI presentation", () => {
  describe("Dataset Run Score Filtering", () => {
    it("should filter dataset runs by numeric scores", async () => {
      const datasetId = v4();

      await prisma.dataset.create({
        data: {
          id: datasetId,
          name: v4(),
          projectId: projectId,
        },
      });

      // Create dataset runs
      const highScoreRunId = v4();
      const lowScoreRunId = v4();
      const noScoreRunId = v4();

      await prisma.datasetRuns.create({
        data: {
          id: highScoreRunId,
          name: "high-accuracy-run",
          datasetId,
          metadata: {},
          projectId,
        },
      });

      await prisma.datasetRuns.create({
        data: {
          id: lowScoreRunId,
          name: "low-accuracy-run",
          datasetId,
          metadata: {},
          projectId,
        },
      });

      await prisma.datasetRuns.create({
        data: {
          id: noScoreRunId,
          name: "no-score-run",
          datasetId,
          metadata: {},
          projectId,
        },
      });

      // Create dataset items
      const itemId1 = v4();
      const itemId2 = v4();
      const itemId3 = v4();

      await createManyDatasetItems({
        projectId,
        items: [
          { id: itemId1, datasetId, metadata: {} },
          { id: itemId2, datasetId, metadata: {} },
          { id: itemId3, datasetId, metadata: {} },
        ],
      });

      // Create traces and observations
      const traceId1 = v4();
      const traceId2 = v4();
      const traceId3 = v4();

      // Create dataset run items
      const runItem1 = createDatasetRunItem({
        id: v4(),
        dataset_run_id: highScoreRunId,
        trace_id: traceId1,
        project_id: projectId,
        dataset_item_id: itemId1,
        dataset_id: datasetId,
        dataset_run_name: "high-accuracy-run",
      });

      const runItem2 = createDatasetRunItem({
        id: v4(),
        dataset_run_id: lowScoreRunId,
        trace_id: traceId2,
        project_id: projectId,
        dataset_item_id: itemId2,
        dataset_id: datasetId,
        dataset_run_name: "low-accuracy-run",
      });

      const runItem3 = createDatasetRunItem({
        id: v4(),
        dataset_run_id: noScoreRunId,
        trace_id: traceId3,
        project_id: projectId,
        dataset_item_id: itemId3,
        dataset_id: datasetId,
        dataset_run_name: "no-score-run",
      });

      await createDatasetRunItemsCh([runItem1, runItem2, runItem3]);

      // Create observations for latency calculation
      const observation1 = createObservation({
        trace_id: traceId1,
        project_id: projectId,
        start_time: new Date().getTime() - 2000,
        end_time: new Date().getTime() - 1000,
      });

      const observation2 = createObservation({
        trace_id: traceId2,
        project_id: projectId,
        start_time: new Date().getTime() - 3000,
        end_time: new Date().getTime() - 1000,
      });

      const observation3 = createObservation({
        trace_id: traceId3,
        project_id: projectId,
        start_time: new Date().getTime() - 1000,
        end_time: new Date().getTime(),
      });

      await createObservationsCh([observation1, observation2, observation3]);

      // Create scores with different values for the same score name
      const highAccuracyScore = createTraceScore({
        id: v4(),
        trace_id: traceId1,
        project_id: projectId,
        name: "accuracy",
        value: 0.95, // High accuracy
      });

      const lowAccuracyScore = createTraceScore({
        id: v4(),
        trace_id: traceId2,
        project_id: projectId,
        name: "accuracy",
        value: 0.65, // Low accuracy
      });

      const highPrecisionScore = createTraceScore({
        id: v4(),
        trace_id: traceId1,
        project_id: projectId,
        name: "precision",
        value: 0.88,
      });

      // No scores for traceId3 to test filtering behavior

      await createScoresCh([
        highAccuracyScore,
        lowAccuracyScore,
        highPrecisionScore,
      ]);

      // Test 1: Filter for runs with accuracy > 0.8
      const highAccuracyRuns = await getDatasetRunsTableMetricsCh({
        projectId: projectId,
        datasetId: datasetId,
        runIds: [highScoreRunId, lowScoreRunId, noScoreRunId],
        filter: [
          {
            type: "numberObject" as const,
            column: "agg_scores_avg",
            key: "accuracy",
            operator: ">" as const,
            value: 0.8,
          },
        ],
      });

      expect(highAccuracyRuns).toHaveLength(1);
      expect(highAccuracyRuns[0].id).toEqual(highScoreRunId);
      expect(highAccuracyRuns[0].name).toEqual("high-accuracy-run");

      // Test 2: Filter for runs with accuracy >= 0.65 (should include both)
      const mediumAccuracyRuns = await getDatasetRunsTableMetricsCh({
        projectId: projectId,
        datasetId: datasetId,
        runIds: [highScoreRunId, lowScoreRunId, noScoreRunId],
        filter: [
          {
            type: "numberObject" as const,
            column: "agg_scores_avg",
            key: "accuracy",
            operator: ">=" as const,
            value: 0.65,
          },
        ],
      });

      expect(mediumAccuracyRuns).toHaveLength(2);
      const runIds = mediumAccuracyRuns.map((run) => run.id);
      expect(runIds).toContain(highScoreRunId);
      expect(runIds).toContain(lowScoreRunId);

      // Test 3: Filter for runs with precision = 0.88
      const precisionRuns = await getDatasetRunsTableMetricsCh({
        projectId: projectId,
        datasetId: datasetId,
        runIds: [highScoreRunId, lowScoreRunId, noScoreRunId],
        filter: [
          {
            type: "numberObject" as const,
            column: "agg_scores_avg",
            key: "precision",
            operator: "=" as const,
            value: 0.88,
          },
        ],
      });

      expect(precisionRuns).toHaveLength(1);
      expect(precisionRuns[0].id).toEqual(highScoreRunId);
    });

    it("should filter dataset runs by categorical scores", async () => {
      const datasetId = v4();

      await prisma.dataset.create({
        data: {
          id: datasetId,
          name: v4(),
          projectId: projectId,
        },
      });

      // Create dataset runs
      const excellentRunId = v4();
      const goodRunId = v4();
      const poorRunId = v4();

      await prisma.datasetRuns.createMany({
        data: [
          {
            id: excellentRunId,
            name: "excellent-quality-run",
            datasetId,
            metadata: {},
            projectId,
          },
          {
            id: goodRunId,
            name: "good-quality-run",
            datasetId,
            metadata: {},
            projectId,
          },
          {
            id: poorRunId,
            name: "poor-quality-run",
            datasetId,
            metadata: {},
            projectId,
          },
        ],
      });

      // Create dataset items and traces
      const itemIds = [v4(), v4(), v4()];
      const traceIds = [v4(), v4(), v4()];

      await createManyDatasetItems({
        projectId,
        items: itemIds.map((id) => ({
          id,
          datasetId,
          metadata: {},
        })),
      });

      // Create dataset run items
      const runItems = [
        createDatasetRunItem({
          id: v4(),
          dataset_run_id: excellentRunId,
          trace_id: traceIds[0],
          project_id: projectId,
          dataset_item_id: itemIds[0],
          dataset_id: datasetId,
          dataset_run_name: "excellent-quality-run",
        }),
        createDatasetRunItem({
          id: v4(),
          dataset_run_id: goodRunId,
          trace_id: traceIds[1],
          project_id: projectId,
          dataset_item_id: itemIds[1],
          dataset_id: datasetId,
          dataset_run_name: "good-quality-run",
        }),
        createDatasetRunItem({
          id: v4(),
          dataset_run_id: poorRunId,
          trace_id: traceIds[2],
          project_id: projectId,
          dataset_item_id: itemIds[2],
          dataset_id: datasetId,
          dataset_run_name: "poor-quality-run",
        }),
      ];

      await createDatasetRunItemsCh(runItems);

      // Create observations for each trace
      const observations = traceIds.map((traceId) =>
        createObservation({
          trace_id: traceId,
          project_id: projectId,
          start_time: new Date().getTime() - 1000,
          end_time: new Date().getTime(),
        }),
      );

      await createObservationsCh(observations);

      // Create categorical scores
      const qualityScores = [
        createTraceScore({
          id: v4(),
          trace_id: traceIds[0],
          project_id: projectId,
          name: "quality",
          data_type: "CATEGORICAL",
          string_value: "excellent",
        }),
        createTraceScore({
          id: v4(),
          trace_id: traceIds[1],
          project_id: projectId,
          name: "quality",
          data_type: "CATEGORICAL",
          string_value: "good",
        }),
        createTraceScore({
          id: v4(),
          trace_id: traceIds[2],
          project_id: projectId,
          name: "quality",
          data_type: "CATEGORICAL",
          string_value: "poor",
        }),
      ];

      // Add sentiment scores for more complex filtering
      const sentimentScores = [
        createTraceScore({
          id: v4(),
          trace_id: traceIds[0],
          project_id: projectId,
          name: "sentiment",
          data_type: "CATEGORICAL",
          string_value: "positive",
        }),
        createTraceScore({
          id: v4(),
          trace_id: traceIds[1],
          project_id: projectId,
          name: "sentiment",
          data_type: "CATEGORICAL",
          string_value: "neutral",
        }),
        createTraceScore({
          id: v4(),
          trace_id: traceIds[2],
          project_id: projectId,
          name: "sentiment",
          data_type: "CATEGORICAL",
          string_value: "negative",
        }),
      ];

      await createScoresCh([...qualityScores, ...sentimentScores]);

      // Test: Filter for high quality runs (excellent or good)
      const highQualityRuns = await getDatasetRunsTableMetricsCh({
        projectId: projectId,
        datasetId: datasetId,
        runIds: [excellentRunId, goodRunId, poorRunId],
        filter: [
          {
            type: "categoryOptions" as const,
            column: "agg_score_categories",
            key: "quality",
            operator: "any of" as const,
            value: ["excellent", "good"],
          },
        ],
      });

      expect(highQualityRuns).toHaveLength(2);
      const highQualityIds = highQualityRuns.map((run) => run.id);
      expect(highQualityIds).toContain(excellentRunId);
      expect(highQualityIds).toContain(goodRunId);

      // Test: Filter for runs that are NOT poor quality
      const notPoorRuns = await getDatasetRunsTableMetricsCh({
        projectId: projectId,
        datasetId: datasetId,
        runIds: [excellentRunId, goodRunId, poorRunId],
        filter: [
          {
            type: "categoryOptions" as const,
            column: "agg_score_categories",
            key: "quality",
            operator: "none of" as const,
            value: ["poor"],
          },
        ],
      });

      expect(notPoorRuns).toHaveLength(2);
      const notPoorIds = notPoorRuns.map((run) => run.id);
      expect(notPoorIds).toContain(excellentRunId);
      expect(notPoorIds).toContain(goodRunId);

      // Test: Filter for positive sentiment
      const positiveSentimentRuns = await getDatasetRunsTableMetricsCh({
        projectId: projectId,
        datasetId: datasetId,
        runIds: [excellentRunId, goodRunId, poorRunId],
        filter: [
          {
            type: "categoryOptions" as const,
            column: "agg_score_categories",
            key: "sentiment",
            operator: "any of" as const,
            value: ["positive"],
          },
        ],
      });

      expect(positiveSentimentRuns).toHaveLength(1);
      expect(positiveSentimentRuns[0].id).toEqual(excellentRunId);
    });

    it("should combine score filters with other filters", async () => {
      const datasetId = v4();

      await prisma.dataset.create({
        data: {
          id: datasetId,
          name: v4(),
          projectId: projectId,
        },
      });

      // Create dataset runs with specific names and times
      const recentRunId = v4();
      const oldRunId = v4();

      const recentDate = new Date();
      const oldDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago

      await prisma.datasetRuns.create({
        data: {
          id: recentRunId,
          name: "recent-high-accuracy",
          datasetId,
          metadata: { version: "2.0" },
          projectId,
          createdAt: recentDate,
        },
      });

      await prisma.datasetRuns.create({
        data: {
          id: oldRunId,
          name: "old-high-accuracy",
          datasetId,
          metadata: { version: "1.0" },
          projectId,
          createdAt: oldDate,
        },
      });

      // Create dataset items and traces
      const itemIds = [v4(), v4()];
      const traceIds = [v4(), v4()];

      await createManyDatasetItems({
        projectId,
        items: itemIds.map((id) => ({
          id,
          datasetId,
          metadata: {},
        })),
      });

      // Create dataset run items
      const runItems = [
        createDatasetRunItem({
          id: v4(),
          dataset_run_id: recentRunId,
          trace_id: traceIds[0],
          project_id: projectId,
          dataset_item_id: itemIds[0],
          dataset_id: datasetId,
          dataset_run_name: "recent-high-accuracy",
          created_at: recentDate.getTime(),
        }),
        createDatasetRunItem({
          id: v4(),
          dataset_run_id: oldRunId,
          trace_id: traceIds[1],
          project_id: projectId,
          dataset_item_id: itemIds[1],
          dataset_id: datasetId,
          dataset_run_name: "old-high-accuracy",
          created_at: oldDate.getTime(),
        }),
      ];

      await createDatasetRunItemsCh(runItems);

      // Create observations with different costs
      const observations = [
        createObservation({
          trace_id: traceIds[0],
          project_id: projectId,
          start_time: new Date().getTime() - 1000,
          end_time: new Date().getTime(),
          total_cost: 100, // Higher cost
        }),
        createObservation({
          trace_id: traceIds[1],
          project_id: projectId,
          start_time: new Date().getTime() - 1000,
          end_time: new Date().getTime(),
          total_cost: 50, // Lower cost
        }),
      ];

      await createObservationsCh(observations);

      // Create high accuracy scores for both runs
      const scores = [
        createTraceScore({
          id: v4(),
          trace_id: traceIds[0],
          project_id: projectId,
          name: "accuracy",
          value: 0.92,
        }),
        createTraceScore({
          id: v4(),
          trace_id: traceIds[1],
          project_id: projectId,
          name: "accuracy",
          value: 0.94,
        }),
        createTraceScore({
          id: v4(),
          trace_id: traceIds[0],
          project_id: projectId,
          name: "sentiment",
          data_type: "CATEGORICAL",
          string_value: "positive",
        }),
      ];

      await createScoresCh(scores);

      // Test: Combine numeric score filter with category filter
      const recentHighAccuracyRuns = await getDatasetRunsTableMetricsCh({
        projectId: projectId,
        datasetId: datasetId,
        runIds: [recentRunId, oldRunId],
        filter: [
          {
            type: "numberObject" as const,
            column: "agg_scores_avg",
            key: "accuracy",
            operator: ">=" as const,
            value: 0.9,
          },
          {
            type: "categoryOptions" as const,
            column: "agg_score_categories",
            key: "sentiment",
            operator: "any of" as const,
            value: ["positive"],
          },
        ],
      });

      expect(recentHighAccuracyRuns).toHaveLength(1);
      expect(recentHighAccuracyRuns[0].id).toEqual(recentRunId);
      expect(recentHighAccuracyRuns[0].name).toEqual("recent-high-accuracy");

      // Test: All high accuracy runs (should return both)
      const allHighAccuracyRuns = await getDatasetRunsTableMetricsCh({
        projectId: projectId,
        datasetId: datasetId,
        runIds: [recentRunId, oldRunId],
        filter: [
          {
            type: "numberObject" as const,
            column: "agg_scores_avg",
            key: "accuracy",
            operator: ">=" as const,
            value: 0.9,
          },
        ],
      });

      expect(allHighAccuracyRuns).toHaveLength(2);
      const allIds = allHighAccuracyRuns.map((run) => run.id);
      expect(allIds).toContain(recentRunId);
      expect(allIds).toContain(oldRunId);
    });
  });
});
