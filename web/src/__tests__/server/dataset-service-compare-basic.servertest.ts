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
    describe("Compare data without filters", () => {
      let datasetId: string;
      let run1Id: string;
      let run2Id: string;
      let run3Id: string;
      let itemIds: string[];
      let traceIds: string[];

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
        itemIds = [v4(), v4(), v4(), v4()];
        traceIds = [v4(), v4(), v4(), v4()];

        // Create dataset
        await prisma.dataset.create({
          data: {
            id: datasetId,
            name: `compare-test-dataset-${datasetId}`,
            projectId: projectId,
          },
        });

        // Create dataset runs
        await prisma.datasetRuns.createMany({
          data: [
            {
              id: run1Id,
              name: "run-1",
              datasetId,
              metadata: { purpose: "baseline" },
              projectId,
              createdAt: new Date("2024-01-01T00:00:00Z"),
            },
            {
              id: run2Id,
              name: "run-2",
              datasetId,
              metadata: { purpose: "experiment" },
              projectId,
              createdAt: new Date("2024-01-02T00:00:00Z"),
            },
            {
              id: run3Id,
              name: "run-3",
              datasetId,
              metadata: { purpose: "validation" },
              projectId,
              createdAt: new Date("2024-01-03T00:00:00Z"),
            },
          ],
        });

        // Create dataset items with same timestamp but different IDs for pagination testing
        await createManyDatasetItems({
          projectId,
          items: itemIds.map((id, index) => ({
            id,
            datasetId,
            input: { prompt: `Test input ${index + 1}` },
            expectedOutput: { response: `Expected output ${index + 1}` },
            metadata: {
              category: index < 2 ? "category-a" : "category-b",
              difficulty: index % 2 === 0 ? "easy" : "hard",
            },
          })),
        });

        // Create traces
        const traces = traceIds.map((traceId, index) =>
          createTrace({
            id: traceId,
            project_id: projectId,
            name: `trace-${index + 1}`,
            timestamp: new Date().getTime() - (4 - index) * 1000,
            metadata: { test: `trace-${index + 1}` },
          }),
        );

        await createTracesCh(traces);

        // Create observations for some traces (mix of trace-level and observation-level linkage)
        const parentObsId = v4();
        const childObs1Id = v4();
        const childObs2Id = v4();

        const observations = [
          // First trace: parent observation with 2 children
          createObservation({
            id: parentObsId,
            trace_id: traceIds[0],
            project_id: projectId,
            type: "GENERATION",
            name: "parent-generation",
            parent_observation_id: null,
            start_time: new Date().getTime() - 3500,
            end_time: new Date().getTime() - 2500,
            metadata: { model: "gpt-4" },
            cost_details: { total: 0 }, // Parent has no direct cost
          }),
          createObservation({
            id: childObs1Id,
            trace_id: traceIds[0],
            project_id: projectId,
            type: "GENERATION",
            name: "child-generation-1",
            parent_observation_id: parentObsId,
            start_time: new Date().getTime() - 3400,
            end_time: new Date().getTime() - 3000,
            cost_details: { total: 0.005 }, // Child 1 cost
          }),
          createObservation({
            id: childObs2Id,
            trace_id: traceIds[0],
            project_id: projectId,
            type: "GENERATION",
            name: "child-generation-2",
            parent_observation_id: parentObsId,
            start_time: new Date().getTime() - 3000,
            end_time: new Date().getTime() - 2600,
            cost_details: { total: 0.008765 }, // Child 2 cost (total = 0.013765)
          }),
          createObservation({
            trace_id: traceIds[1],
            project_id: projectId,
            type: "GENERATION",
            name: "generation-2",
            start_time: new Date().getTime() - 2500,
            end_time: new Date().getTime() - 1500,
            metadata: { model: "gpt-3.5" },
          }),
          // Third trace has observation but run item will link to trace (trace-level linkage)
          createObservation({
            trace_id: traceIds[2],
            project_id: projectId,
            type: "GENERATION",
            name: "generation-3",
            start_time: new Date().getTime() - 1500,
            end_time: new Date().getTime() - 500,
            metadata: { model: "claude" },
          }),
          // Fourth trace: no observation (trace-level linkage only)
        ];

        await createObservationsCh(observations);

        // Create dataset run items - mix of trace-level and observation-level linkage
        const runItems = [
          // Run 1: All items, mix of trace and observation linkage
          createDatasetRunItem({
            id: v4(),
            dataset_run_id: run1Id,
            dataset_item_id: itemIds[0],
            trace_id: traceIds[0],
            observation_id: parentObsId, // Link to parent observation (has children)
            project_id: projectId,
            dataset_id: datasetId,
            dataset_run_name: "run-1",
          }),
          createDatasetRunItem({
            id: v4(),
            dataset_run_id: run1Id,
            dataset_item_id: itemIds[1],
            trace_id: traceIds[1],
            observation_id: null, // Trace-level linkage
            project_id: projectId,
            dataset_id: datasetId,
            dataset_run_name: "run-1",
          }),
          createDatasetRunItem({
            id: v4(),
            dataset_run_id: run1Id,
            dataset_item_id: itemIds[2],
            trace_id: traceIds[2],
            observation_id: null, // Trace-level linkage
            project_id: projectId,
            dataset_id: datasetId,
            dataset_run_name: "run-1",
          }),

          // Run 2: Partial items, observation-level linkage
          createDatasetRunItem({
            id: v4(),
            dataset_run_id: run2Id,
            dataset_item_id: itemIds[0],
            trace_id: traceIds[0],
            observation_id: observations[0].id, // Observation-level linkage
            project_id: projectId,
            dataset_id: datasetId,
            dataset_run_name: "run-2",
          }),
          createDatasetRunItem({
            id: v4(),
            dataset_run_id: run2Id,
            dataset_item_id: itemIds[3],
            trace_id: traceIds[3],
            observation_id: null, // Trace-level linkage (no observation exists)
            project_id: projectId,
            dataset_id: datasetId,
            dataset_run_name: "run-2",
          }),

          // Run 3: Single item, trace-level linkage
          createDatasetRunItem({
            id: v4(),
            dataset_run_id: run3Id,
            dataset_item_id: itemIds[1],
            trace_id: traceIds[1],
            observation_id: null, // Trace-level linkage
            project_id: projectId,
            dataset_id: datasetId,
            dataset_run_name: "run-3",
          }),
        ];

        await createDatasetRunItemsCh(runItems);

        // Create scores for traces
        const scores = [
          createTraceScore({
            id: v4(),
            trace_id: traceIds[0],
            project_id: projectId,
            name: "accuracy",
            value: 0.95,
            source: "API",
          }),
          createTraceScore({
            id: v4(),
            trace_id: traceIds[0],
            project_id: projectId,
            name: "relevance",
            value: 0.88,
            source: "API",
          }),
          createTraceScore({
            id: v4(),
            trace_id: traceIds[1],
            project_id: projectId,
            name: "accuracy",
            value: 0.72,
            source: "API",
          }),
          createTraceScore({
            id: v4(),
            trace_id: traceIds[2],
            project_id: projectId,
            name: "accuracy",
            value: 0.81,
            source: "API",
          }),
          createTraceScore({
            id: v4(),
            trace_id: traceIds[3],
            project_id: projectId,
            name: "relevance",
            value: 0.65,
            source: "API",
          }),
        ];

        await createScoresCh(scores);
      });

      it("should return correct data structure with no pagination", async () => {
        const datasetItemIds = await getDatasetItemIdsWithRunData({
          projectId,
          datasetId,
          runIds: [run1Id, run2Id, run3Id],
          filterByRun: [],
          limit: 100,
          offset: 0,
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

        // Should be a record, not an array
        expect(typeof result).toBe("object");
        expect(Array.isArray(result)).toBe(false);

        // Should have the correct nested structure: datasetItemId -> runId -> enriched data
        expect(Array.from(result.keys())).toEqual(
          expect.arrayContaining(itemIds),
        );

        // Check specific dataset items have the correct run data
        // Item 0: Should have data from run1 and run2
        expect(result.get(itemIds[0])).toBeDefined();
        expect(Object.keys(result.get(itemIds[0]) ?? {})).toEqual(
          expect.arrayContaining([run1Id, run2Id]),
        );
        expect(result.get(itemIds[0])?.[run3Id]).toBeUndefined(); // Not in run3

        // Item 1: Should have data from run1 and run3
        expect(result.get(itemIds[1])).toBeDefined();
        expect(Object.keys(result.get(itemIds[1]) ?? {})).toEqual(
          expect.arrayContaining([run1Id, run3Id]),
        );
        expect(result.get(itemIds[1])?.[run2Id]).toBeUndefined(); // Not in run2

        // Item 2: Should have data from run1 only
        expect(result.get(itemIds[2])).toBeDefined();
        expect(Object.keys(result.get(itemIds[2]) ?? {})).toEqual([run1Id]);

        // Item 3: Should have data from run2 only
        expect(result.get(itemIds[3])).toBeDefined();
        expect(Object.keys(result.get(itemIds[3]) ?? {})).toEqual([run2Id]);
      });

      it("should include correct enriched data (scores, latency, costs)", async () => {
        const datasetItemIds = await getDatasetItemIdsWithRunData({
          projectId,
          datasetId,
          runIds: [run1Id, run2Id, run3Id],
          filterByRun: [],
          limit: 100,
          offset: 0,
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

        // Test enriched data for item 0, run 1 (has observation-level linkage + scores)
        const item0Run1 = result.get(itemIds[0])?.[run1Id];
        expect(item0Run1).toBeDefined();
        expect(item0Run1?.datasetRunId).toBe(run1Id);
        expect(item0Run1?.datasetItemId).toBe(itemIds[0]);

        // Should have observation data (observation-level linkage)
        expect(item0Run1?.observation).toBeDefined();
        expect(item0Run1?.observation?.latency).toBeDefined();
        expect(typeof item0Run1?.observation?.latency).toBe("number");
        expect(item0Run1?.observation?.calculatedTotalCost).toBeDefined();
        // Should calculate recursive cost (parent + 2 children: 0 + 0.005 + 0.008765 = 0.013765)
        expect(
          item0Run1?.observation?.calculatedTotalCost?.toNumber(),
        ).toBeCloseTo(0.013765, 6);

        // Should have trace data
        expect(item0Run1?.trace).toBeDefined();
        expect(item0Run1?.trace?.id).toBe(traceIds[0]);
        expect(typeof item0Run1?.trace?.duration).toBe("number");
        expect(typeof item0Run1?.trace?.totalCost).toBe("number");

        // Should have scores (accuracy: 0.95, relevance: 0.88)
        expect(item0Run1?.scores).toBeDefined();

        expect(item0Run1?.scores?.[accuracyKey]).toBeDefined();
        expect((item0Run1?.scores?.[accuracyKey] as any)?.average).toBe(0.95);
        expect(item0Run1?.scores?.[relevanceKey]).toBeDefined();
        expect((item0Run1?.scores?.[relevanceKey] as any)?.average).toBe(0.88);
      });

      it("should handle trace-level vs observation-level linkage correctly", async () => {
        const datasetItemIds = await getDatasetItemIdsWithRunData({
          projectId,
          datasetId,
          runIds: [run1Id, run2Id, run3Id],
          filterByRun: [],
          limit: 100,
          offset: 0,
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

        // Item 0, Run 1: Observation-level linkage (should have observation data)
        const item0Run1 = result.get(itemIds[0])?.[run1Id];
        expect(item0Run1?.observation).toBeDefined();
        expect(item0Run1?.observation?.id).toBeDefined();

        // Item 1, Run 1: Trace-level linkage (should not have observation data)
        const item1Run1 = result.get(itemIds[1])?.[run1Id];
        expect(item1Run1?.observation).toBeUndefined();

        // But should still have trace data
        expect(item1Run1?.trace).toBeDefined();
        expect(item1Run1?.trace?.id).toBe(traceIds[1]);

        // Item 3, Run 2: Trace-level linkage, no observation exists for this trace
        const item3Run2 = result.get(itemIds[3])?.[run2Id];
        expect(item3Run2?.observation).toBeUndefined();
        expect(item3Run2?.trace).toBeDefined();
        expect(item3Run2?.trace?.id).toBe(traceIds[3]);
      });

      it("should include correct scores for different traces", async () => {
        const datasetItemIds = await getDatasetItemIdsWithRunData({
          projectId,
          datasetId,
          runIds: [run1Id, run2Id, run3Id],
          filterByRun: [],
          limit: 100,
          offset: 0,
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

        // Trace 0: accuracy: 0.95, relevance: 0.88
        const item0Run1 = result.get(itemIds[0])?.[run1Id];
        expect((item0Run1?.scores?.[accuracyKey] as any)?.average).toBe(0.95);
        expect((item0Run1?.scores?.[relevanceKey] as any)?.average).toBe(0.88);

        // Trace 1: accuracy: 0.72
        const item1Run1 = result.get(itemIds[1])?.[run1Id];
        expect((item1Run1?.scores?.[accuracyKey] as any)?.average).toBe(0.72);
        expect(item1Run1?.scores?.[relevanceKey]).toBeUndefined();

        // Trace 2: accuracy: 0.81
        const item2Run1 = result.get(itemIds[2])?.[run1Id];
        expect((item2Run1?.scores?.[accuracyKey] as any)?.average).toBe(0.81);

        // Trace 3: relevance: 0.65
        const item3Run2 = result.get(itemIds[3])?.[run2Id];
        expect((item3Run2?.scores?.[relevanceKey] as any)?.average).toBe(0.65);
        expect(item3Run2?.scores?.[accuracyKey]).toBeUndefined();
      });

      it("should handle latency calculations correctly", async () => {
        const datasetItemIds = await getDatasetItemIdsWithRunData({
          projectId,
          datasetId,
          runIds: [run1Id, run2Id, run3Id],
          filterByRun: [],
          limit: 100,
          offset: 0,
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

        // Test observation-level latency (should be based on observation start/end time)
        const item0Run1 = result.get(itemIds[0])?.[run1Id];
        expect(item0Run1?.observation?.latency).toBeDefined();
        // Observation 1: 3500ms - 2500ms = 1000ms latency, which translates to 1 second
        expect(item0Run1?.observation?.latency).toBeCloseTo(1);

        const item0Run2 = result.get(itemIds[0])?.[run2Id];
        expect(item0Run2?.observation?.latency).toBeDefined();
        expect(item0Run2?.observation?.latency).toBeCloseTo(1); // Same observation

        // Test trace-level latency (calculated from trace timestamps and observations)
        const item1Run1 = result.get(itemIds[1])?.[run1Id];
        expect(item1Run1?.trace?.duration).toBeDefined();
        expect(typeof item1Run1?.trace?.duration).toBe("number");
      });

      it("should handle cost calculations correctly", async () => {
        const datasetItemIds = await getDatasetItemIdsWithRunData({
          projectId,
          datasetId,
          runIds: [run1Id, run2Id, run3Id],
          filterByRun: [],
          limit: 100,
          offset: 0,
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

        // Test that cost fields are present and properly typed
        result.forEach((runData) => {
          Object.values(runData).forEach((enrichedItem) => {
            // Trace costs
            expect(typeof enrichedItem?.trace?.totalCost).toBe("number");

            // Observation costs (if observation exists)
            if (enrichedItem?.observation) {
              expect(
                enrichedItem?.observation?.calculatedTotalCost,
              ).toBeDefined();
              expect(
                enrichedItem?.observation?.calculatedTotalCost?.constructor
                  ?.name,
              ).toBe("Decimal");
            }
          });
        });
      });

      it("should filter by specific runs correctly", async () => {
        const datasetItemIds = await getDatasetItemIdsWithRunData({
          projectId,
          datasetId,
          runIds: [run1Id, run2Id, run3Id],
          filterByRun: [],
          limit: 100,
          offset: 0,
        });

        // Step 2: Given dataset item ids, lookup dataset run items in clickhouse
        // Note: for each unique dataset item id and dataset run id combination, we will retrieve a dataset run item
        const datasetRunItems = await getDatasetRunItemsWithoutIOByItemIds({
          projectId: projectId,
          datasetId: datasetId,
          runIds: [run1Id, run2Id], // Only first two runs
          datasetItemIds,
        });

        const result = await enrichAndMapToDatasetItemId(
          projectId,
          datasetRunItems,
        );

        // Should not have any data from run3 across all dataset items
        for (const datasetItemToRunData of result.values()) {
          for (const runId of Object.keys(datasetItemToRunData)) {
            expect(runId).not.toBe(run3Id);
          }
        }

        // But should have data from run1 and run2 where applicable
        expect(result.get(itemIds[0])?.[run1Id]).toBeDefined();
        expect(result.get(itemIds[0])?.[run2Id]).toBeDefined();
        expect(result.get(itemIds[1])?.[run1Id]).toBeDefined();
        expect(result.get(itemIds[1])?.[run2Id]).toBeUndefined(); // Item 1 not in run 2
      });

      it("should handle empty dataset item list", async () => {
        const datasetRunItems = await getDatasetRunItemsWithoutIOByItemIds({
          projectId,
          datasetId,
          runIds: [run1Id, run2Id, run3Id],
          datasetItemIds: [], // Empty list
        });

        const result = await enrichAndMapToDatasetItemId(
          projectId,
          datasetRunItems,
        );

        expect(result).toEqual(new Map());
      });

      it("should handle non-existent dataset items", async () => {
        const nonExistentItemId = v4();
        const datasetRunItems = await getDatasetRunItemsWithoutIOByItemIds({
          projectId,
          datasetId,
          runIds: [run1Id, run2Id, run3Id],
          datasetItemIds: [nonExistentItemId],
        });

        const result = await enrichAndMapToDatasetItemId(
          projectId,
          datasetRunItems,
        );

        expect(result).toEqual(new Map());
      });

      it("should handle non-existent runs", async () => {
        const nonExistentRunId = v4();

        const itemIds = await getDatasetItemIdsWithRunData({
          projectId,
          datasetId: datasetId,
          runIds: [nonExistentRunId],
          filterByRun: [],
          limit: 100,
          offset: 0,
        });

        const datasetRunItems = await getDatasetRunItemsWithoutIOByItemIds({
          projectId,
          datasetId,
          runIds: [nonExistentRunId],
          datasetItemIds: itemIds,
        });

        const result = await enrichAndMapToDatasetItemId(
          projectId,
          datasetRunItems,
        );

        expect(result).toEqual(new Map());
      });

      it("should preserve created timestamps and metadata", async () => {
        const itemIds = await getDatasetItemIdsWithRunData({
          projectId,
          datasetId: datasetId,
          runIds: [run1Id, run2Id, run3Id],
          filterByRun: [],
          limit: 100,
          offset: 0,
        });

        const datasetRunItems = await getDatasetRunItemsWithoutIOByItemIds({
          projectId,
          datasetId,
          runIds: [run1Id, run2Id, run3Id],
          datasetItemIds: itemIds,
        });

        const result = await enrichAndMapToDatasetItemId(
          projectId,
          datasetRunItems,
        );

        // Test that timestamps are preserved
        result.forEach((runData) => {
          Object.values(runData).forEach((enrichedItem) => {
            expect(enrichedItem.createdAt).toBeInstanceOf(Date);
            expect(enrichedItem.id).toBeDefined();
            expect(typeof enrichedItem.id).toBe("string");
            expect(enrichedItem.datasetItemId).toBeDefined();
            expect(enrichedItem.datasetRunId).toBeDefined();
          });
        });
      });
    });
  });
});
