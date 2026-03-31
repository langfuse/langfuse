import {
  createEvent,
  createEventsCh,
  createScoresCh,
  getExperimentItemsFromEvents,
  getExperimentItemsCountFromEvents,
  getExperimentItemsBatchIO,
  createTraceScore,
  type EventRecordInsertType,
} from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";
import { env } from "@/src/env.mjs";
import { type FilterCondition } from "@langfuse/shared";

/**
 * Helper to create an experiment event with experiment-specific fields populated.
 * Wraps createEvent with experiment defaults.
 */
function createExperimentEvent(
  params: Partial<EventRecordInsertType> & {
    experimentId: string;
    experimentName: string;
    datasetId?: string;
    itemId: string;
    experimentItemRootSpanId: string;
  },
): EventRecordInsertType {
  const {
    experimentId,
    experimentName,
    datasetId,
    itemId,
    experimentItemRootSpanId,
    ...rest
  } = params;

  return createEvent({
    experiment_id: experimentId,
    experiment_name: experimentName,
    experiment_dataset_id: datasetId,
    experiment_item_id: itemId,
    experiment_item_root_span_id: experimentItemRootSpanId,
    ...rest,
  });
}

/**
 * Helper to create a root observation score.
 * Score is attached to the root span (observation_id = root_span_id).
 */
function createRootObservationScore(params: {
  projectId: string;
  traceId: string;
  rootObservationId: string;
  scoreName: string;
  value: number;
  stringValue?: string;
  dataType?: "NUMERIC" | "CATEGORICAL" | "BOOLEAN";
}) {
  const {
    projectId,
    traceId,
    rootObservationId,
    scoreName,
    value,
    stringValue,
    dataType = "NUMERIC",
  } = params;

  return createTraceScore({
    project_id: projectId,
    trace_id: traceId,
    observation_id: rootObservationId, // Root observation score
    name: scoreName,
    value: value,
    string_value: stringValue ?? null,
    data_type: dataType,
  });
}

const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

const maybe =
  env.LANGFUSE_ENABLE_EVENTS_TABLE_OBSERVATIONS === "true"
    ? describe
    : describe.skip;

