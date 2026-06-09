import {
  createDatasetRunItemsCh,
  createObservationsCh,
  createScoresCh,
  createTracesCh,
  getDatasetRunItemsWithoutIOByItemIds,
  createDatasetRunItem,
  getDatasetItemIdsWithRunData,
  createManyDatasetItems,
  v4,
  prisma,
  createObservation,
  createTraceScore,
  createTrace,
  enrichAndMapToDatasetItemId,
  composeAggregateScoreKey,
  projectId,
} from "./dataset-service.fixtures";

describe("Fetch datasets for UI presentation", () => {
  describe("Dataset Run Item Compare Data", () => {
    describe("Compare data with filters", () => {
      let datasetId: string;
      let run1Id: string;
      let run2Id: string;
      let run3Id: string;
      let itemIds: string[];
      let run1TraceIds: string[];
      let run2TraceIds: string[];
      let run3TraceIds: string[];

      const accuracyKey = composeAggregateScoreKey({
        name: "accuracy",
        source: "API",
        dataType: "NUMERIC",
      });
      const relevanceKey = composeAggregateScoreKey({
        name: "relevance",
        source: "API",
        dataType: "NUMERIC",
      });

      beforeEach(async () => {
        datasetId = v4();
        run1Id = v4();
        run2Id = v4();
        run3Id = v4();
        itemIds = [v4(), v4(), v4(), v4(), v4()];
        run1TraceIds = [v4(), v4(), v4(), v4(), v4()];
        run2TraceIds = [v4(), v4(), v4(), v4(), v4()];
        run3TraceIds = [v4(), v4(), v4(), v4(), v4()];

        // Create dataset
        await prisma.dataset.create({
          data: {
            id: datasetId,
            name: `filtered-compare-test-dataset-${datasetId}`,
            projectId: projectId,
          },
        });

        // Create dataset runs
        await prisma.datasetRuns.createMany({
          data: [
            {
              id: run1Id,
              name: "high-accuracy-run",
              datasetId,
              metadata: { model: "gpt-4" },
              projectId,
              createdAt: new Date("2024-01-01T00:00:00Z"),
            },
            {
              id: run2Id,
              name: "mixed-performance-run",
              datasetId,
              metadata: { model: "gpt-3.5" },
              projectId,
              createdAt: new Date("2024-01-02T00:00:00Z"),
            },
            {
              id: run3Id,
              name: "quality-focused-run",
              datasetId,
              metadata: { model: "claude" },
              projectId,
              createdAt: new Date("2024-01-03T00:00:00Z"),
            },
          ],
        });

        // Create dataset items
        await createManyDatasetItems({
          projectId,
          items: itemIds.map((id, index) => ({
            id,
            datasetId,
            input: { prompt: `Test prompt ${index + 1}` },
            expectedOutput: { response: `Expected response ${index + 1}` },
            metadata: { category: `category-${index % 3}` },
          })),
        });

        // Create traces
        const traces = [...run1TraceIds, ...run2TraceIds, ...run3TraceIds].map(
          (traceId, index) =>
            createTrace({
              id: traceId,
              project_id: projectId,
              name: `filtered-trace-${index + 1}`,
              timestamp: new Date().getTime() - (5 - index) * 1000,
            }),
        );
        await createTracesCh(traces);

        // Create observations for latency calculations
        const observations = [
          ...run1TraceIds,
          ...run2TraceIds,
          ...run3TraceIds,
        ].map((traceId, index) =>
          createObservation({
            trace_id: traceId,
            project_id: projectId,
            type: "GENERATION",
            start_time: new Date().getTime() - (index + 1) * 2000,
            end_time: new Date().getTime() - (index + 1) * 1000,
            total_cost: (index + 1) * 10,
          }),
        );
        await createObservationsCh(observations);

        // Create dataset run items - ALL runs have ALL 5 items
        const runItems = [
          // Run 1: All 5 items (high accuracy run)
          ...itemIds.map((itemId, index) =>
            createDatasetRunItem({
              id: v4(),
              dataset_run_id: run1Id,
              dataset_item_id: itemId,
              trace_id: run1TraceIds[index],
              observation_id: null,
              project_id: projectId,
              dataset_id: datasetId,
              dataset_run_name: "high-accuracy-run",
            }),
          ),
          // Run 2: All 5 items (mixed performance)
          ...itemIds.map((itemId, index) =>
            createDatasetRunItem({
              id: v4(),
              dataset_run_id: run2Id,
              dataset_item_id: itemId,
              trace_id: run2TraceIds[index],
              observation_id: null,
              project_id: projectId,
              dataset_id: datasetId,
              dataset_run_name: "mixed-performance-run",
            }),
          ),
          // Run 3: All 5 items (quality focused)
          ...itemIds.map((itemId, index) =>
            createDatasetRunItem({
              id: v4(),
              dataset_run_id: run3Id,
              dataset_item_id: itemId,
              trace_id: run3TraceIds[index],
              observation_id: null,
              project_id: projectId,
              dataset_id: datasetId,
              dataset_run_name: "quality-focused-run",
            }),
          ),
        ];

        await createDatasetRunItemsCh(runItems);

        // Create scores with different patterns for filtering
        const scores: any[] = [];
        const runs = [
          { id: run1Id, traceIds: run1TraceIds },
          { id: run2Id, traceIds: run2TraceIds },
          { id: run3Id, traceIds: run3TraceIds },
        ];

        runs.forEach((run, runIndex) => {
          const traceSubset = run.traceIds; // Use all 5 traces for each run

          // Add accuracy scores for each run with different base values
          const accuracyBase = 0.6 + runIndex * 0.15; // 0.6, 0.75, 0.9
          traceSubset.forEach((traceId, traceIndex) => {
            scores.push(
              createTraceScore({
                id: v4(),
                trace_id: traceId,
                project_id: projectId,
                name: "accuracy",
                value: accuracyBase + traceIndex * 0.05, // Incremental within run
                source: "API",
              }),
            );
          });

          // Add secondary numeric scores with variation per run
          const secondaryScores = ["relevance", "precision", "fluency"];
          const secondaryBase = 0.5 + runIndex * 0.1; // 0.5, 0.6, 0.7
          traceSubset.forEach((traceId, traceIndex) => {
            scores.push(
              createTraceScore({
                id: v4(),
                trace_id: traceId,
                project_id: projectId,
                name: secondaryScores[runIndex],
                value: secondaryBase + traceIndex * 0.08,
                source: "API",
              }),
            );
          });

          // Add categorical scores with different categories per run
          const categoricalConfigs = [
            {
              name: "quality",
              values: ["excellent", "good", "average", "good", "excellent"],
            },
            {
              name: "sentiment",
              values: [
                "positive",
                "neutral",
                "negative",
                "positive",
                "neutral",
              ],
            },
            {
              name: "language",
              values: ["formal", "casual", "technical", "formal", "casual"],
            },
          ];

          traceSubset.forEach((traceId, traceIndex) => {
            scores.push(
              createTraceScore({
                id: v4(),
                trace_id: traceId,
                project_id: projectId,
                name: categoricalConfigs[runIndex].name,
                data_type: "CATEGORICAL",
                string_value: categoricalConfigs[runIndex].values[traceIndex],
                source: "API",
              }),
            );
          });
        });
        await createScoresCh(scores);
      });

      it("should return intersection of items across runs with different filters (intersection complexity)", async () => {
        // Test case 1: Filter run1 for high accuracy items, filter run2 for specific items
        // Should only return items that exist in both runs AND meet both filter criteria
        // Step 1: Return dataset item ids for which the run items match the filters
        const datasetItemIds = await getDatasetItemIdsWithRunData({
          projectId: projectId,
          datasetId: datasetId,
          runIds: [run1Id, run2Id],
          filterByRun: [
            {
              runId: run1Id,
              filters: [
                {
                  type: "numberObject" as const,
                  column: "agg_scores_avg",
                  key: "accuracy",
                  operator: ">=" as const,
                  value: 0.65,
                },
              ],
            },
            {
              runId: run2Id,
              filters: [
                {
                  type: "numberObject" as const,
                  column: "agg_scores_avg",
                  key: "accuracy",
                  operator: ">=" as const,
                  value: 0.8,
                },
              ],
            },
          ],
          limit: 100,
          offset: 0,
        });

        // Step 2: Given dataset item ids, lookup dataset run items in clickhouse
        // Note: for each unique dataset item id and dataset run id combination, we will retrieve a dataset run item
        const datasetRunItems = await getDatasetRunItemsWithoutIOByItemIds({
          projectId: projectId,
          datasetId: datasetId,
          runIds: [run1Id, run2Id],
          datasetItemIds: datasetItemIds,
        });

        const result = await enrichAndMapToDatasetItemId(
          projectId,
          datasetRunItems,
        );

        // Run1 has items 0,1,2,3,4 with accuracy 0.6,0.65,0.7,0.75,0.8 - filter >= 0.65 includes items 1,2,3,4
        // Run2 has items 0,1,2,3,4 with accuracy 0.75,0.8,0.85,0.9,0.95 - filter >= 0.8 includes items 1,2,3,4
        // Intersection: items that exist in BOTH runs AND meet BOTH criteria = items 1,2,3,4
        expect(Array.from(result.keys())).toHaveLength(4);
        expect(Array.from(result.keys())).toEqual(
          expect.arrayContaining([
            itemIds[1],
            itemIds[2],
            itemIds[3],
            itemIds[4],
          ]),
        );

        // Verify each item has data from both runs
        result.forEach((runData) => {
          expect(Object.keys(runData)).toHaveLength(2);
          expect(Object.keys(runData)).toEqual(
            expect.arrayContaining([run1Id, run2Id]),
          );
        });

        // Verify accuracy values meet filter criteria
        const item1Run1 = result.get(itemIds[1])?.[run1Id];
        const item1Run2 = result.get(itemIds[1])?.[run2Id];
        expect(
          (item1Run1?.scores?.[accuracyKey] as any)?.average,
        ).toBeGreaterThanOrEqual(0.65);
        expect(
          (item1Run2?.scores?.[accuracyKey] as any)?.average,
        ).toBeGreaterThanOrEqual(0.8);
      });

      it("should return empty result when intersection is empty (no items meet all run filter criteria)", async () => {
        // Test case: Apply very strict filters that have no intersection
        const datasetItemIds = await getDatasetItemIdsWithRunData({
          projectId,
          datasetId,
          limit: 100,
          offset: 0,
          runIds: [run1Id, run2Id, run3Id],
          filterByRun: [
            {
              runId: run1Id,
              filters: [
                {
                  type: "numberObject" as const,
                  column: "agg_scores_avg",
                  key: "accuracy",
                  operator: ">=" as const,
                  value: 0.8, // Only item 4 in run1
                },
              ],
            },
            {
              runId: run2Id,
              filters: [
                {
                  type: "numberObject" as const,
                  column: "agg_scores_avg",
                  key: "accuracy",
                  operator: ">=" as const,
                  value: 0.85, // Items 2,3 in run2
                },
              ],
            },
            {
              runId: run3Id,
              filters: [
                {
                  type: "categoryOptions" as const,
                  column: "agg_score_categories",
                  key: "language",
                  operator: "any of" as const,
                  value: ["technical"], // Only item 2 in run3
                },
              ],
            },
          ],
        });

        // Step 2: Given dataset item ids, lookup dataset run items in clickhouse
        // Note: for each unique dataset item id and dataset run id combination, we will retrieve a dataset run item
        const datasetRunItems = await getDatasetRunItemsWithoutIOByItemIds({
          projectId: projectId,
          datasetId: datasetId,
          runIds: [run1Id, run2Id, run3Id],
          datasetItemIds,
        });

        const result = await enrichAndMapToDatasetItemId(
          projectId,
          datasetRunItems,
        );

        // Run1 accuracy >= 0.8: only item 4 (accuracy 0.8)
        // Run2 accuracy >= 0.85: items 2,3,4 (accuracy 0.85, 0.9, 0.95)
        // Run3 language = "technical": only item 2 (language "technical")
        // Intersection: no item meets ALL three criteria
        expect(result).toEqual(new Map());
      });

      it("should handle intersection with mixed filter types across runs", async () => {
        // Test case: Combine numeric, categorical, and empty filters across multiple runs
        const datasetItemIds = await getDatasetItemIdsWithRunData({
          projectId,
          datasetId,
          limit: 100,
          offset: 0,
          runIds: [run1Id, run2Id, run3Id],
          filterByRun: [
            {
              runId: run1Id,
              filters: [
                {
                  type: "numberObject" as const,
                  column: "agg_scores_avg",
                  key: "accuracy",
                  operator: ">=" as const,
                  value: 0.65, // Items 1,2,3,4 meet this
                },
              ],
            },
            {
              runId: run2Id,
              filters: [], // No filters - all items in run2 qualify (items 0,1,2,3)
            },
            {
              runId: run3Id,
              filters: [
                {
                  type: "categoryOptions" as const,
                  column: "agg_score_categories",
                  key: "language",
                  operator: "none of" as const,
                  value: ["technical"], // Exclude item 2, so items 0,1 qualify
                },
              ],
            },
          ],
        });

        // Step 2: Given dataset item ids, lookup dataset run items in clickhouse
        // Note: for each unique dataset item id and dataset run id combination, we will retrieve a dataset run item
        const datasetRunItems = await getDatasetRunItemsWithoutIOByItemIds({
          projectId: projectId,
          datasetId: datasetId,
          runIds: [run1Id, run2Id, run3Id],
          datasetItemIds,
        });

        const result = await enrichAndMapToDatasetItemId(
          projectId,
          datasetRunItems,
        );

        // Intersection analysis:
        // Run1 qualifies: items 1,2,3,4 (accuracy >= 0.65: 0.65, 0.7, 0.75, 0.8)
        // Run2 qualifies: items 0,1,2,3,4 (no filter - all items)
        // Run3 qualifies: items 0,1,3,4 (language != "technical": excludes item 2 which is "technical")
        // Intersection: items 1,3,4 (items that exist in ALL runs AND meet ALL criteria)
        expect(Array.from(result.keys())).toHaveLength(3);
        expect(Array.from(result.keys())).toEqual(
          expect.arrayContaining([itemIds[1], itemIds[3], itemIds[4]]),
        );

        // Verify each qualifying item has data from all three runs
        result.forEach((runData) => {
          expect(Object.keys(runData)).toHaveLength(3);
          expect(Object.keys(runData)).toEqual(
            expect.arrayContaining([run1Id, run2Id, run3Id]),
          );
        });
      });

      it("should handle intersection with partially overlapping runs (some runs have items, others don't)", async () => {
        // Test case: Create scenario where some runs have certain items and others don't
        const datasetItemIds = await getDatasetItemIdsWithRunData({
          projectId,
          datasetId,
          limit: 100,
          offset: 0,
          runIds: [run1Id, run2Id, run3Id],
          filterByRun: [
            {
              runId: run1Id,
              filters: [], // No filters - all items qualify (items 0,1,2,3,4)
            },
            {
              runId: run2Id,
              filters: [], // No filters - all items qualify (items 0,1,2,3)
            },
            {
              runId: run3Id,
              filters: [], // No filters - all items qualify (items 0,1,2)
            },
          ],
        });

        // Step 2: Given dataset item ids, lookup dataset run items in clickhouse
        // Note: for each unique dataset item id and dataset run id combination, we will retrieve a dataset run item
        const datasetRunItems = await getDatasetRunItemsWithoutIOByItemIds({
          projectId: projectId,
          datasetId: datasetId,
          runIds: [run1Id, run2Id, run3Id],
          datasetItemIds,
        });

        const result = await enrichAndMapToDatasetItemId(
          projectId,
          datasetRunItems,
        );

        // All items exist in ALL three runs now: items 0,1,2,3,4
        expect(Array.from(result.keys())).toHaveLength(5);
        expect(Array.from(result.keys())).toEqual(
          expect.arrayContaining([
            itemIds[0],
            itemIds[1],
            itemIds[2],
            itemIds[3],
            itemIds[4],
          ]),
        );

        // Verify each qualifying item has data from all three runs
        result.forEach((runData) => {
          expect(Object.keys(runData)).toHaveLength(3);
          expect(Object.keys(runData)).toEqual(
            expect.arrayContaining([run1Id, run2Id, run3Id]),
          );
        });
      });

      it("should properly paginate intersection results", async () => {
        // Test case: Verify that pagination works correctly with intersection logic
        const firstPageDatasetItemIds = await getDatasetItemIdsWithRunData({
          projectId,
          datasetId,
          limit: 2,
          offset: 0,
          runIds: [run1Id, run2Id, run3Id],
          filterByRun: [
            { runId: run1Id, filters: [] },
            { runId: run2Id, filters: [] },
          ],
        });

        const secondPageDatasetItemIds = await getDatasetItemIdsWithRunData({
          projectId,
          datasetId,
          limit: 2,
          offset: 2,
          runIds: [run1Id, run2Id, run3Id],
          filterByRun: [
            { runId: run1Id, filters: [] },
            { runId: run2Id, filters: [] },
          ],
        });

        // Step 2: Given dataset item ids, lookup dataset run items in clickhouse
        // Note: for each unique dataset item id and dataset run id combination, we will retrieve a dataset run item
        const datasetRunItemsFirstPage =
          await getDatasetRunItemsWithoutIOByItemIds({
            projectId: projectId,
            datasetId: datasetId,
            runIds: [run1Id, run2Id, run3Id],
            datasetItemIds: firstPageDatasetItemIds,
          });

        // Step 2: Given dataset item ids, lookup dataset run items in clickhouse
        // Note: for each unique dataset item id and dataset run id combination, we will retrieve a dataset run item
        const datasetRunItemsSecondPage =
          await getDatasetRunItemsWithoutIOByItemIds({
            projectId: projectId,
            datasetId: datasetId,
            runIds: [run1Id, run2Id, run3Id],
            datasetItemIds: secondPageDatasetItemIds,
          });

        const firstPageResult = await enrichAndMapToDatasetItemId(
          projectId,
          datasetRunItemsFirstPage,
        );
        const secondPageResult = await enrichAndMapToDatasetItemId(
          projectId,
          datasetRunItemsSecondPage,
        );

        // Check actual counts - pagination test uses all 3 runs (all have 5 items, no filters)
        expect(Array.from(firstPageResult.keys())).toHaveLength(2);
        expect(Array.from(secondPageResult.keys())).toHaveLength(2); // Second page: offset=2, limit=2
      });

      it("should filter single run with single numeric filter", async () => {
        const datasetItemIds = await getDatasetItemIdsWithRunData({
          projectId,
          datasetId,
          limit: 1000,
          offset: 0,
          runIds: [run1Id, run2Id, run3Id],
          filterByRun: [
            {
              runId: run1Id,
              filters: [
                {
                  type: "numberObject" as const,
                  column: "agg_scores_avg",
                  key: "accuracy",
                  operator: ">=" as const,
                  value: 0.7,
                },
              ],
            },
          ],
        });

        // Step 2: Given dataset item ids, lookup dataset run items in clickhouse
        // Note: for each unique dataset item id and dataset run id combination, we will retrieve a dataset run item
        const datasetRunItems = await getDatasetRunItemsWithoutIOByItemIds({
          projectId: projectId,
          datasetId: datasetId,
          runIds: [run1Id, run2Id, run3Id],
          datasetItemIds,
        });

        const result = await enrichAndMapToDatasetItemId(
          projectId,
          datasetRunItems,
        );

        // Should only return items where accuracy >= 0.7 in run1
        expect(Array.from(result.keys())).toHaveLength(3);
        expect(Array.from(result.keys())).toEqual(
          expect.arrayContaining([itemIds[2], itemIds[3], itemIds[4]]),
        );

        // Verify the returned data
        const item2Data = result.get(itemIds[2])?.[run1Id];
        expect(item2Data).toBeDefined();
        expect((item2Data?.scores?.[accuracyKey] as any)?.average).toBe(0.7);

        const item4Data = result.get(itemIds[4])?.[run1Id];
        expect(item4Data).toBeDefined();
        expect((item4Data?.scores?.[accuracyKey] as any)?.average).toBe(0.8);
      });

      it("should filter multiple runs with different numeric filters", async () => {
        const datasetItemIds = await getDatasetItemIdsWithRunData({
          projectId,
          datasetId,
          limit: 100,
          offset: 0,
          runIds: [run1Id, run2Id, run3Id],
          filterByRun: [
            {
              runId: run1Id,
              filters: [
                {
                  type: "numberObject" as const,
                  column: "agg_scores_avg",
                  key: "accuracy",
                  operator: ">=" as const,
                  value: 0.7,
                },
              ],
            },
            {
              runId: run2Id,
              filters: [
                {
                  type: "numberObject" as const,
                  column: "agg_scores_avg",
                  key: "accuracy",
                  operator: ">=" as const,
                  value: 0.75,
                },
              ],
            },
          ],
        });

        // Step 2: Given dataset item ids, lookup dataset run items in clickhouse
        // Note: for each unique dataset item id and dataset run id combination, we will retrieve a dataset run item
        const datasetRunItems = await getDatasetRunItemsWithoutIOByItemIds({
          projectId: projectId,
          datasetId: datasetId,
          runIds: [run1Id, run2Id, run3Id],
          datasetItemIds,
        });

        const result = await enrichAndMapToDatasetItemId(
          projectId,
          datasetRunItems,
        );

        // Run 1: Items 2, 3, 4 (accuracy >= 0.7: 0.7, 0.75, 0.8)
        // Run 2: Items 0, 1, 2, 3, 4 (accuracy >= 0.75: 0.75, 0.8, 0.85, 0.9, 0.95)
        // Intersection: items 2, 3, 4 (meet both criteria)
        expect(Array.from(result.keys())).toEqual(
          expect.arrayContaining([itemIds[2], itemIds[3], itemIds[4]]),
        );

        // Check run1 data (items 2, 3, 4)
        expect(result.get(itemIds[2])?.[run1Id]).toBeDefined();
        expect(result.get(itemIds[3])?.[run1Id]).toBeDefined();
        expect(result.get(itemIds[4])?.[run1Id]).toBeDefined();

        // Check run2 data (items 2, 3, 4 should have run2 data)
        expect(result.get(itemIds[2])?.[run2Id]).toBeDefined();
        expect(result.get(itemIds[3])?.[run2Id]).toBeDefined();
        expect(result.get(itemIds[4])?.[run2Id]).toBeDefined();

        // Verify accuracy values
        expect(
          (result.get(itemIds[2])?.[run1Id]?.scores?.[accuracyKey] as any)
            ?.average,
        ).toBe(0.7);
        expect(
          (result.get(itemIds[2])?.[run2Id]?.scores?.[accuracyKey] as any)
            ?.average,
        ).toBe(0.85);
      });

      it("should filter single run with multiple numeric filters (AND condition)", async () => {
        const datasetItemIds = await getDatasetItemIdsWithRunData({
          projectId,
          datasetId,
          limit: 100,
          offset: 0,
          runIds: [run1Id, run2Id, run3Id],
          filterByRun: [
            {
              runId: run1Id,
              filters: [
                {
                  type: "numberObject" as const,
                  column: "agg_scores_avg",
                  key: "accuracy",
                  operator: ">=" as const,
                  value: 0.75,
                },
                {
                  type: "numberObject" as const,
                  column: "agg_scores_avg",
                  key: "relevance",
                  operator: ">=" as const,
                  value: 0.74,
                },
              ],
            },
          ],
        });

        // Step 2: Given dataset item ids, lookup dataset run items in clickhouse
        // Note: for each unique dataset item id and dataset run id combination, we will retrieve a dataset run item
        const datasetRunItems = await getDatasetRunItemsWithoutIOByItemIds({
          projectId: projectId,
          datasetId: datasetId,
          runIds: [run1Id, run2Id, run3Id],
          datasetItemIds,
        });

        const result = await enrichAndMapToDatasetItemId(
          projectId,
          datasetRunItems,
        );

        // Should only return items where accuracy >= 0.75 AND relevance >= 0.74
        // Run1 accuracy: 0.6, 0.65, 0.7, 0.75, 0.8 (items 3, 4 meet accuracy >= 0.75)
        // Run1 relevance: 0.5, 0.58, 0.66, 0.74, 0.82 (items 3, 4 meet relevance >= 0.74)
        expect(Array.from(result.keys())).toHaveLength(2);
        expect(Array.from(result.keys())).toEqual(
          expect.arrayContaining([itemIds[3], itemIds[4]]),
        );

        // Verify both conditions are met
        const item3Data = result.get(itemIds[3])?.[run1Id];
        expect((item3Data?.scores?.[accuracyKey] as any)?.average).toBe(0.75);
        expect((item3Data?.scores?.[relevanceKey] as any)?.average).toBe(0.74);

        const item4Data = result.get(itemIds[4])?.[run1Id];
        expect((item4Data?.scores?.[accuracyKey] as any)?.average).toBe(0.8);
        expect((item4Data?.scores?.[relevanceKey] as any)?.average).toBeCloseTo(
          0.82,
        );
      });

      it("should filter multiple runs with multiple filters each", async () => {
        const datasetItemIds = await getDatasetItemIdsWithRunData({
          projectId,
          datasetId,
          limit: 100,
          offset: 0,
          runIds: [run1Id, run2Id, run3Id],
          filterByRun: [
            {
              runId: run1Id,
              filters: [
                {
                  type: "numberObject" as const,
                  column: "agg_scores_avg",
                  key: "accuracy",
                  operator: ">=" as const,
                  value: 0.75,
                },
                {
                  type: "numberObject" as const,
                  column: "agg_scores_avg",
                  key: "relevance",
                  operator: ">=" as const,
                  value: 0.74,
                },
              ],
            },
            {
              runId: run3Id,
              filters: [
                {
                  type: "categoryOptions" as const,
                  column: "agg_score_categories",
                  key: "language",
                  operator: "any of" as const,
                  value: ["formal", "casual"],
                },
              ],
            },
          ],
        });

        // Step 2: Given dataset item ids, lookup dataset run items in clickhouse
        // Note: for each unique dataset item id and dataset run id combination, we will retrieve a dataset run item
        const datasetRunItems = await getDatasetRunItemsWithoutIOByItemIds({
          projectId: projectId,
          datasetId: datasetId,
          runIds: [run1Id, run2Id, run3Id],
          datasetItemIds,
        });

        const result = await enrichAndMapToDatasetItemId(
          projectId,
          datasetRunItems,
        );

        // Run 1: Items where accuracy >= 0.75 AND relevance >= 0.74 (items 3, 4)
        // Run 2: No filter - all items qualify (items 0, 1, 2, 3, 4)
        // Run 3: Items where language is "formal" or "casual" (items 0, 1, 3, 4)
        // Intersection: items 3, 4 (items that meet ALL criteria across ALL runs)
        expect(Array.from(result.keys())).toHaveLength(2);
        expect(Array.from(result.keys())).toEqual(
          expect.arrayContaining([itemIds[3], itemIds[4]]),
        );
      });

      it("should filter with categorical filters", async () => {
        const datasetItemIds = await getDatasetItemIdsWithRunData({
          projectId,
          datasetId,
          limit: 100,
          offset: 0,
          runIds: [run1Id, run2Id, run3Id], // All runs for intersection
          filterByRun: [
            {
              runId: run3Id,
              filters: [
                {
                  type: "categoryOptions" as const,
                  column: "agg_score_categories",
                  key: "language",
                  operator: "none of" as const,
                  value: ["technical"],
                },
              ],
            },
          ],
        });

        // Step 2: Given dataset item ids, lookup dataset run items in clickhouse
        // Note: for each unique dataset item id and dataset run id combination, we will retrieve a dataset run item
        const datasetRunItems = await getDatasetRunItemsWithoutIOByItemIds({
          projectId: projectId,
          datasetId: datasetId,
          runIds: [run1Id, run2Id, run3Id],
          datasetItemIds,
        });

        const result = await enrichAndMapToDatasetItemId(
          projectId,
          datasetRunItems,
        );

        // Intersection logic: items must exist in ALL runs AND meet filter criteria
        // Run1: no filter → items 0,1,2,3,4 qualify
        // Run2: no filter → items 0,1,2,3,4 qualify
        // Run3: language != "technical" → items 0,1,3,4 qualify (excludes item 2 with "technical")
        // Intersection: items 0,1,3,4 (4 items)
        expect(Array.from(result.keys())).toHaveLength(4);
        expect(Array.from(result.keys())).toEqual(
          expect.arrayContaining([
            itemIds[0],
            itemIds[1],
            itemIds[3],
            itemIds[4],
          ]),
        );
        expect(result.get(itemIds[2])).toBeUndefined(); // Has "technical" language, excluded by run3 filter
      });

      it("should handle filters that match no items", async () => {
        const datasetItemIds = await getDatasetItemIdsWithRunData({
          projectId,
          datasetId,
          limit: 100,
          offset: 0,
          runIds: [run1Id, run2Id, run3Id],
          filterByRun: [
            {
              runId: run1Id,
              filters: [
                {
                  type: "numberObject" as const,
                  column: "agg_scores_avg",
                  key: "accuracy",
                  operator: ">=" as const,
                  value: 1.0, // No scores are this high
                },
              ],
            },
          ],
        });

        // Step 2: Given dataset item ids, lookup dataset run items in clickhouse
        // Note: for each unique dataset item id and dataset run id combination, we will retrieve a dataset run item
        const datasetRunItems = await getDatasetRunItemsWithoutIOByItemIds({
          projectId: projectId,
          datasetId: datasetId,
          runIds: [run1Id, run2Id, run3Id],
          datasetItemIds,
        });

        const result = await enrichAndMapToDatasetItemId(
          projectId,
          datasetRunItems,
        );

        expect(result).toEqual(new Map());
      });

      it("should handle filters with non-existent score names", async () => {
        const datasetItemIds = await getDatasetItemIdsWithRunData({
          projectId,
          datasetId,
          limit: 100,
          offset: 0,
          runIds: [run1Id, run2Id, run3Id],
          filterByRun: [
            {
              runId: run1Id,
              filters: [
                {
                  type: "numberObject" as const,
                  column: "agg_scores_avg",
                  key: "nonexistent_score",
                  operator: ">=" as const,
                  value: 0.5,
                },
              ],
            },
          ],
        });

        // Step 2: Given dataset item ids, lookup dataset run items in clickhouse
        // Note: for each unique dataset item id and dataset run id combination, we will retrieve a dataset run item
        const datasetRunItems = await getDatasetRunItemsWithoutIOByItemIds({
          projectId: projectId,
          datasetId: datasetId,
          runIds: [run1Id, run2Id, run3Id],
          datasetItemIds,
        });

        const result = await enrichAndMapToDatasetItemId(
          projectId,
          datasetRunItems,
        );

        expect(result).toEqual(new Map());
      });

      it("should handle empty filter list for a run", async () => {
        const datasetItemIds = await getDatasetItemIdsWithRunData({
          projectId,
          datasetId,
          limit: 100,
          offset: 0,
          runIds: [run1Id, run2Id, run3Id],
          filterByRun: [
            {
              runId: run1Id,
              filters: [], // Empty filters should return all items
            },
          ],
        });

        // Step 2: Given dataset item ids, lookup dataset run items in clickhouse
        // Note: for each unique dataset item id and dataset run id combination, we will retrieve a dataset run item
        const datasetRunItems = await getDatasetRunItemsWithoutIOByItemIds({
          projectId: projectId,
          datasetId: datasetId,
          runIds: [run1Id, run2Id, run3Id],
          datasetItemIds,
        });

        const result = await enrichAndMapToDatasetItemId(
          projectId,
          datasetRunItems,
        );

        // Should return intersection of all runs (items that exist in ALL runs)
        // Run1: 5 items (0-4), Run2: 5 items (0-4), Run3: 5 items (0-4)
        // Intersection: all items 0, 1, 2, 3, 4 (5 items)
        expect(Array.from(result.keys())).toHaveLength(5);
        expect(Array.from(result.keys())).toEqual(
          expect.arrayContaining([
            itemIds[0],
            itemIds[1],
            itemIds[2],
            itemIds[3],
            itemIds[4],
          ]),
        );

        // Verify each item has data from all three runs
        result.forEach((runData) => {
          expect(Object.keys(runData)).toHaveLength(3);
          expect(Object.keys(runData)).toEqual(
            expect.arrayContaining([run1Id, run2Id, run3Id]),
          );
        });
      });

      it("should maintain data integrity during complex intersection filtering", async () => {
        const datasetItemIds = await getDatasetItemIdsWithRunData({
          projectId,
          datasetId,
          limit: 100,
          offset: 0,
          runIds: [run1Id, run2Id, run3Id],
          filterByRun: [
            {
              runId: run1Id,
              filters: [
                {
                  type: "numberObject" as const,
                  column: "agg_scores_avg",
                  key: "accuracy",
                  operator: "=" as const,
                  value: 0.7,
                },
              ],
            },
            {
              runId: run2Id,
              filters: [
                {
                  type: "numberObject" as const,
                  column: "agg_scores_avg",
                  key: "accuracy",
                  operator: "=" as const,
                  value: 0.85,
                },
              ],
            },
          ],
        });

        // Step 2: Given dataset item ids, lookup dataset run items in clickhouse
        // Note: for each unique dataset item id and dataset run id combination, we will retrieve a dataset run item
        const datasetRunItems = await getDatasetRunItemsWithoutIOByItemIds({
          projectId: projectId,
          datasetId: datasetId,
          runIds: [run1Id, run2Id, run3Id],
          datasetItemIds,
        });

        const result = await enrichAndMapToDatasetItemId(
          projectId,
          datasetRunItems,
        );

        // Verify that the intersection logic preserves correct data for matching items
        const item2Run1 = result.get(itemIds[2])?.[run1Id];
        const item2Run2 = result.get(itemIds[2])?.[run2Id];

        expect(item2Run1).toBeDefined();
        expect(item2Run2).toBeDefined();

        // Verify accuracy scores match filter exactly (intersection requirement)
        expect((item2Run1?.scores?.[accuracyKey] as any)?.average).toBe(0.7);
        expect((item2Run2?.scores?.[accuracyKey] as any)?.average).toBe(0.85);

        // Verify run metadata is correct for intersected data
        expect(item2Run1?.datasetRunId).toBe(run1Id);
        expect(item2Run2?.datasetRunId).toBe(run2Id);

        // Verify trace data is preserved across intersection
        expect(item2Run1?.trace?.id).toBe(run1TraceIds[2]);
        expect(item2Run2?.trace?.id).toBe(run2TraceIds[2]);

        // Verify that only item 2 is returned (the only one meeting both filters)
        expect(Array.from(result.keys())).toEqual([itemIds[2]]);

        // Verify intersection logic: item must exist in ALL specified runs with their respective filters
        expect(Array.from(result.keys())).toHaveLength(1);
      });
    });
  });
});
