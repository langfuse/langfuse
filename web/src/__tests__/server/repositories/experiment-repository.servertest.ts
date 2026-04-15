import { randomUUID } from "crypto";
import { env } from "@/src/env.mjs";
import {
  createEvent,
  createEventsCh,
  getExperimentsCountFromEvents,
  getExperimentsFromEvents,
  getExperimentMetricsFromEvents,
  createTraceScore,
  createScoresCh,
} from "@langfuse/shared/src/server";

const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

const maybe =
  env.LANGFUSE_ENABLE_EVENTS_TABLE_OBSERVATIONS === "true"
    ? describe
    : describe.skip;

describe("Clickhouse Experiment Repository Test", () => {
  it("should kill redis connection", () => {
    // we need at least one test case to avoid hanging
    // redis connection when everything else is skipped.
  });

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
        experiment_item_version: null,
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
        experiment_item_version: null,
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

    it("should order by startTime DESC", async () => {
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

      const rootSpan1Id = randomUUID();
      const event1 = createEvent({
        id: randomUUID(),
        span_id: rootSpan1Id,
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
        experiment_item_version: null,
        experiment_item_root_span_id: rootSpan1Id,
        start_time: twoDaysAgo.getTime() * 1000,
      });

      const rootSpan2Id = randomUUID();
      const event2 = createEvent({
        id: randomUUID(),
        span_id: rootSpan2Id,
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
        experiment_item_version: null,
        experiment_item_root_span_id: rootSpan2Id,
        start_time: now.getTime() * 1000,
      });

      const rootSpan3Id = randomUUID();
      const event3 = createEvent({
        id: randomUUID(),
        span_id: rootSpan3Id,
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
        experiment_item_version: null,
        experiment_item_root_span_id: rootSpan3Id,
        start_time: yesterday.getTime() * 1000,
      });

      await createEventsCh([event1, event2, event3]);

      const result = await getExperimentsFromEvents({
        projectId,
        filter: [],
        orderBy: {
          column: "startTime",
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
      // Should be ordered by start_time DESC: now -> yesterday -> twoDaysAgo
      expect(testExperiments[0].id).toBe(experimentId2);
      expect(testExperiments[1].id).toBe(experimentId3);
      expect(testExperiments[2].id).toBe(experimentId1);
    });

    it("should filter by startTime date range and experimentDatasetId", async () => {
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
      const rootSpan1Id = randomUUID();
      const event1 = createEvent({
        id: randomUUID(),
        span_id: rootSpan1Id,
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
        experiment_item_version: null,
        experiment_item_root_span_id: rootSpan1Id,
        start_time: twoDaysAgo.getTime() * 1000,
      });

      // Event 2: yesterday, datasetId2 (should NOT match - different dataset)
      const rootSpan2Id = randomUUID();
      const event2 = createEvent({
        id: randomUUID(),
        span_id: rootSpan2Id,
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
        experiment_item_version: null,
        experiment_item_root_span_id: rootSpan2Id,
        start_time: yesterday.getTime() * 1000,
      });

      // Event 3: threeDaysAgo, datasetId1 (should NOT match - outside date range)
      const rootSpan3Id = randomUUID();
      const event3 = createEvent({
        id: randomUUID(),
        span_id: rootSpan3Id,
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
        experiment_item_version: null,
        experiment_item_root_span_id: rootSpan3Id,
        start_time: threeDaysAgo.getTime() * 1000,
      });

      await createEventsCh([event1, event2, event3]);

      const result = await getExperimentsFromEvents({
        projectId,
        filter: [
          {
            column: "startTime",
            type: "datetime",
            operator: ">=",
            value: twoDaysAgo,
          },
          {
            column: "startTime",
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

    it("should handle latency calculations correctly", async () => {
      const experimentId = randomUUID();
      const experimentName = "latency-test-" + randomUUID();
      const datasetId = randomUUID();

      const now = new Date().getTime();

      // Trace 1: Multiple events with timing data to test latency calculation
      // Latency is calculated from ROOT SPAN only (span_id = experiment_item_root_span_id)
      const trace1Id = randomUUID();
      const rootSpanId = randomUUID();
      const event1 = createEvent({
        id: randomUUID(),
        span_id: rootSpanId,
        project_id: projectId,
        trace_id: trace1Id,
        type: "GENERATION",
        name: "parent-generation",
        experiment_id: experimentId,
        experiment_name: experimentName,
        experiment_metadata_names: [],
        experiment_metadata_values: [],
        experiment_dataset_id: datasetId,
        experiment_item_id: randomUUID(),
        experiment_item_version: null,
        experiment_item_root_span_id: rootSpanId,
        start_time: (now - 3500) * 1000, // Root span start (convert to microseconds)
        end_time: (now - 2500) * 1000, // Root span end: latency = 1000ms (convert to microseconds)
      });

      const childSpan1Id = randomUUID();
      const event2 = createEvent({
        id: randomUUID(),
        span_id: childSpan1Id,
        project_id: projectId,
        trace_id: trace1Id,
        type: "GENERATION",
        name: "child-generation-1",
        parent_span_id: event1.span_id,
        experiment_id: experimentId,
        experiment_name: experimentName,
        experiment_metadata_names: [],
        experiment_metadata_values: [],
        experiment_dataset_id: datasetId,
        experiment_item_id: event1.experiment_item_id,
        experiment_item_version: null,
        experiment_item_root_span_id: event1.experiment_item_root_span_id,
        start_time: (now - 3400) * 1000,
        end_time: (now - 3000) * 1000,
      });

      const childSpan2Id = randomUUID();
      const event3 = createEvent({
        id: randomUUID(),
        span_id: childSpan2Id,
        project_id: projectId,
        trace_id: trace1Id,
        type: "GENERATION",
        name: "child-generation-2",
        parent_span_id: event1.span_id,
        experiment_id: experimentId,
        experiment_name: experimentName,
        experiment_metadata_names: [],
        experiment_metadata_values: [],
        experiment_dataset_id: datasetId,
        experiment_item_id: event1.experiment_item_id,
        experiment_item_version: null,
        experiment_item_root_span_id: event1.experiment_item_root_span_id,
        start_time: (now - 3000) * 1000,
        end_time: (now - 1500) * 1000, // Child spans are NOT included in latency calculation
      });

      // Trace 2: Single event with known latency (1000ms)
      const trace2Id = randomUUID();
      const rootSpan2Id = randomUUID();
      const event4 = createEvent({
        id: randomUUID(),
        span_id: rootSpan2Id,
        project_id: projectId,
        trace_id: trace2Id,
        type: "GENERATION",
        name: "single-generation",
        experiment_id: experimentId,
        experiment_name: experimentName,
        experiment_metadata_names: [],
        experiment_metadata_values: [],
        experiment_dataset_id: datasetId,
        experiment_item_id: randomUUID(),
        experiment_item_version: null,
        experiment_item_root_span_id: rootSpan2Id,
        start_time: (now - 2500) * 1000, // Root span start (convert to microseconds)
        end_time: (now - 1500) * 1000, // Root span end: latency = 1000ms (convert to microseconds)
      });

      await createEventsCh([event1, event2, event3, event4]);

      const metrics = await getExperimentMetricsFromEvents({
        projectId,
        experimentIds: [experimentId],
      });

      expect(metrics).toHaveLength(1);
      const metric = metrics[0];

      expect(metric.id).toBe(experimentId);
      expect(metric.latencyAvg).toBeDefined();
      expect(typeof metric.latencyAvg).toBe("number");

      // Latency avg = (1000ms + 1000ms) / 2 = 1000ms (only root spans count)
      expect(metric.latencyAvg).toBeCloseTo(1000, -1); // Within 10ms tolerance
    });

    it("should handle cost calculations correctly", async () => {
      const experimentId = randomUUID();
      const experimentName = "cost-test-" + randomUUID();
      const datasetId = randomUUID();

      const now = new Date().getTime();

      // Trace 1: Multiple events with costs (parent + 2 children)
      const trace1Id = randomUUID();
      const rootSpanId = randomUUID();
      const event1 = createEvent({
        id: randomUUID(),
        span_id: rootSpanId,
        project_id: projectId,
        trace_id: trace1Id,
        type: "GENERATION",
        name: "parent-generation",
        experiment_id: experimentId,
        experiment_name: experimentName,
        experiment_metadata_names: [],
        experiment_metadata_values: [],
        experiment_dataset_id: datasetId,
        experiment_item_id: randomUUID(),
        experiment_item_version: null,
        experiment_item_root_span_id: rootSpanId,
        start_time: (now - 3500) * 1000,
        end_time: (now - 2500) * 1000,
        cost_details: { total: 0 }, // Parent has no direct cost
      });

      const event2 = createEvent({
        id: randomUUID(),
        span_id: randomUUID(),
        project_id: projectId,
        trace_id: trace1Id,
        type: "GENERATION",
        name: "child-generation-1",
        parent_span_id: event1.span_id,
        experiment_id: experimentId,
        experiment_name: experimentName,
        experiment_metadata_names: [],
        experiment_metadata_values: [],
        experiment_dataset_id: datasetId,
        experiment_item_id: event1.experiment_item_id,
        experiment_item_version: null,
        experiment_item_root_span_id: event1.experiment_item_root_span_id,
        start_time: (now - 3400) * 1000,
        end_time: (now - 3000) * 1000,
        cost_details: { total: 0.005 }, // Child 1 cost
      });

      const event3 = createEvent({
        id: randomUUID(),
        span_id: randomUUID(),
        project_id: projectId,
        trace_id: trace1Id,
        type: "GENERATION",
        name: "child-generation-2",
        parent_span_id: event1.span_id,
        experiment_id: experimentId,
        experiment_name: experimentName,
        experiment_metadata_names: [],
        experiment_metadata_values: [],
        experiment_dataset_id: datasetId,
        experiment_item_id: event1.experiment_item_id,
        experiment_item_version: null,
        experiment_item_root_span_id: event1.experiment_item_root_span_id,
        start_time: (now - 3000) * 1000,
        end_time: (now - 2600) * 1000,
        cost_details: { total: 0.008765 }, // Child 2 cost (total = 0.013765)
      });

      // Trace 2: Single event with cost
      const trace2Id = randomUUID();
      const rootSpan2Id = randomUUID();
      const event4 = createEvent({
        id: randomUUID(),
        span_id: rootSpan2Id,
        project_id: projectId,
        trace_id: trace2Id,
        type: "GENERATION",
        name: "single-generation",
        experiment_id: experimentId,
        experiment_name: experimentName,
        experiment_metadata_names: [],
        experiment_metadata_values: [],
        experiment_dataset_id: datasetId,
        experiment_item_id: randomUUID(),
        experiment_item_version: null,
        experiment_item_root_span_id: rootSpan2Id,
        start_time: (now - 2500) * 1000,
        end_time: (now - 1500) * 1000,
        cost_details: { total: 0.1 }, // Single event cost
      });

      await createEventsCh([event1, event2, event3, event4]);

      const metrics = await getExperimentMetricsFromEvents({
        projectId,
        experimentIds: [experimentId],
      });

      expect(metrics).toHaveLength(1);
      const metric = metrics[0];

      expect(metric.id).toBe(experimentId);
      expect(metric.totalCost).toBeDefined();
      expect(typeof metric.totalCost).toBe("number");

      // Total cost should be:
      // Trace 1: 0 + 0.005 + 0.008765 = 0.013765
      // Trace 2: 0.1
      // Total: 0.113765
      expect(metric.totalCost).toBeCloseTo(0.113765, 6);
    });

    it("should include correct enriched data (latency and costs) in experiment list", async () => {
      const experimentId = randomUUID();
      const experimentName = "enriched-test-" + randomUUID();
      const datasetId = randomUUID();

      const now = new Date().getTime();

      // Create trace with both latency and cost data
      const traceId = randomUUID();
      const rootSpanId = randomUUID();
      const event1 = createEvent({
        id: randomUUID(),
        span_id: rootSpanId,
        project_id: projectId,
        trace_id: traceId,
        type: "GENERATION",
        name: "test-generation",
        experiment_id: experimentId,
        experiment_name: experimentName,
        experiment_metadata_names: [],
        experiment_metadata_values: [],
        experiment_dataset_id: datasetId,
        experiment_item_id: randomUUID(),
        experiment_item_version: null,
        experiment_item_root_span_id: rootSpanId,
        start_time: (now - 2000) * 1000,
        end_time: (now - 1000) * 1000, // 1000ms latency
        cost_details: { total: 0.05 },
      });

      await createEventsCh([event1]);

      // Fetch experiment with metrics
      const metrics = await getExperimentMetricsFromEvents({
        projectId,
        experimentIds: [experimentId],
      });

      expect(metrics).toHaveLength(1);
      const metric = metrics[0];

      // Verify both latency and cost are present and properly typed
      expect(metric.latencyAvg).toBeDefined();
      expect(typeof metric.latencyAvg).toBe("number");
      expect(metric.latencyAvg).toBeCloseTo(1000, -1);

      expect(metric.totalCost).toBeDefined();
      expect(typeof metric.totalCost).toBe("number");
      expect(metric.totalCost).toBeCloseTo(0.05, 6);
    });

    it("should filter by trace_scores_avg with a threshold", async () => {
      const experimentId1 = randomUUID();
      const experimentName1 = "score-filter-test-1-" + randomUUID();
      const experimentId2 = randomUUID();
      const experimentName2 = "score-filter-test-2-" + randomUUID();
      const datasetId = randomUUID();

      const now = new Date().getTime();
      const scoreName = "accuracy";

      // Experiment 1: Two items with scores averaging to 0.8
      // Item 1: score = 0.7
      // Item 2: score = 0.9
      // Average = 0.8
      const trace1aId = randomUUID();
      const trace1bId = randomUUID();

      const event1a = createEvent({
        id: randomUUID(),
        span_id: randomUUID(),
        project_id: projectId,
        trace_id: trace1aId,
        type: "GENERATION",
        name: "test-generation",
        experiment_id: experimentId1,
        experiment_name: experimentName1,
        experiment_metadata_names: [],
        experiment_metadata_values: [],
        experiment_dataset_id: datasetId,
        experiment_item_id: randomUUID(),
        experiment_item_version: null,
        experiment_item_root_span_id: randomUUID(),
        start_time: now * 1000,
      });

      const rootSpanId2 = randomUUID();
      const event1b = createEvent({
        id: randomUUID(),
        span_id: rootSpanId2,
        project_id: projectId,
        trace_id: trace1bId,
        type: "GENERATION",
        name: "test-generation",
        experiment_id: experimentId1,
        experiment_name: experimentName1,
        experiment_metadata_names: [],
        experiment_metadata_values: [],
        experiment_dataset_id: datasetId,
        experiment_item_id: randomUUID(),
        experiment_item_version: null,
        experiment_item_root_span_id: rootSpanId2,
        start_time: now * 1000,
      });

      // Experiment 2: Two items with scores averaging to 0.5
      // Item 1: score = 0.4
      // Item 2: score = 0.6
      // Average = 0.5
      const trace2aId = randomUUID();
      const trace2bId = randomUUID();

      const rootSpanId3 = randomUUID();
      const event2a = createEvent({
        id: randomUUID(),
        span_id: rootSpanId3,
        project_id: projectId,
        trace_id: trace2aId,
        type: "GENERATION",
        name: "test-generation",
        experiment_id: experimentId2,
        experiment_name: experimentName2,
        experiment_metadata_names: [],
        experiment_metadata_values: [],
        experiment_dataset_id: datasetId,
        experiment_item_id: randomUUID(),
        experiment_item_version: null,
        experiment_item_root_span_id: rootSpanId3,
        start_time: now * 1000,
      });

      const rootSpanId4 = randomUUID();
      const event2b = createEvent({
        id: randomUUID(),
        span_id: rootSpanId4,
        project_id: projectId,
        trace_id: trace2bId,
        type: "GENERATION",
        name: "test-generation",
        experiment_id: experimentId2,
        experiment_name: experimentName2,
        experiment_metadata_names: [],
        experiment_metadata_values: [],
        experiment_dataset_id: datasetId,
        experiment_item_id: randomUUID(),
        experiment_item_version: null,
        experiment_item_root_span_id: rootSpanId4,
        start_time: now * 1000,
      });

      await createEventsCh([event1a, event1b, event2a, event2b]);

      // Create scores for experiment 1 traces (avg = 0.8)
      const score1a = createTraceScore({
        project_id: projectId,
        trace_id: trace1aId,
        observation_id: null,
        name: scoreName,
        value: 0.7,
        source: "API",
        data_type: "NUMERIC",
      });
      const score1b = createTraceScore({
        project_id: projectId,
        trace_id: trace1bId,
        observation_id: null,
        name: scoreName,
        value: 0.9,
        source: "API",
        data_type: "NUMERIC",
      });

      // Create scores for experiment 2 traces (avg = 0.5)
      const score2a = createTraceScore({
        project_id: projectId,
        trace_id: trace2aId,
        observation_id: null,
        name: scoreName,
        value: 0.4,
        source: "API",
        data_type: "NUMERIC",
      });
      const score2b = createTraceScore({
        project_id: projectId,
        trace_id: trace2bId,
        observation_id: null,
        name: scoreName,
        value: 0.6,
        source: "API",
        data_type: "NUMERIC",
      });

      await createScoresCh([score1a, score1b, score2a, score2b]);

      // Filter for experiments where score avg > 0.6
      // Should only return experiment 1 (avg = 0.8)
      const result = await getExperimentsFromEvents({
        projectId,
        filter: [
          {
            column: "trace_scores_avg",
            type: "numberObject",
            key: scoreName,
            operator: ">",
            value: 0.6,
          },
        ],
        limit: 1000,
        page: 0,
      });

      // Should only return experimentId1 (avg = 0.8 > 0.6)
      const matchingExperiment = result.find((e) => e.id === experimentId1);
      const excludedExperiment = result.find((e) => e.id === experimentId2);

      expect(matchingExperiment).toBeDefined();
      expect(matchingExperiment?.id).toBe(experimentId1);
      expect(matchingExperiment?.name).toBe(experimentName1);

      expect(excludedExperiment).toBeUndefined(); // avg = 0.5 < 0.6
    });

    it("should filter experiments by name with equals operator", async () => {
      const experimentId1 = randomUUID();
      const experimentName1 = "exact-match-name-" + randomUUID();
      const experimentId2 = randomUUID();
      const experimentName2 = "different-name-" + randomUUID();
      const datasetId = randomUUID();

      const now = new Date().getTime();

      const rootSpanId5 = randomUUID();
      const event1 = createEvent({
        id: randomUUID(),
        span_id: rootSpanId5,
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
        experiment_item_version: null,
        experiment_item_root_span_id: rootSpanId5,
        start_time: now * 1000,
      });

      const rootSpanId6 = randomUUID();
      const event2 = createEvent({
        id: randomUUID(),
        span_id: rootSpanId6,
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
        experiment_item_version: null,
        experiment_item_root_span_id: rootSpanId6,
        start_time: now * 1000,
      });

      await createEventsCh([event1, event2]);

      const result = await getExperimentsFromEvents({
        projectId,
        filter: [
          {
            column: "name",
            type: "string",
            operator: "=",
            value: experimentName1,
          },
        ],
        limit: 1000,
        page: 0,
      });

      const matchingExperiment = result.find((e) => e.id === experimentId1);
      const excludedExperiment = result.find((e) => e.id === experimentId2);

      expect(matchingExperiment).toBeDefined();
      expect(matchingExperiment?.name).toBe(experimentName1);
      expect(excludedExperiment).toBeUndefined();
    });

    it("should filter experiments by name with contains operator", async () => {
      const uniquePrefix = randomUUID().substring(0, 8);
      const experimentId1 = randomUUID();
      const experimentName1 = `prefix-${uniquePrefix}-suffix`;
      const experimentId2 = randomUUID();
      const experimentName2 = "no-match-here-" + randomUUID();
      const datasetId = randomUUID();

      const now = new Date().getTime();

      const rootSpanId7 = randomUUID();
      const event1 = createEvent({
        id: randomUUID(),
        span_id: rootSpanId7,
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
        experiment_item_version: null,
        experiment_item_root_span_id: rootSpanId7,
        start_time: now * 1000,
      });

      const rootSpanId8 = randomUUID();
      const event2 = createEvent({
        id: randomUUID(),
        span_id: rootSpanId8,
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
        experiment_item_version: null,
        experiment_item_root_span_id: rootSpanId8,
        start_time: now * 1000,
      });

      await createEventsCh([event1, event2]);

      const result = await getExperimentsFromEvents({
        projectId,
        filter: [
          {
            column: "name",
            type: "string",
            operator: "contains",
            value: uniquePrefix,
          },
        ],
        limit: 1000,
        page: 0,
      });

      const matchingExperiment = result.find((e) => e.id === experimentId1);
      const excludedExperiment = result.find((e) => e.id === experimentId2);

      expect(matchingExperiment).toBeDefined();
      expect(matchingExperiment?.name).toBe(experimentName1);
      expect(excludedExperiment).toBeUndefined();
    });

    it("should filter experiments by metadata key-value with equals operator", async () => {
      const experimentId1 = randomUUID();
      const experimentName1 = "metadata-test-1-" + randomUUID();
      const experimentId2 = randomUUID();
      const experimentName2 = "metadata-test-2-" + randomUUID();
      const datasetId = randomUUID();

      const now = new Date().getTime();
      const uniqueEnvValue = "production-" + randomUUID().substring(0, 8);

      // Experiment 1: Has matching metadata
      const rootSpanId9 = randomUUID();
      const event1 = createEvent({
        id: randomUUID(),
        span_id: rootSpanId9,
        project_id: projectId,
        trace_id: randomUUID(),
        type: "GENERATION",
        name: "test-generation",
        experiment_id: experimentId1,
        experiment_name: experimentName1,
        experiment_metadata_names: ["environment", "version"],
        experiment_metadata_values: [uniqueEnvValue, "1.0.0"],
        experiment_dataset_id: datasetId,
        experiment_item_id: randomUUID(),
        experiment_item_version: null,
        experiment_item_root_span_id: rootSpanId9,
        start_time: now * 1000,
      });

      // Experiment 2: Has different metadata
      const rootSpanId10 = randomUUID();
      const event2 = createEvent({
        id: randomUUID(),
        span_id: rootSpanId10,
        project_id: projectId,
        trace_id: randomUUID(),
        type: "GENERATION",
        name: "test-generation",
        experiment_id: experimentId2,
        experiment_name: experimentName2,
        experiment_metadata_names: ["environment", "version"],
        experiment_metadata_values: ["staging", "2.0.0"],
        experiment_dataset_id: datasetId,
        experiment_item_id: randomUUID(),
        experiment_item_version: null,
        experiment_item_root_span_id: rootSpanId10,
        start_time: now * 1000,
      });

      await createEventsCh([event1, event2]);

      const result = await getExperimentsFromEvents({
        projectId,
        filter: [
          {
            column: "metadata",
            type: "stringObject",
            operator: "=",
            key: "environment",
            value: uniqueEnvValue,
          },
        ],
        limit: 1000,
        page: 0,
      });

      const matchingExperiment = result.find((e) => e.id === experimentId1);
      const excludedExperiment = result.find((e) => e.id === experimentId2);

      expect(matchingExperiment).toBeDefined();
      expect(matchingExperiment?.name).toBe(experimentName1);
      expect(matchingExperiment?.metadata).toEqual({
        environment: uniqueEnvValue,
        version: "1.0.0",
      });
      expect(excludedExperiment).toBeUndefined();
    });

    it("should filter experiments by metadata with contains operator", async () => {
      const experimentId1 = randomUUID();
      const experimentName1 = "metadata-contains-1-" + randomUUID();
      const experimentId2 = randomUUID();
      const experimentName2 = "metadata-contains-2-" + randomUUID();
      const datasetId = randomUUID();

      const now = new Date().getTime();
      const uniqueSubstring = randomUUID().substring(0, 8);

      // Experiment 1: Has metadata with substring
      const rootSpanId11 = randomUUID();
      const event1 = createEvent({
        id: randomUUID(),
        span_id: rootSpanId11,
        project_id: projectId,
        trace_id: randomUUID(),
        type: "GENERATION",
        name: "test-generation",
        experiment_id: experimentId1,
        experiment_name: experimentName1,
        experiment_metadata_names: ["description"],
        experiment_metadata_values: [`test-${uniqueSubstring}-experiment`],
        experiment_dataset_id: datasetId,
        experiment_item_id: randomUUID(),
        experiment_item_version: null,
        experiment_item_root_span_id: rootSpanId11,
        start_time: now * 1000,
      });

      // Experiment 2: Has metadata without substring
      const rootSpanId12 = randomUUID();
      const event2 = createEvent({
        id: randomUUID(),
        span_id: rootSpanId12,
        project_id: projectId,
        trace_id: randomUUID(),
        type: "GENERATION",
        name: "test-generation",
        experiment_id: experimentId2,
        experiment_name: experimentName2,
        experiment_metadata_names: ["description"],
        experiment_metadata_values: ["completely-different-value"],
        experiment_dataset_id: datasetId,
        experiment_item_id: randomUUID(),
        experiment_item_version: null,
        experiment_item_root_span_id: rootSpanId12,
        start_time: now * 1000,
      });

      await createEventsCh([event1, event2]);

      const result = await getExperimentsFromEvents({
        projectId,
        filter: [
          {
            column: "metadata",
            type: "stringObject",
            operator: "contains",
            key: "description",
            value: uniqueSubstring,
          },
        ],
        limit: 1000,
        page: 0,
      });

      const matchingExperiment = result.find((e) => e.id === experimentId1);
      const excludedExperiment = result.find((e) => e.id === experimentId2);

      expect(matchingExperiment).toBeDefined();
      expect(matchingExperiment?.name).toBe(experimentName1);
      expect(excludedExperiment).toBeUndefined();
    });

    it("should handle experiments without metadata gracefully when filtering", async () => {
      const experimentId1 = randomUUID();
      const experimentName1 = "with-metadata-" + randomUUID();
      const experimentId2 = randomUUID();
      const experimentName2 = "without-metadata-" + randomUUID();
      const datasetId = randomUUID();

      const now = new Date().getTime();
      const uniqueEnvValue = "production-" + randomUUID().substring(0, 8);

      // Experiment 1: Has matching metadata
      const rootSpanId13 = randomUUID();
      const event1 = createEvent({
        id: randomUUID(),
        span_id: rootSpanId13,
        project_id: projectId,
        trace_id: randomUUID(),
        type: "GENERATION",
        name: "test-generation",
        experiment_id: experimentId1,
        experiment_name: experimentName1,
        experiment_metadata_names: ["environment"],
        experiment_metadata_values: [uniqueEnvValue],
        experiment_dataset_id: datasetId,
        experiment_item_id: randomUUID(),
        experiment_item_version: null,
        experiment_item_root_span_id: rootSpanId13,
        start_time: now * 1000,
      });

      // Experiment 2: Has NO metadata
      const rootSpanId14 = randomUUID();
      const event2 = createEvent({
        id: randomUUID(),
        span_id: rootSpanId14,
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
        experiment_item_version: null,
        experiment_item_root_span_id: rootSpanId14,
        start_time: now * 1000,
      });

      await createEventsCh([event1, event2]);

      const result = await getExperimentsFromEvents({
        projectId,
        filter: [
          {
            column: "metadata",
            type: "stringObject",
            operator: "=",
            key: "environment",
            value: uniqueEnvValue,
          },
        ],
        limit: 1000,
        page: 0,
      });

      const matchingExperiment = result.find((e) => e.id === experimentId1);
      const excludedExperiment = result.find((e) => e.id === experimentId2);

      expect(matchingExperiment).toBeDefined();
      expect(matchingExperiment?.name).toBe(experimentName1);
      // Experiment without metadata should not match
      expect(excludedExperiment).toBeUndefined();
    });
  });
});