describe("Clickhouse Experiment Items Repository Test", () => {
  it("should kill redis connection", () => {
    // we need at least one test case to avoid hanging
    // redis connection when everything else is skipped.
  });

  maybe("getExperimentItemsFromEvents - Score Filtering", () => {
    it("should filter items by trace-level numeric scores", async () => {
      // GIVEN: One item with trace-level score
      const baselineExpId = randomUUID();
      const datasetId = randomUUID();
      const item1Id = randomUUID();
      const item1TraceId = randomUUID();
      const item1RootId = randomUUID();

      const event = createExperimentEvent({
        project_id: projectId,
        trace_id: item1TraceId,
        span_id: item1RootId,
        experimentId: baselineExpId,
        experimentName: "baseline-exp",
        datasetId: datasetId,
        itemId: item1Id,
        experimentItemRootSpanId: item1RootId,
        start_time: Date.now() * 1000,
      });

      // Create trace-level score (observation_id IS NULL)
      const score = createTraceScore({
        project_id: projectId,
        trace_id: item1TraceId,
        observation_id: null, // Trace-level score
        name: "accuracy",
        value: 0.8,
        data_type: "NUMERIC",
      });

      await createEventsCh([event]);
      await createScoresCh([score]);

      // WHEN: Filter for trace scores > 0.5
      const result = await getExperimentItemsFromEvents({
        projectId,
        baseExperimentId: baselineExpId,
        compExperimentIds: [],
        filterByExperiment: [
          {
            experimentId: baselineExpId,
            filters: [
              {
                column: "trace_scores_avg",
                type: "numberObject",
                key: "accuracy",
                operator: ">",
                value: 0.5,
              } as FilterCondition,
            ],
          },
        ],
        limit: 10,
        offset: 0,
      });

      // THEN: Item should be returned
      expect(result).toHaveLength(1);
      expect(result[0].itemId).toBe(item1Id);
    });

    it("should filter items by root observation numeric scores", async () => {
      // GIVEN: One item with root observation score
      const baselineExpId = randomUUID();
      const datasetId = randomUUID();
      const item1Id = randomUUID();
      const item1TraceId = randomUUID();
      const item1RootId = randomUUID();

      const event = createExperimentEvent({
        project_id: projectId,
        trace_id: item1TraceId,
        span_id: item1RootId,
        experimentId: baselineExpId,
        experimentName: "baseline-exp",
        datasetId: datasetId,
        itemId: item1Id,
        experimentItemRootSpanId: item1RootId,
        start_time: Date.now() * 1000,
      });

      // Create root observation score (observation_id = root_span_id)
      const score = createRootObservationScore({
        projectId,
        traceId: item1TraceId,
        rootObservationId: item1RootId,
        scoreName: "quality",
        value: 0.9,
      });

      await createEventsCh([event]);
      await createScoresCh([score]);

      // WHEN: Filter for observation scores >= 0.8
      const result = await getExperimentItemsFromEvents({
        projectId,
        baseExperimentId: baselineExpId,
        compExperimentIds: [],
        filterByExperiment: [
          {
            experimentId: baselineExpId,
            filters: [
              {
                column: "obs_scores_avg",
                type: "numberObject",
                key: "quality",
                operator: ">=",
                value: 0.8,
              } as FilterCondition,
            ],
          },
        ],
        limit: 10,
        offset: 0,
      });

      // THEN: Item should be returned
      expect(result).toHaveLength(1);
      expect(result[0].itemId).toBe(item1Id);
    });

    it("should NOT include non-root observation scores in filtering", async () => {
      // GIVEN: Item with child observation score (not root)
      const baselineExpId = randomUUID();
      const datasetId = randomUUID();
      const itemId = randomUUID();
      const traceId = randomUUID();
      const rootSpanId = randomUUID();
      const childSpanId = randomUUID();

      // Root observation event
      const rootEvent = createExperimentEvent({
        project_id: projectId,
        trace_id: traceId,
        span_id: rootSpanId,
        experimentId: baselineExpId,
        experimentName: "baseline-exp",
        datasetId: datasetId,
        itemId: itemId,
        experimentItemRootSpanId: rootSpanId,
        start_time: Date.now() * 1000,
      });

      // Child observation event (not the root)
      const childEvent = createEvent({
        project_id: projectId,
        trace_id: traceId,
        span_id: childSpanId,
        parent_span_id: rootSpanId,
        start_time: Date.now() * 1000,
      });

      // Score on child observation (should NOT be counted)
      const childScore = createTraceScore({
        project_id: projectId,
        trace_id: traceId,
        observation_id: childSpanId, // Child observation
        name: "quality",
        value: 0.9,
        data_type: "NUMERIC",
      });

      await createEventsCh([rootEvent, childEvent]);
      await createScoresCh([childScore]);

      // WHEN: Filter for observation scores >= 0.8
      const result = await getExperimentItemsFromEvents({
        projectId,
        baseExperimentId: baselineExpId,
        compExperimentIds: [],
        filterByExperiment: [
          {
            experimentId: baselineExpId,
            filters: [
              {
                column: "obs_scores_avg",
                type: "numberObject",
                key: "quality",
                operator: ">=",
                value: 0.8,
              } as FilterCondition,
            ],
          },
        ],
        limit: 10,
        offset: 0,
      });

      // THEN: Item should NOT be returned (child score doesn't count)
      expect(result).toHaveLength(0);
    });

    it("should combine trace-level AND observation-level score filters", async () => {
      // GIVEN: Items with varying trace and observation scores
      const baselineExpId = randomUUID();
      const datasetId = randomUUID();

      // Item 1: Has both trace and observation scores that match
      const item1Id = randomUUID();
      const item1TraceId = randomUUID();
      const item1RootId = randomUUID();

      const event1 = createExperimentEvent({
        project_id: projectId,
        trace_id: item1TraceId,
        span_id: item1RootId,
        experimentId: baselineExpId,
        experimentName: "baseline-exp",
        datasetId: datasetId,
        itemId: item1Id,
        experimentItemRootSpanId: item1RootId,
        start_time: Date.now() * 1000,
      });

      const traceScore1 = createTraceScore({
        project_id: projectId,
        trace_id: item1TraceId,
        observation_id: null,
        name: "accuracy",
        value: 0.8,
        data_type: "NUMERIC",
      });

      const obsScore1 = createRootObservationScore({
        projectId,
        traceId: item1TraceId,
        rootObservationId: item1RootId,
        scoreName: "quality",
        value: 0.9,
      });

      // Item 2: Only has trace score (should be excluded)
      const item2Id = randomUUID();
      const item2TraceId = randomUUID();
      const item2RootId = randomUUID();

      const event2 = createExperimentEvent({
        project_id: projectId,
        trace_id: item2TraceId,
        span_id: item2RootId,
        experimentId: baselineExpId,
        experimentName: "baseline-exp",
        datasetId: datasetId,
        itemId: item2Id,
        experimentItemRootSpanId: item2RootId,
        start_time: Date.now() * 1000 + 1000,
      });

      const traceScore2 = createTraceScore({
        project_id: projectId,
        trace_id: item2TraceId,
        observation_id: null,
        name: "accuracy",
        value: 0.9,
        data_type: "NUMERIC",
      });

      await createEventsCh([event1, event2]);
      await createScoresCh([traceScore1, obsScore1, traceScore2]);

      // WHEN: Filter for BOTH trace scores > 0.7 AND observation scores > 0.8
      const result = await getExperimentItemsFromEvents({
        projectId,
        baseExperimentId: baselineExpId,
        compExperimentIds: [],
        filterByExperiment: [
          {
            experimentId: baselineExpId,
            filters: [
              {
                column: "trace_scores_avg",
                type: "numberObject",
                key: "accuracy",
                operator: ">",
                value: 0.7,
              } as FilterCondition,
              {
                column: "obs_scores_avg",
                type: "numberObject",
                key: "quality",
                operator: ">",
                value: 0.8,
              } as FilterCondition,
            ],
          },
        ],
        limit: 10,
        offset: 0,
      });

      // THEN: Only item1 should be returned (has both scores)
      expect(result).toHaveLength(1);
      expect(result[0].itemId).toBe(item1Id);
    });
  });

  maybe("getExperimentItemsFromEvents - Iterations", () => {
    it("should return deterministic latest trace with multiple iterations", async () => {
      // GIVEN: Same dataset item with 3 traces at different start_times
      const baselineExpId = randomUUID();
      const datasetId = randomUUID();
      const itemId = randomUUID();

      const trace1Id = randomUUID();
      const root1Id = randomUUID();
      const trace2Id = randomUUID();
      const root2Id = randomUUID();
      const trace3Id = randomUUID();
      const root3Id = randomUUID();

      const now = Date.now() * 1000;

      // Create 3 iterations with different start times
      const event1 = createExperimentEvent({
        project_id: projectId,
        trace_id: trace1Id,
        span_id: root1Id,
        experimentId: baselineExpId,
        experimentName: "baseline-exp",
        datasetId: datasetId,
        itemId: itemId,
        experimentItemRootSpanId: root1Id,
        start_time: now, // Oldest
      });

      const event2 = createExperimentEvent({
        project_id: projectId,
        trace_id: trace2Id,
        span_id: root2Id,
        experimentId: baselineExpId,
        experimentName: "baseline-exp",
        datasetId: datasetId,
        itemId: itemId,
        experimentItemRootSpanId: root2Id,
        start_time: now + 1000000, // Middle
      });

      const event3 = createExperimentEvent({
        project_id: projectId,
        trace_id: trace3Id,
        span_id: root3Id,
        experimentId: baselineExpId,
        experimentName: "baseline-exp",
        datasetId: datasetId,
        itemId: itemId,
        experimentItemRootSpanId: root3Id,
        start_time: now + 2000000, // Latest
      });

      await createEventsCh([event1, event2, event3]);

      // WHEN: Query multiple times
      const result1 = await getExperimentItemsFromEvents({
        projectId,
        baseExperimentId: baselineExpId,
        compExperimentIds: [],
        filterByExperiment: [],
        limit: 10,
        offset: 0,
      });

      const result2 = await getExperimentItemsFromEvents({
        projectId,
        baseExperimentId: baselineExpId,
        compExperimentIds: [],
        filterByExperiment: [],
        limit: 10,
        offset: 0,
      });

      // THEN: Should return the latest trace (trace3) deterministically
      expect(result1).toHaveLength(1);
      expect(result1[0].itemId).toBe(itemId);
      expect(result1[0].experiments).toHaveLength(1);
      expect(result1[0].experiments[0].traceId).toBe(trace3Id); // Latest

      // Verify same result on second query
      expect(result2).toHaveLength(1);
      expect(result2[0].experiments[0].traceId).toBe(trace3Id);
    });

    it("should count multiple iterations as single item", async () => {
      // GIVEN: 2 items, item1 has 5 iterations, item2 has 1 iteration
      const baselineExpId = randomUUID();
      const datasetId = randomUUID();
      const item1Id = randomUUID();
      const item2Id = randomUUID();

      const now = Date.now() * 1000;
      const events = [];

      // Create 5 iterations for item1
      for (let i = 0; i < 5; i++) {
        const traceId = randomUUID();
        const rootId = randomUUID();
        events.push(
          createExperimentEvent({
            project_id: projectId,
            trace_id: traceId,
            span_id: rootId,
            experimentId: baselineExpId,
            experimentName: "baseline-exp",
            datasetId: datasetId,
            itemId: item1Id,
            experimentItemRootSpanId: rootId,
            start_time: now + i * 1000000,
          }),
        );
      }

      // Create 1 iteration for item2
      const trace2Id = randomUUID();
      const root2Id = randomUUID();
      events.push(
        createExperimentEvent({
          project_id: projectId,
          trace_id: trace2Id,
          span_id: root2Id,
          experimentId: baselineExpId,
          experimentName: "baseline-exp",
          datasetId: datasetId,
          itemId: item2Id,
          experimentItemRootSpanId: root2Id,
          start_time: now,
        }),
      );

      await createEventsCh(events);

      // WHEN: Get count and results
      const count = await getExperimentItemsCountFromEvents({
        projectId,
        baseExperimentId: baselineExpId,
        compExperimentIds: [],
        filterByExperiment: [],
      });

      const result = await getExperimentItemsFromEvents({
        projectId,
        baseExperimentId: baselineExpId,
        compExperimentIds: [],
        filterByExperiment: [],
        limit: 10,
        offset: 0,
      });

      // THEN: Count should be 2 (not 6), results should have 2 items
      expect(count).toBe(2);
      expect(result).toHaveLength(2);
    });
  });

  maybe("getExperimentItemsFromEvents - Combined Filters", () => {
    it("should filter by item metadata AND score filters together", async () => {
      // GIVEN: Items with different metadata and scores
      const baselineExpId = randomUUID();
      const datasetId = randomUUID();

      // Item 1: Has metadata and score that match
      const item1Id = randomUUID();
      const item1TraceId = randomUUID();
      const item1RootId = randomUUID();

      const event1 = createExperimentEvent({
        project_id: projectId,
        trace_id: item1TraceId,
        span_id: item1RootId,
        experimentId: baselineExpId,
        experimentName: "baseline-exp",
        datasetId: datasetId,
        itemId: item1Id,
        experimentItemRootSpanId: item1RootId,
        start_time: Date.now() * 1000,
        experiment_item_metadata_names: ["category"],
        experiment_item_metadata_values: ["test"],
      });

      const score1 = createTraceScore({
        project_id: projectId,
        trace_id: item1TraceId,
        observation_id: null,
        name: "accuracy",
        value: 0.8,
        data_type: "NUMERIC",
      });

      // Item 2: Has matching metadata but no score
      const item2Id = randomUUID();
      const item2TraceId = randomUUID();
      const item2RootId = randomUUID();

      const event2 = createExperimentEvent({
        project_id: projectId,
        trace_id: item2TraceId,
        span_id: item2RootId,
        experimentId: baselineExpId,
        experimentName: "baseline-exp",
        datasetId: datasetId,
        itemId: item2Id,
        experimentItemRootSpanId: item2RootId,
        start_time: Date.now() * 1000 + 1000,
        experiment_item_metadata_names: ["category"],
        experiment_item_metadata_values: ["test"],
      });

      await createEventsCh([event1, event2]);
      await createScoresCh([score1]);

      // WHEN: Filter for metadata AND score
      const result = await getExperimentItemsFromEvents({
        projectId,
        baseExperimentId: baselineExpId,
        compExperimentIds: [],
        filterByExperiment: [
          {
            experimentId: baselineExpId,
            filters: [
              {
                column: "itemMetadata",
                type: "stringObject",
                key: "category",
                operator: "=",
                value: "test",
              } as FilterCondition,
              {
                column: "trace_scores_avg",
                type: "numberObject",
                key: "accuracy",
                operator: ">",
                value: 0.5,
              } as FilterCondition,
            ],
          },
        ],
        limit: 10,
        offset: 0,
      });

      // THEN: Only item1 should be returned (has both)
      expect(result).toHaveLength(1);
      expect(result[0].itemId).toBe(item1Id);
    });

    it("should require baseline presence with filters applied", async () => {
      // GIVEN: 3 items, only 2 have baseline experiment data
      const baselineExpId = randomUUID();
      const compExpId = randomUUID();
      const datasetId = randomUUID();

      // Item 1: In baseline with matching score
      const item1Id = randomUUID();
      const item1TraceId = randomUUID();
      const item1RootId = randomUUID();

      const event1 = createExperimentEvent({
        project_id: projectId,
        trace_id: item1TraceId,
        span_id: item1RootId,
        experimentId: baselineExpId,
        experimentName: "baseline-exp",
        datasetId: datasetId,
        itemId: item1Id,
        experimentItemRootSpanId: item1RootId,
        start_time: Date.now() * 1000,
      });

      const score1 = createTraceScore({
        project_id: projectId,
        trace_id: item1TraceId,
        observation_id: null,
        name: "accuracy",
        value: 0.8,
        data_type: "NUMERIC",
      });

      // Item 2: In baseline with matching score
      const item2Id = randomUUID();
      const item2TraceId = randomUUID();
      const item2RootId = randomUUID();

      const event2 = createExperimentEvent({
        project_id: projectId,
        trace_id: item2TraceId,
        span_id: item2RootId,
        experimentId: baselineExpId,
        experimentName: "baseline-exp",
        datasetId: datasetId,
        itemId: item2Id,
        experimentItemRootSpanId: item2RootId,
        start_time: Date.now() * 1000 + 1000,
      });

      const score2 = createTraceScore({
        project_id: projectId,
        trace_id: item2TraceId,
        observation_id: null,
        name: "accuracy",
        value: 0.9,
        data_type: "NUMERIC",
      });

      // Item 3: Only in comparison experiment, NOT in baseline (but has matching score)
      const item3Id = randomUUID();
      const item3TraceId = randomUUID();
      const item3RootId = randomUUID();

      const event3 = createExperimentEvent({
        project_id: projectId,
        trace_id: item3TraceId,
        span_id: item3RootId,
        experimentId: compExpId, // NOT baseline
        experimentName: "comp-exp",
        datasetId: datasetId,
        itemId: item3Id,
        experimentItemRootSpanId: item3RootId,
        start_time: Date.now() * 1000 + 2000,
      });

      const score3 = createTraceScore({
        project_id: projectId,
        trace_id: item3TraceId,
        observation_id: null,
        name: "accuracy",
        value: 0.85,
        data_type: "NUMERIC",
      });

      await createEventsCh([event1, event2, event3]);
      await createScoresCh([score1, score2, score3]);

      // WHEN: Query with requireBaselinePresence=true and score filter
      const result = await getExperimentItemsFromEvents({
        projectId,
        baseExperimentId: baselineExpId,
        compExperimentIds: [compExpId],
        filterByExperiment: [
          {
            experimentId: compExpId,
            filters: [
              {
                column: "trace_scores_avg",
                type: "numberObject",
                key: "accuracy",
                operator: ">",
                value: 0.7,
              } as FilterCondition,
            ],
          },
        ],
        config: {
          requireBaselinePresence: true,
        },
        limit: 10,
        offset: 0,
      });

      // THEN: item3 should be excluded (not in baseline)
      expect(result.length).toBeLessThan(3);
      expect(result.map((r) => r.itemId)).not.toContain(item3Id);
    });
  });

  maybe("getExperimentItemsFromEvents - Essentials", () => {
    it("should paginate results correctly", async () => {
      // GIVEN: 10 items
      const baselineExpId = randomUUID();
      const datasetId = randomUUID();
      const now = Date.now() * 1000;

      const items = [];
      for (let i = 0; i < 10; i++) {
        const itemId = randomUUID();
        const traceId = randomUUID();
        const rootId = randomUUID();

        items.push({
          itemId,
          event: createExperimentEvent({
            project_id: projectId,
            trace_id: traceId,
            span_id: rootId,
            experimentId: baselineExpId,
            experimentName: "baseline-exp",
            datasetId: datasetId,
            itemId: itemId,
            experimentItemRootSpanId: rootId,
            start_time: now + i * 1000000,
          }),
        });
      }

      await createEventsCh(items.map((i) => i.event));

      // WHEN: Fetch page 0 (limit 3), page 1 (limit 3), page 2 (limit 3)
      const page0 = await getExperimentItemsFromEvents({
        projectId,
        baseExperimentId: baselineExpId,
        compExperimentIds: [],
        filterByExperiment: [],
        limit: 3,
        offset: 0,
      });

      const page1 = await getExperimentItemsFromEvents({
        projectId,
        baseExperimentId: baselineExpId,
        compExperimentIds: [],
        filterByExperiment: [],
        limit: 3,
        offset: 3,
      });

      const page2 = await getExperimentItemsFromEvents({
        projectId,
        baseExperimentId: baselineExpId,
        compExperimentIds: [],
        filterByExperiment: [],
        limit: 3,
        offset: 6,
      });

      // THEN: Should have 3, 3, 3 items with no duplicates
      expect(page0).toHaveLength(3);
      expect(page1).toHaveLength(3);
      expect(page2).toHaveLength(3);

      // Verify no duplicates
      const allItemIds = [
        ...page0.map((p) => p.itemId),
        ...page1.map((p) => p.itemId),
        ...page2.map((p) => p.itemId),
      ];
      const uniqueItemIds = new Set(allItemIds);
      expect(uniqueItemIds.size).toBe(9);
    });

    it("should return empty array when no items match filters", async () => {
      // GIVEN: 3 items with scores < 0.5
      const baselineExpId = randomUUID();
      const datasetId = randomUUID();
      const now = Date.now() * 1000;

      const events = [];
      const scores = [];
      for (let i = 0; i < 3; i++) {
        const itemId = randomUUID();
        const traceId = randomUUID();
        const rootId = randomUUID();

        events.push(
          createExperimentEvent({
            project_id: projectId,
            trace_id: traceId,
            span_id: rootId,
            experimentId: baselineExpId,
            experimentName: "baseline-exp",
            datasetId: datasetId,
            itemId: itemId,
            experimentItemRootSpanId: rootId,
            start_time: now + i * 1000000,
          }),
        );

        scores.push(
          createTraceScore({
            project_id: projectId,
            trace_id: traceId,
            observation_id: null,
            name: "accuracy",
            value: 0.3 + i * 0.1, // 0.3, 0.4, 0.5
            data_type: "NUMERIC",
          }),
        );
      }

      await createEventsCh(events);
      await createScoresCh(scores);

      // WHEN: Filter for scores > 0.8
      const result = await getExperimentItemsFromEvents({
        projectId,
        baseExperimentId: baselineExpId,
        compExperimentIds: [],
        filterByExperiment: [
          {
            experimentId: baselineExpId,
            filters: [
              {
                column: "trace_scores_avg",
                type: "numberObject",
                key: "accuracy",
                operator: ">",
                value: 0.8,
              } as FilterCondition,
            ],
          },
        ],
        limit: 10,
        offset: 0,
      });

      const count = await getExperimentItemsCountFromEvents({
        projectId,
        baseExperimentId: baselineExpId,
        compExperimentIds: [],
        filterByExperiment: [
          {
            experimentId: baselineExpId,
            filters: [
              {
                column: "trace_scores_avg",
                type: "numberObject",
                key: "accuracy",
                operator: ">",
                value: 0.8,
              } as FilterCondition,
            ],
          },
        ],
      });

      // THEN: Empty array and count = 0
      expect(result).toHaveLength(0);
      expect(count).toBe(0);
    });

    it("should return matching count for filtered results", async () => {
      // GIVEN: 10 items, 4 have scores > 0.7
      const baselineExpId = randomUUID();
      const datasetId = randomUUID();
      const now = Date.now() * 1000;

      const events = [];
      const scores = [];
      for (let i = 0; i < 10; i++) {
        const itemId = randomUUID();
        const traceId = randomUUID();
        const rootId = randomUUID();

        events.push(
          createExperimentEvent({
            project_id: projectId,
            trace_id: traceId,
            span_id: rootId,
            experimentId: baselineExpId,
            experimentName: "baseline-exp",
            datasetId: datasetId,
            itemId: itemId,
            experimentItemRootSpanId: rootId,
            start_time: now + i * 1000000,
          }),
        );

        // First 4 items have scores > 0.7
        scores.push(
          createTraceScore({
            project_id: projectId,
            trace_id: traceId,
            observation_id: null,
            name: "accuracy",
            value: i < 4 ? 0.8 + i * 0.05 : 0.5 + i * 0.02,
            data_type: "NUMERIC",
          }),
        );
      }

      await createEventsCh(events);
      await createScoresCh(scores);

      const filter = [
        {
          experimentId: baselineExpId,
          filters: [
            {
              column: "trace_scores_avg",
              type: "numberObject",
              key: "accuracy",
              operator: ">",
              value: 0.7,
            } as FilterCondition,
          ],
        },
      ];

      // WHEN: Get count and results with same filter
      const count = await getExperimentItemsCountFromEvents({
        projectId,
        baseExperimentId: baselineExpId,
        compExperimentIds: [],
        filterByExperiment: filter,
      });

      const result = await getExperimentItemsFromEvents({
        projectId,
        baseExperimentId: baselineExpId,
        compExperimentIds: [],
        filterByExperiment: filter,
        limit: 100,
        offset: 0,
      });

      // THEN: count = 4, results.length = 4
      expect(count).toBe(4);
      expect(result).toHaveLength(4);
    });
  });

  maybe("getExperimentItemsFromEvents - Item Visibility", () => {
    it("should respect requireBaselinePresence config", async () => {
      // GIVEN: Two items
      // - Item 1: exists in BOTH baseline and comparison experiments
      // - Item 2: exists ONLY in comparison experiment (not in baseline)
      const baselineExpId = randomUUID();
      const compExpId = randomUUID();
      const datasetId = randomUUID();

      const item1Id = randomUUID();
      const item1BaselineTraceId = randomUUID();
      const item1BaselineRootId = randomUUID();
      const item1CompTraceId = randomUUID();
      const item1CompRootId = randomUUID();

      const item2Id = randomUUID();
      const item2CompTraceId = randomUUID();
      const item2CompRootId = randomUUID();

      const now = Date.now() * 1000;

      // Item 1 in baseline
      const event1Baseline = createExperimentEvent({
        project_id: projectId,
        trace_id: item1BaselineTraceId,
        span_id: item1BaselineRootId,
        experimentId: baselineExpId,
        experimentName: "baseline-exp",
        datasetId: datasetId,
        itemId: item1Id,
        experimentItemRootSpanId: item1BaselineRootId,
        start_time: now,
      });

      // Item 1 in comparison
      const event1Comp = createExperimentEvent({
        project_id: projectId,
        trace_id: item1CompTraceId,
        span_id: item1CompRootId,
        experimentId: compExpId,
        experimentName: "comp-exp",
        datasetId: datasetId,
        itemId: item1Id,
        experimentItemRootSpanId: item1CompRootId,
        start_time: now + 1000,
      });

      // Item 2 ONLY in comparison (not in baseline)
      const event2Comp = createExperimentEvent({
        project_id: projectId,
        trace_id: item2CompTraceId,
        span_id: item2CompRootId,
        experimentId: compExpId,
        experimentName: "comp-exp",
        datasetId: datasetId,
        itemId: item2Id,
        experimentItemRootSpanId: item2CompRootId,
        start_time: now + 2000,
      });

      await createEventsCh([event1Baseline, event1Comp, event2Comp]);

      // WHEN: Query with requireBaselinePresence = true
      const resultWithBaseline = await getExperimentItemsFromEvents({
        projectId,
        baseExperimentId: baselineExpId,
        compExperimentIds: [compExpId],
        filterByExperiment: [],
        config: {
          requireBaselinePresence: true,
        },
        limit: 10,
        offset: 0,
      });

      // THEN: Should only return item1 (has baseline)
      expect(resultWithBaseline).toHaveLength(1);
      expect(resultWithBaseline[0].itemId).toBe(item1Id);
      expect(resultWithBaseline[0].experiments).toHaveLength(2); // baseline + comp

      // WHEN: Query with requireBaselinePresence = false
      const resultWithoutBaseline = await getExperimentItemsFromEvents({
        projectId,
        baseExperimentId: baselineExpId,
        compExperimentIds: [compExpId],
        filterByExperiment: [],
        config: {
          requireBaselinePresence: false,
        },
        limit: 10,
        offset: 0,
      });

      // THEN: Should return both items
      expect(resultWithoutBaseline).toHaveLength(2);
      const itemIds = resultWithoutBaseline.map((r) => r.itemId);
      expect(itemIds).toContain(item1Id);
      expect(itemIds).toContain(item2Id);

      // Item 1 should have 2 experiments (baseline + comp)
      const item1Result = resultWithoutBaseline.find(
        (r) => r.itemId === item1Id,
      );
      expect(item1Result?.experiments).toHaveLength(2);

      // Item 2 should have 1 experiment (comp only)
      const item2Result = resultWithoutBaseline.find(
        (r) => r.itemId === item2Id,
      );
      expect(item2Result?.experiments).toHaveLength(1);
      expect(item2Result?.experiments[0].experimentId).toBe(compExpId);
    });
  });

  maybe("getExperimentItemsBatchIO", () => {
    it("should fetch IO and truncate to specified length", async () => {
      // GIVEN: Item with long input/output strings
      const baselineExpId = randomUUID();
      const compExpId = randomUUID();
      const datasetId = randomUUID();
      const itemId = randomUUID();

      const longInput = "A".repeat(2000);
      const longExpectedOutput = "B".repeat(2000);
      const longOutput1 = "C".repeat(2000);
      const longOutput2 = "D".repeat(2000);

      const trace1Id = randomUUID();
      const root1Id = randomUUID();
      const trace2Id = randomUUID();
      const root2Id = randomUUID();

      const event1 = createExperimentEvent({
        project_id: projectId,
        trace_id: trace1Id,
        span_id: root1Id,
        experimentId: baselineExpId,
        experimentName: "baseline-exp",
        datasetId: datasetId,
        itemId: itemId,
        experimentItemRootSpanId: root1Id,
        input: longInput,
        experiment_item_expected_output: longExpectedOutput,
        output: longOutput1,
        start_time: Date.now() * 1000,
      });

      const event2 = createExperimentEvent({
        project_id: projectId,
        trace_id: trace2Id,
        span_id: root2Id,
        experimentId: compExpId,
        experimentName: "comp-exp",
        datasetId: datasetId,
        itemId: itemId,
        experimentItemRootSpanId: root2Id,
        input: longInput,
        experiment_item_expected_output: longExpectedOutput,
        output: longOutput2,
        start_time: Date.now() * 1000,
      });

      await createEventsCh([event1, event2]);

      // WHEN: Fetch batch IO
      const result = await getExperimentItemsBatchIO({
        projectId,
        itemIds: [itemId],
        baseExperimentId: baselineExpId,
        compExperimentIds: [compExpId],
      });

      // THEN: Should return truncated IO
      expect(result).toHaveLength(1);
      expect(result[0].itemId).toBe(itemId);

      // Input and expectedOutput from baseline only
      expect(result[0].input).toBeDefined();
      expect(result[0].input!.length).toBeLessThanOrEqual(1000);
      expect(result[0].expectedOutput).toBeDefined();
      expect(result[0].expectedOutput!.length).toBeLessThanOrEqual(1000);

      // Outputs from all experiments
      expect(result[0].outputs).toHaveLength(2);
      expect(
        result[0].outputs.every(
          (o) => o.output === null || o.output.length <= 1000,
        ),
      ).toBe(true);
    });
  });
});
