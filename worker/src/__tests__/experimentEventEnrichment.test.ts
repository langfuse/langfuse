import { randomUUID } from "node:crypto";
import { describe, expect, it, type TestContext } from "vitest";
import {
  createEvent,
  createEventsCh,
  createOrgProjectAndApiKey,
  queryClickhouse,
  stampExperimentAttributesOnTraceEvents,
} from "@langfuse/shared/src/server";
import { skipUnlessClickhouseTablesExist } from "./helpers/clickhouseTables";

describe("stampExperimentAttributesOnTraceEvents", () => {
  it("stamps experiment columns onto events that were ingested without them", async (ctx: TestContext) => {
    await skipUnlessClickhouseTablesExist(ctx, ["events_full", "events_core"]);

    const { projectId } = await createOrgProjectAndApiKey();
    const spanId = randomUUID();
    const childSpanId = randomUUID();
    const traceId = randomUUID();
    const experimentId = randomUUID();
    const experimentItemId = randomUUID();
    const startTimeMs = Date.now();

    await createEventsCh([
      createEvent({
        id: spanId,
        span_id: spanId,
        parent_span_id: "",
        trace_id: traceId,
        project_id: projectId,
        name: "harness-root",
        type: "SPAN",
        environment: "production",
        start_time: startTimeMs * 1000,
        end_time: (startTimeMs + 80) * 1000,
      }),
      createEvent({
        id: childSpanId,
        span_id: childSpanId,
        parent_span_id: spanId,
        trace_id: traceId,
        project_id: projectId,
        name: "harness-child",
        type: "GENERATION",
        environment: "production",
        start_time: (startTimeMs + 10) * 1000,
        end_time: (startTimeMs + 70) * 1000,
      }),
    ]);

    const result = await stampExperimentAttributesOnTraceEvents({
      projectId,
      traceId,
      rootSpanId: spanId,
      experimentId,
      experimentName: "harness-run",
      experimentDescription: "custom eval harness",
      experimentDatasetId: "dataset-1",
      experimentItemId,
      experimentItemExpectedOutput: { answer: 42 },
      experimentMetadata: { runner: "custom" },
      experimentItemMetadata: { case: "n1" },
    });

    expect(result).toEqual({ stamped: true });

    const rows = await queryClickhouse<{
      span_id: string;
      experiment_id: string;
      experiment_name: string;
      experiment_description: string;
      experiment_dataset_id: string;
      experiment_item_id: string;
      experiment_item_root_span_id: string;
      experiment_item_expected_output: string;
      environment: string;
    }>({
      query: `
        SELECT
          span_id,
          experiment_id,
          experiment_name,
          experiment_description,
          experiment_dataset_id,
          experiment_item_id,
          experiment_item_root_span_id,
          experiment_item_expected_output,
          environment
        FROM events_full
        WHERE project_id = {projectId: String}
          AND trace_id = {traceId: String}
          AND is_deleted = 0
        ORDER BY event_ts DESC
        LIMIT 1 BY span_id
      `,
      params: { projectId, traceId },
    });

    expect(rows).toHaveLength(2);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          span_id: spanId,
          experiment_id: experimentId,
          experiment_name: "harness-run",
          experiment_description: "custom eval harness",
          experiment_dataset_id: "dataset-1",
          experiment_item_id: experimentItemId,
          experiment_item_root_span_id: spanId,
          experiment_item_expected_output: JSON.stringify({ answer: 42 }),
          environment: "production",
        }),
        expect.objectContaining({
          span_id: childSpanId,
          experiment_id: experimentId,
          experiment_item_root_span_id: spanId,
          environment: "production",
        }),
      ]),
    );
  });

  it("returns stamped false when the trace has no events", async (ctx: TestContext) => {
    await skipUnlessClickhouseTablesExist(ctx, ["events_full"]);

    const { projectId } = await createOrgProjectAndApiKey();

    const result = await stampExperimentAttributesOnTraceEvents({
      projectId,
      traceId: randomUUID(),
      experimentId: randomUUID(),
      experimentName: "missing-trace",
      experimentDatasetId: "dataset-1",
      experimentItemId: randomUUID(),
    });

    expect(result).toEqual({ stamped: false });
  });

  it("returns stamped false when the linked observation span is missing", async (ctx: TestContext) => {
    await skipUnlessClickhouseTablesExist(ctx, ["events_full"]);

    const { projectId } = await createOrgProjectAndApiKey();
    const traceId = randomUUID();
    const presentSpanId = randomUUID();
    const startTimeMs = Date.now();

    await createEventsCh([
      createEvent({
        id: presentSpanId,
        span_id: presentSpanId,
        trace_id: traceId,
        project_id: projectId,
        name: "present",
        type: "SPAN",
        start_time: startTimeMs * 1000,
        end_time: (startTimeMs + 10) * 1000,
      }),
    ]);

    const result = await stampExperimentAttributesOnTraceEvents({
      projectId,
      traceId,
      rootSpanId: randomUUID(),
      experimentId: randomUUID(),
      experimentName: "missing-observation",
      experimentDatasetId: "dataset-1",
      experimentItemId: randomUUID(),
    });

    expect(result).toEqual({ stamped: false });
  });

  it("stamps only the linked observation subtree so sibling items keep their identity", async (ctx: TestContext) => {
    await skipUnlessClickhouseTablesExist(ctx, ["events_full"]);

    const { projectId } = await createOrgProjectAndApiKey();
    const traceId = randomUUID();
    const rootSpanId = randomUUID();
    const itemASpanId = randomUUID();
    const itemAChildId = randomUUID();
    const itemBSpanId = randomUUID();
    const experimentA = randomUUID();
    const experimentItemA = randomUUID();
    const experimentB = randomUUID();
    const experimentItemB = randomUUID();
    const startTimeMs = Date.now();

    await createEventsCh([
      createEvent({
        id: rootSpanId,
        span_id: rootSpanId,
        parent_span_id: "",
        trace_id: traceId,
        project_id: projectId,
        name: "trace-root",
        type: "SPAN",
        start_time: startTimeMs * 1000,
        end_time: (startTimeMs + 100) * 1000,
      }),
      createEvent({
        id: itemASpanId,
        span_id: itemASpanId,
        parent_span_id: rootSpanId,
        trace_id: traceId,
        project_id: projectId,
        name: "item-a",
        type: "SPAN",
        start_time: (startTimeMs + 1) * 1000,
        end_time: (startTimeMs + 40) * 1000,
      }),
      createEvent({
        id: itemAChildId,
        span_id: itemAChildId,
        parent_span_id: itemASpanId,
        trace_id: traceId,
        project_id: projectId,
        name: "item-a-child",
        type: "GENERATION",
        start_time: (startTimeMs + 2) * 1000,
        end_time: (startTimeMs + 30) * 1000,
      }),
      createEvent({
        id: itemBSpanId,
        span_id: itemBSpanId,
        parent_span_id: rootSpanId,
        trace_id: traceId,
        project_id: projectId,
        name: "item-b",
        type: "GENERATION",
        start_time: (startTimeMs + 50) * 1000,
        end_time: (startTimeMs + 90) * 1000,
      }),
    ]);

    await stampExperimentAttributesOnTraceEvents({
      projectId,
      traceId,
      rootSpanId: itemASpanId,
      experimentId: experimentA,
      experimentName: "run-a",
      experimentDatasetId: "dataset-1",
      experimentItemId: experimentItemA,
    });
    await stampExperimentAttributesOnTraceEvents({
      projectId,
      traceId,
      rootSpanId: itemBSpanId,
      experimentId: experimentB,
      experimentName: "run-b",
      experimentDatasetId: "dataset-1",
      experimentItemId: experimentItemB,
    });

    const rows = await queryClickhouse<{
      span_id: string;
      experiment_id: string;
      experiment_item_id: string;
      experiment_item_root_span_id: string;
    }>({
      query: `
        SELECT
          span_id,
          experiment_id,
          experiment_item_id,
          experiment_item_root_span_id
        FROM events_full
        WHERE project_id = {projectId: String}
          AND trace_id = {traceId: String}
          AND is_deleted = 0
        ORDER BY event_ts DESC
        LIMIT 1 BY span_id
      `,
      params: { projectId, traceId },
    });

    const bySpan = Object.fromEntries(rows.map((row) => [row.span_id, row]));
    expect(bySpan[itemASpanId]).toMatchObject({
      experiment_id: experimentA,
      experiment_item_id: experimentItemA,
      experiment_item_root_span_id: itemASpanId,
    });
    expect(bySpan[itemAChildId]).toMatchObject({
      experiment_id: experimentA,
      experiment_item_id: experimentItemA,
      experiment_item_root_span_id: itemASpanId,
    });
    expect(bySpan[itemBSpanId]).toMatchObject({
      experiment_id: experimentB,
      experiment_item_id: experimentItemB,
      experiment_item_root_span_id: itemBSpanId,
    });
    expect(bySpan[rootSpanId]).toMatchObject({
      experiment_id: "",
      experiment_item_id: "",
      experiment_item_root_span_id: "",
    });
  });
});
