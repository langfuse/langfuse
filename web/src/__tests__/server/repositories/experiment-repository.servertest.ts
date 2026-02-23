import { randomUUID } from "crypto";
import { env } from "@/src/env.mjs";
import {
  createEvent,
  createEventsCh,
  getExperimentsCountFromEvents,
  getExperimentsFromEvents,
} from "@langfuse/shared/src/server";

const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

const maybe =
  env.LANGFUSE_ENABLE_EVENTS_TABLE_OBSERVATIONS === "true"
    ? describe
    : describe.skip;

describe("Clickhouse Experiment Repository Test", () => {
  maybe("get", () => {
    it("should return 0 for non-existent project", async () => {
      const nonExistentProjectId = randomUUID();

      const count = await getExperimentsCountFromEvents({
        projectId: nonExistentProjectId,
        filter: [],
      });

      expect(count).toBe(0);
    });

    it("should return one experiment row with two item rows", async () => {
      const traceId = randomUUID();
      const generationId = randomUUID();
      const generationId2 = randomUUID();

      const experimentId = randomUUID();
      const experimentName = "test-experiment-" + randomUUID();
      const experimentDescription =
        "test-experiment-description-" + randomUUID();
      const experimentDatasetId = randomUUID();
      const experimentItemId = randomUUID();

      const event1 = createEvent({
        id: generationId,
        span_id: generationId,
        project_id: projectId,
        trace_id: traceId,
        type: "GENERATION",
        name: "test-generation-no-model",
        input: "Test input",
        output: "Test output",
        experiment_id: experimentId,
        experiment_name: experimentName,
        experiment_metadata_names: [],
        experiment_metadata_values: [],
        experiment_description: experimentDescription,
        experiment_dataset_id: experimentDatasetId,
        experiment_item_id: experimentItemId,
        experiment_item_version: Date.now() * 1000,
        experiment_item_expected_output: "Test expected output",
        experiment_item_metadata_names: [],
        experiment_item_metadata_values: [],
        experiment_item_root_span_id: generationId,
      });

      const event2 = createEvent({
        id: generationId2,
        span_id: generationId2,
        project_id: projectId,
        trace_id: randomUUID(),
        type: "GENERATION",
        name: "test-generation-no-model",
        input: "Test input",
        output: "Test output",
        experiment_id: experimentId,
        experiment_name: experimentName,
        experiment_metadata_names: [],
        experiment_metadata_values: [],
        experiment_description: experimentDescription,
        experiment_dataset_id: experimentDatasetId,
        experiment_item_id: randomUUID(),
        experiment_item_version: Date.now() * 1000,
        experiment_item_expected_output: "Test expected output 2",
        experiment_item_metadata_names: [],
        experiment_item_metadata_values: [],
        experiment_item_root_span_id: generationId2,
      });

      await createEventsCh([event1, event2]);

      const result = await getExperimentsFromEvents({
        projectId,
        filter: [],
        limit: 1000,
        page: 0,
      });

      const experiment = result.find((e) => e.id === experimentId);
      expect(experiment).toBeDefined();
      expect(experiment?.id).toBe(experimentId);
      expect(experiment?.name).toBe(experimentName);
      expect(experiment?.description).toBe(experimentDescription);
      expect(experiment?.datasetId).toBe(experimentDatasetId);
      expect(experiment?.itemCount).toBe(2);
    });

    it("should order by createdAt DESC", async () => {
      const experimentId1 = randomUUID();
      const experimentName1 = "experiment-1-" + randomUUID();
      const experimentId2 = randomUUID();
      const experimentName2 = "experiment-2-" + randomUUID();
      const experimentId3 = randomUUID();
      const experimentName3 = "experiment-3-" + randomUUID();

      const datasetId = randomUUID();

      // Create events with different timestamps
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

      const event1 = createEvent({
        id: randomUUID(),
        span_id: randomUUID(),
        project_id: projectId,
        trace_id: randomUUID(),
        type: "GENERATION",
        name: "test-generation",
        experiment_id: experimentId1,
        experiment_name: experimentName1,
        experiment_metadata_names: [],
        experiment_metadata_values: [],
        experiment_dataset_id: datasetId,
        experiment_item_id: randomUUID(),
        experiment_item_version: Date.now() * 1000,
        experiment_item_root_span_id: randomUUID(),
        created_at: twoDaysAgo.getTime() * 1000,
      });

      const event2 = createEvent({
        id: randomUUID(),
        span_id: randomUUID(),
        project_id: projectId,
        trace_id: randomUUID(),
        type: "GENERATION",
        name: "test-generation",
        experiment_id: experimentId2,
        experiment_name: experimentName2,
        experiment_metadata_names: [],
        experiment_metadata_values: [],
        experiment_dataset_id: datasetId,
        experiment_item_id: randomUUID(),
        experiment_item_version: Date.now() * 1000,
        experiment_item_root_span_id: randomUUID(),
        created_at: now.getTime() * 1000,
      });

      const event3 = createEvent({
        id: randomUUID(),
        span_id: randomUUID(),
        project_id: projectId,
        trace_id: randomUUID(),
        type: "GENERATION",
        name: "test-generation",
        experiment_id: experimentId3,
        experiment_name: experimentName3,
        experiment_metadata_names: [],
        experiment_metadata_values: [],
        experiment_dataset_id: datasetId,
        experiment_item_id: randomUUID(),
        experiment_item_version: Date.now() * 1000,
        experiment_item_root_span_id: randomUUID(),
        created_at: yesterday.getTime() * 1000,
      });

      await createEventsCh([event1, event2, event3]);

      const result = await getExperimentsFromEvents({
        projectId,
        filter: [],
        orderBy: {
          column: "createdAt",
          order: "DESC",
        },
        limit: 1000,
        page: 0,
      });

      // Filter to only our test experiments
      const testExperiments = result.filter((e) =>
        [experimentId1, experimentId2, experimentId3].includes(e.id),
      );

      expect(testExperiments.length).toBe(3);
      // Should be ordered by created_at DESC: now -> yesterday -> twoDaysAgo
      expect(testExperiments[0].id).toBe(experimentId2);
      expect(testExperiments[1].id).toBe(experimentId3);
      expect(testExperiments[2].id).toBe(experimentId1);
    });

    it("should filter by createdAt date range and experimentDatasetId", async () => {
      const datasetId1 = randomUUID();
      const datasetId2 = randomUUID();

      const experimentId1 = randomUUID();
      const experimentName1 = "experiment-filtered-1-" + randomUUID();
      const experimentId2 = randomUUID();
      const experimentName2 = "experiment-filtered-2-" + randomUUID();
      const experimentId3 = randomUUID();
      const experimentName3 = "experiment-filtered-3-" + randomUUID();

      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

      // Event 1: twoDaysAgo, datasetId1 (should match)
      const event1 = createEvent({
        id: randomUUID(),
        span_id: randomUUID(),
        project_id: projectId,
        trace_id: randomUUID(),
        type: "GENERATION",
        name: "test-generation",
        experiment_id: experimentId1,
        experiment_name: experimentName1,
        experiment_metadata_names: [],
        experiment_metadata_values: [],
        experiment_dataset_id: datasetId1,
        experiment_item_id: randomUUID(),
        experiment_item_version: Date.now() * 1000,
        experiment_item_root_span_id: randomUUID(),
        created_at: twoDaysAgo.getTime() * 1000,
      });

      // Event 2: yesterday, datasetId2 (should NOT match - different dataset)
      const event2 = createEvent({
        id: randomUUID(),
        span_id: randomUUID(),
        project_id: projectId,
        trace_id: randomUUID(),
        type: "GENERATION",
        name: "test-generation",
        experiment_id: experimentId2,
        experiment_name: experimentName2,
        experiment_metadata_names: [],
        experiment_metadata_values: [],
        experiment_dataset_id: datasetId2,
        experiment_item_id: randomUUID(),
        experiment_item_version: Date.now() * 1000,
        experiment_item_root_span_id: randomUUID(),
        created_at: yesterday.getTime() * 1000,
      });

      // Event 3: threeDaysAgo, datasetId1 (should NOT match - outside date range)
      const event3 = createEvent({
        id: randomUUID(),
        span_id: randomUUID(),
        project_id: projectId,
        trace_id: randomUUID(),
        type: "GENERATION",
        name: "test-generation",
        experiment_id: experimentId3,
        experiment_name: experimentName3,
        experiment_metadata_names: [],
        experiment_metadata_values: [],
        experiment_dataset_id: datasetId1,
        experiment_item_id: randomUUID(),
        experiment_item_version: Date.now() * 1000,
        experiment_item_root_span_id: randomUUID(),
        created_at: threeDaysAgo.getTime() * 1000,
      });

      await createEventsCh([event1, event2, event3]);

      const result = await getExperimentsFromEvents({
        projectId,
        filter: [
          {
            column: "createdAt",
            type: "datetime",
            operator: ">=",
            value: twoDaysAgo,
          },
          {
            column: "createdAt",
            type: "datetime",
            operator: "<=",
            value: now,
          },
          {
            column: "experimentDatasetId",
            type: "string",
            operator: "=",
            value: datasetId1,
          },
        ],
        limit: 1000,
        page: 0,
      });

      // Should only return experimentId1
      const matchingExperiment = result.find((e) => e.id === experimentId1);
      const excludedExperiment2 = result.find((e) => e.id === experimentId2);
      const excludedExperiment3 = result.find((e) => e.id === experimentId3);

      expect(matchingExperiment).toBeDefined();
      expect(matchingExperiment?.id).toBe(experimentId1);
      expect(matchingExperiment?.datasetId).toBe(datasetId1);

      expect(excludedExperiment2).toBeUndefined(); // Different dataset
      expect(excludedExperiment3).toBeUndefined(); // Outside date range
    });
  });
});
