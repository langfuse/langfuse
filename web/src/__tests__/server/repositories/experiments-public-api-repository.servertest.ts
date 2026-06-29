import { randomUUID } from "crypto";

import {
  createDatasetRunScore,
  createEvent,
  createEventsCh,
  createOrgProjectAndApiKey,
  createScoresCh,
  createTraceScore,
} from "@langfuse/shared/src/server";

import { env } from "@/src/env.mjs";
import {
  listExperimentItemsForPublicApi,
  listExperimentsForPublicApi,
} from "@/src/features/experiments/server/public";
import {
  queryExperimentItemsForPublicApi,
  queryExperimentSummaryForPublicApi,
  queryExperimentSummariesForPublicApi,
} from "@/src/features/experiments/server/public/repository";

const maybe =
  env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN === "true"
    ? describe
    : describe.skip;

const createExperimentRootEvent = ({
  projectId,
  experimentId,
  experimentName = experimentId,
  datasetId = "dataset-1",
  startTimeMs,
  traceId = randomUUID(),
  spanId = randomUUID(),
  metadata = {},
  observationMetadata = {},
  itemMetadata = {},
  experimentItemId = randomUUID(),
  expectedOutput = null,
  input = "Hello World",
  output = "Hello John",
  experimentDescription = `${experimentName} description`,
}: {
  projectId: string;
  experimentId: string;
  experimentName?: string;
  datasetId?: string | null;
  startTimeMs: number;
  traceId?: string;
  spanId?: string;
  metadata?: Record<string, string>;
  observationMetadata?: Record<string, string>;
  itemMetadata?: Record<string, string>;
  experimentItemId?: string;
  expectedOutput?: string | null;
  input?: string;
  output?: string;
  experimentDescription?: string | null;
}) =>
  createEvent({
    id: spanId,
    span_id: spanId,
    trace_id: traceId,
    project_id: projectId,
    name: `${experimentName}-root`,
    type: "SPAN",
    input,
    output,
    start_time: startTimeMs * 1000,
    end_time: (startTimeMs + 100) * 1000,
    metadata_names: Object.keys(observationMetadata),
    metadata_values: Object.values(observationMetadata),
    experiment_id: experimentId,
    experiment_name: experimentName,
    experiment_description: experimentDescription,
    experiment_dataset_id: datasetId,
    experiment_item_id: experimentItemId,
    experiment_item_root_span_id: spanId,
    experiment_item_expected_output: expectedOutput,
    experiment_item_metadata_names: Object.keys(itemMetadata),
    experiment_item_metadata_values: Object.values(itemMetadata),
    experiment_metadata_names: Object.keys(metadata),
    experiment_metadata_values: Object.values(metadata),
  });

describe("Public API experiments repository", () => {
  it("should kill redis connection", () => {
    // Keep a test in this file even when the events-table suite is skipped.
  });

  maybe("queryExperimentSummariesForPublicApi", () => {
    it("returns a single unwindowed experiment summary by id", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      const startTimeMs = Date.now() - 30 * 24 * 60 * 60 * 1_000;
      const experimentId = `exp-${randomUUID()}`;
      const scoreId = `score-${randomUUID()}`;

      await createEventsCh([
        createExperimentRootEvent({
          projectId,
          experimentId,
          experimentName: "single repository experiment",
          datasetId: "dataset-public-api",
          startTimeMs,
          metadata: { region: "eu" },
          experimentItemId: "item-1",
        }),
        createExperimentRootEvent({
          projectId,
          experimentId,
          experimentName: "single repository experiment",
          datasetId: "dataset-public-api",
          startTimeMs: startTimeMs + 1_000,
          metadata: { region: "eu" },
          experimentItemId: "item-2",
        }),
      ]);
      await createScoresCh([
        createDatasetRunScore({
          id: scoreId,
          project_id: projectId,
          dataset_run_id: experimentId,
          name: "experiment quality",
          value: 0.75,
          timestamp: startTimeMs + 2_000,
          created_at: startTimeMs + 2_000,
          updated_at: startTimeMs + 2_000,
          event_ts: startTimeMs + 2_000,
        }),
      ]);

      const row = await queryExperimentSummaryForPublicApi({
        projectId,
        experimentId,
      });

      expect(row).toMatchObject({
        experiment_id: experimentId,
        experiment_name: "single repository experiment",
        experiment_description: "single repository experiment description",
        experiment_dataset_id: "dataset-public-api",
        item_count: 2,
        experiment_metadata: { region: "eu" },
      });
      expect(row?.scores?.map((score) => score.id)).toEqual([scoreId]);
    });

    it("returns public API summary fields with cursor anchors", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      const startTimeMs = Date.now();
      const experimentId = `exp-${randomUUID()}`;
      const repeatedItemId = `item-${randomUUID()}`;

      await createEventsCh([
        createExperimentRootEvent({
          projectId,
          experimentId,
          experimentName: "repository experiment",
          datasetId: "dataset-public-api",
          startTimeMs,
          metadata: { region: "eu" },
          experimentItemId: repeatedItemId,
        }),
        createExperimentRootEvent({
          projectId,
          experimentId,
          experimentName: "repository experiment",
          datasetId: "dataset-public-api",
          startTimeMs: startTimeMs + 1_000,
          metadata: { region: "eu" },
          experimentItemId: repeatedItemId,
        }),
      ]);

      const rows = await queryExperimentSummariesForPublicApi({
        projectId,
        fromStartTime: new Date(startTimeMs - 1_000),
        includeMetadata: true,
        limit: 10,
      });

      const row = rows.find((item) => item.experiment_id === experimentId);
      expect(row).toMatchObject({
        experiment_id: experimentId,
        experiment_name: "repository experiment",
        experiment_description: "repository experiment description",
        experiment_dataset_id: "dataset-public-api",
        cursor_trace_id: expect.any(String),
        cursor_span_id: expect.any(String),
        item_count: 2,
        experiment_metadata: { region: "eu" },
      });
    });

    it("does not include metadata unless requested", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      const startTimeMs = Date.now();
      const experimentId = `exp-${randomUUID()}`;

      await createEventsCh([
        createExperimentRootEvent({
          projectId,
          experimentId,
          startTimeMs,
          metadata: { owner: "evals" },
        }),
      ]);

      const rows = await queryExperimentSummariesForPublicApi({
        projectId,
        fromStartTime: new Date(startTimeMs - 1_000),
        includeMetadata: false,
        limit: 10,
      });

      const row = rows.find((item) => item.experiment_id === experimentId);
      expect(row).toBeDefined();
      expect(row).not.toHaveProperty("experiment_metadata");
    });

    it("deduplicates physical root event rows for public item counts", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      const startTimeMs = Date.now();
      const experimentId = `exp-${randomUUID()}`;
      const spanId = `span-${randomUUID()}`;

      const rootEvent = createExperimentRootEvent({
        projectId,
        experimentId,
        startTimeMs,
        spanId,
        experimentItemId: "item-1",
      });

      await createEventsCh([
        rootEvent,
        { ...rootEvent, event_ts: rootEvent.event_ts + 1 },
      ]);

      const rows = await queryExperimentSummariesForPublicApi({
        projectId,
        fromStartTime: new Date(startTimeMs - 1_000),
        includeMetadata: false,
        limit: 10,
      });

      const row = rows.find((item) => item.experiment_id === experimentId);
      expect(row?.item_count).toBe(1);
    });

    it("excludes experiment events without a dataset id", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      const startTimeMs = Date.now();
      const experimentId = `exp-${randomUUID()}`;

      await createEventsCh([
        createExperimentRootEvent({
          projectId,
          experimentId,
          datasetId: null,
          startTimeMs,
        }),
      ]);

      const rows = await queryExperimentSummariesForPublicApi({
        projectId,
        fromStartTime: new Date(startTimeMs - 1_000),
        includeMetadata: false,
        limit: 10,
      });

      expect(rows.map((row) => row.experiment_id)).not.toContain(experimentId);
    });

    it("supports simple experiment id filters and structured filters", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      const startTimeMs = Date.now();
      const matchingId = `exp-${randomUUID()}`;
      const otherId = `exp-${randomUUID()}`;

      await createEventsCh([
        createExperimentRootEvent({
          projectId,
          experimentId: matchingId,
          experimentName: "matching experiment",
          datasetId: "dataset-a",
          startTimeMs,
        }),
        createExperimentRootEvent({
          projectId,
          experimentId: otherId,
          experimentName: "other experiment",
          datasetId: "dataset-b",
          startTimeMs: startTimeMs + 1_000,
        }),
      ]);

      const fromStartTime = new Date(startTimeMs - 1_000);
      const simpleRows = await queryExperimentSummariesForPublicApi({
        projectId,
        id: [matchingId, "missing"],
        fromStartTime,
        includeMetadata: false,
        limit: 10,
      });

      expect(simpleRows.map((row) => row.experiment_id)).toContain(matchingId);
      expect(simpleRows.map((row) => row.experiment_id)).not.toContain(otherId);

      const structuredRows = await queryExperimentSummariesForPublicApi({
        projectId,
        fromStartTime,
        includeMetadata: false,
        advancedFilters: [
          {
            type: "stringOptions",
            column: "datasetId",
            operator: "any of",
            value: ["dataset-b"],
          },
        ],
        limit: 10,
      });

      expect(structuredRows.map((row) => row.experiment_id)).toContain(otherId);
      expect(structuredRows.map((row) => row.experiment_id)).not.toContain(
        matchingId,
      );
    });

    it("lets structured filters take precedence over simple filters on the same experiment field", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      const startTimeMs = Date.now();
      const simpleOnlyId = `exp-${randomUUID()}`;
      const structuredId = `exp-${randomUUID()}`;

      await createEventsCh([
        createExperimentRootEvent({
          projectId,
          experimentId: simpleOnlyId,
          experimentName: "simple experiment",
          datasetId: "dataset-a",
          startTimeMs,
        }),
        createExperimentRootEvent({
          projectId,
          experimentId: structuredId,
          experimentName: "structured experiment",
          datasetId: "dataset-b",
          startTimeMs: startTimeMs + 1_000,
        }),
      ]);

      const rows = await queryExperimentSummariesForPublicApi({
        projectId,
        name: ["simple experiment"],
        fromStartTime: new Date(startTimeMs - 1_000),
        includeMetadata: false,
        advancedFilters: [
          {
            type: "stringOptions",
            column: "name",
            operator: "any of",
            value: ["structured experiment"],
          },
        ],
        limit: 10,
      });

      expect(rows.map((row) => row.experiment_id)).toContain(structuredId);
      expect(rows.map((row) => row.experiment_id)).not.toContain(simpleOnlyId);
    });

    it("attaches experiment scores without multiplying event aggregates", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      const startTimeMs = Date.now();
      const experimentId = `exp-${randomUUID()}`;
      const scoreId = `score-${randomUUID()}`;

      await createEventsCh([
        createExperimentRootEvent({
          projectId,
          experimentId,
          startTimeMs,
        }),
      ]);
      await createScoresCh([
        createDatasetRunScore({
          id: scoreId,
          project_id: projectId,
          dataset_run_id: experimentId,
          name: "experiment quality",
          value: 0.75,
          timestamp: startTimeMs + 1_000,
          created_at: startTimeMs + 1_000,
          updated_at: startTimeMs + 1_000,
          event_ts: startTimeMs + 1_000,
        }),
      ]);

      const response = await listExperimentsForPublicApi({
        projectId,
        query: {
          fields: ["core", "scores"],
          fromStartTime: new Date(startTimeMs - 1_000).toISOString(),
          limit: 10,
          scoreLimit: 50,
        },
      });

      const row = response.data.find((item) => item.id === experimentId);
      expect(row).toMatchObject({
        id: experimentId,
        itemCount: 1,
      });
      expect(row?.scores?.map((score) => score.id)).toEqual([scoreId]);
    });

    it("paginates tied start times by cursor tuple order", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      const startTimeMs = Date.now();
      const traceId = `trace-${randomUUID()}`;
      const experimentIds = [`exp-b-${randomUUID()}`, `exp-a-${randomUUID()}`];

      await createEventsCh([
        createExperimentRootEvent({
          projectId,
          experimentId: experimentIds[0],
          startTimeMs,
          traceId,
          spanId: "span-a",
        }),
        createExperimentRootEvent({
          projectId,
          experimentId: experimentIds[1],
          startTimeMs,
          traceId,
          spanId: "span-z",
        }),
      ]);

      const fromStartTime = new Date(startTimeMs - 1_000);
      const firstPage = await queryExperimentSummariesForPublicApi({
        projectId,
        fromStartTime,
        includeMetadata: false,
        limit: 1,
      });

      expect(firstPage).toHaveLength(1);
      const firstRow = firstPage[0];
      if (!firstRow) throw new Error("expected first page row");
      const firstExperimentId = firstRow.experiment_id;
      const secondExperimentId = experimentIds.find(
        (id) => id !== firstExperimentId,
      );
      expect(secondExperimentId).toBeDefined();

      const secondPage = await queryExperimentSummariesForPublicApi({
        projectId,
        fromStartTime,
        includeMetadata: false,
        cursor: {
          lastStartTime: firstRow.start_time,
          lastTraceId: firstRow.cursor_trace_id,
          lastId: firstRow.cursor_span_id,
          lastExperimentId: firstRow.experiment_id,
        },
        limit: 10,
      });

      expect(secondPage.map((row) => row.experiment_id)).toContain(
        secondExperimentId!,
      );
      expect(secondPage.map((row) => row.experiment_id)).not.toContain(
        firstExperimentId,
      );
    });
  });

  maybe("queryExperimentItemsForPublicApi", () => {
    it("returns only root experiment item spans with requested fields", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      const startTimeMs = Date.now();
      const experimentId = `exp-${randomUUID()}`;
      const rootSpanId = `span-${randomUUID()}`;
      const childSpanId = `span-${randomUUID()}`;

      await createEventsCh([
        createExperimentRootEvent({
          projectId,
          experimentId,
          experimentName: "items experiment",
          datasetId: "dataset-items",
          startTimeMs,
          traceId: "trace-items",
          spanId: rootSpanId,
          experimentItemId: "item-1",
          observationMetadata: { obs: "meta" },
          itemMetadata: { difficulty: "easy" },
          metadata: { owner: "evals" },
          expectedOutput: "expected answer",
          input: "question",
          output: "answer",
        }),
        createEvent({
          id: childSpanId,
          span_id: childSpanId,
          trace_id: "trace-items",
          project_id: projectId,
          name: "child",
          type: "SPAN",
          start_time: (startTimeMs + 10) * 1000,
          experiment_id: experimentId,
          experiment_name: "items experiment",
          experiment_dataset_id: "dataset-items",
          experiment_item_id: "item-1",
          experiment_item_root_span_id: rootSpanId,
        }),
      ]);

      const rows = await queryExperimentItemsForPublicApi({
        projectId,
        fromStartTime: new Date(startTimeMs - 1_000),
        includeDataset: true,
        includeIo: true,
        includeMetadata: true,
        includeItemMetadata: true,
        includeExperimentMetadata: true,
        limit: 10,
      });

      expect(rows.map((row) => row.id)).toEqual([rootSpanId]);
      expect(rows[0]).toMatchObject({
        trace_id: "trace-items",
        experiment_id: experimentId,
        experiment_name: "items experiment",
        experiment_dataset_id: "dataset-items",
        experiment_item_id: "item-1",
        input: "question",
        output: "answer",
        experiment_item_expected_output: "expected answer",
        metadata: { obs: "meta" },
        experiment_item_metadata: { difficulty: "easy" },
        experiment_metadata: { owner: "evals" },
        experiment_description: "items experiment description",
      });
    });

    it("excludes experiment items without a dataset id", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      const startTimeMs = Date.now();
      const spanId = `span-${randomUUID()}`;

      await createEventsCh([
        createExperimentRootEvent({
          projectId,
          experimentId: `exp-${randomUUID()}`,
          datasetId: null,
          startTimeMs,
          spanId,
          experimentItemId: "item-without-dataset",
        }),
      ]);

      const rows = await queryExperimentItemsForPublicApi({
        projectId,
        fromStartTime: new Date(startTimeMs - 1_000),
        includeDataset: true,
        includeIo: false,
        includeMetadata: false,
        includeItemMetadata: false,
        includeExperimentMetadata: false,
        limit: 10,
      });

      expect(rows.map((row) => row.id)).not.toContain(spanId);
    });

    it("lets structured filters take precedence over simple filters on the same experiment item field", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      const startTimeMs = Date.now();
      const simpleOnlySpanId = `span-${randomUUID()}`;
      const structuredSpanId = `span-${randomUUID()}`;

      await createEventsCh([
        createExperimentRootEvent({
          projectId,
          experimentId: `exp-${randomUUID()}`,
          experimentName: "simple item experiment",
          datasetId: "dataset-a",
          startTimeMs,
          spanId: simpleOnlySpanId,
          experimentItemId: "item-simple",
        }),
        createExperimentRootEvent({
          projectId,
          experimentId: `exp-${randomUUID()}`,
          experimentName: "structured item experiment",
          datasetId: "dataset-b",
          startTimeMs: startTimeMs + 1_000,
          spanId: structuredSpanId,
          experimentItemId: "item-structured",
        }),
      ]);

      const rows = await queryExperimentItemsForPublicApi({
        projectId,
        fromStartTime: new Date(startTimeMs - 1_000),
        experimentName: ["simple item experiment"],
        includeDataset: true,
        includeIo: false,
        includeMetadata: false,
        includeItemMetadata: false,
        includeExperimentMetadata: false,
        advancedFilters: [
          {
            type: "stringOptions",
            column: "experimentName",
            operator: "any of",
            value: ["structured item experiment"],
          },
        ],
        limit: 10,
      });

      expect(rows.map((row) => row.id)).toContain(structuredSpanId);
      expect(rows.map((row) => row.id)).not.toContain(simpleOnlySpanId);
    });

    it("paginates tied experiment item rows by the experiment cursor tuple", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      const startTimeMs = Date.now();
      const traceId = `trace-${randomUUID()}`;

      await createEventsCh([
        createExperimentRootEvent({
          projectId,
          experimentId: "exp-a",
          startTimeMs,
          traceId,
          spanId: "span-z",
        }),
        createExperimentRootEvent({
          projectId,
          experimentId: "exp-b",
          startTimeMs,
          traceId,
          spanId: "span-a",
        }),
      ]);

      const firstPage = await queryExperimentItemsForPublicApi({
        projectId,
        fromStartTime: new Date(startTimeMs - 1_000),
        includeDataset: true,
        includeIo: false,
        includeMetadata: false,
        includeItemMetadata: false,
        includeExperimentMetadata: false,
        limit: 1,
      });

      expect(firstPage).toHaveLength(1);
      const firstRow = firstPage[0];
      if (!firstRow) throw new Error("expected first experiment item row");

      const secondPage = await queryExperimentItemsForPublicApi({
        projectId,
        fromStartTime: new Date(startTimeMs - 1_000),
        includeDataset: true,
        includeIo: false,
        includeMetadata: false,
        includeItemMetadata: false,
        includeExperimentMetadata: false,
        cursor: {
          lastStartTime: firstRow.start_time,
          lastTraceId: firstRow.trace_id,
          lastId: firstRow.id,
          lastExperimentId: firstRow.experiment_id,
        },
        limit: 10,
      });

      expect(secondPage.map((row) => row.id)).not.toContain(firstRow.id);
      expect(secondPage).toHaveLength(1);
    });

    it("deduplicates physical root rows before limiting experiment items", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      const startTimeMs = Date.now();
      const experimentId = `exp-${randomUUID()}`;
      const spanId = `span-${randomUUID()}`;

      const rootEvent = createExperimentRootEvent({
        projectId,
        experimentId,
        startTimeMs,
        spanId,
      });

      await createEventsCh([
        rootEvent,
        { ...rootEvent, event_ts: rootEvent.event_ts + 1 },
      ]);

      const rows = await queryExperimentItemsForPublicApi({
        projectId,
        fromStartTime: new Date(startTimeMs - 1_000),
        includeDataset: true,
        includeIo: false,
        includeMetadata: false,
        includeItemMetadata: false,
        includeExperimentMetadata: false,
        limit: 10,
      });

      expect(rows.map((row) => row.id)).toEqual([spanId]);
    });

    it("returns full observation metadata when metadata is requested without io", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      const startTimeMs = Date.now();
      const longMetadataValue = "x".repeat(250);

      await createEventsCh([
        createExperimentRootEvent({
          projectId,
          experimentId: `exp-${randomUUID()}`,
          startTimeMs,
          observationMetadata: { long: longMetadataValue },
        }),
      ]);

      const rows = await queryExperimentItemsForPublicApi({
        projectId,
        fromStartTime: new Date(startTimeMs - 1_000),
        includeDataset: false,
        includeIo: false,
        includeMetadata: true,
        includeItemMetadata: false,
        includeExperimentMetadata: false,
        limit: 10,
      });

      expect(rows).toHaveLength(1);
      expect(rows[0]?.metadata?.long).toBe(longMetadataValue);
    });

    it("preserves microsecond precision in experiment item cursors", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      const startTimeMs = Date.UTC(2026, 0, 1, 0, 0, 0, 123);
      const firstStartTimeUs = startTimeMs * 1_000 + 456;
      const secondStartTimeUs = startTimeMs * 1_000;

      await createEventsCh([
        {
          ...createExperimentRootEvent({
            projectId,
            experimentId: `exp-${randomUUID()}`,
            startTimeMs,
            spanId: "span-cursor-first",
          }),
          start_time: firstStartTimeUs,
          event_ts: firstStartTimeUs,
        },
        {
          ...createExperimentRootEvent({
            projectId,
            experimentId: `exp-${randomUUID()}`,
            startTimeMs,
            spanId: "span-cursor-second",
          }),
          start_time: secondStartTimeUs,
          event_ts: secondStartTimeUs,
        },
      ]);

      const response = await listExperimentItemsForPublicApi({
        projectId,
        query: {
          fields: ["core"],
          limit: 1,
          scoreLimit: 50,
          fromStartTime: new Date(startTimeMs - 1_000).toISOString(),
        },
      });

      const cursor = response.meta.cursor;
      expect(cursor).toBeDefined();

      const decodedCursor = JSON.parse(
        Buffer.from(cursor!, "base64url").toString("utf-8"),
      ) as { lastStartTimeTo: string };

      expect(decodedCursor.lastStartTimeTo).toContain(".123456");
    });

    it("attaches flat item and trace scores", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      const startTimeMs = Date.now();
      const traceId = `trace-${randomUUID()}`;
      const spanId = `span-${randomUUID()}`;
      const experimentId = `exp-${randomUUID()}`;
      const itemScoreId = `score-${randomUUID()}`;
      const traceScoreId = `score-${randomUUID()}`;

      await createEventsCh([
        createExperimentRootEvent({
          projectId,
          experimentId,
          startTimeMs,
          traceId,
          spanId,
        }),
      ]);
      await createScoresCh([
        createTraceScore({
          id: itemScoreId,
          project_id: projectId,
          trace_id: traceId,
          observation_id: spanId,
          name: "item score",
          timestamp: startTimeMs + 1,
          created_at: startTimeMs + 1,
          updated_at: startTimeMs + 1,
          event_ts: startTimeMs + 1,
        }),
        createTraceScore({
          id: traceScoreId,
          project_id: projectId,
          trace_id: traceId,
          observation_id: null,
          name: "trace score",
          timestamp: startTimeMs + 2,
          created_at: startTimeMs + 2,
          updated_at: startTimeMs + 2,
          event_ts: startTimeMs + 2,
        }),
      ]);

      const response = await listExperimentItemsForPublicApi({
        projectId,
        query: {
          fields: ["core", "scores"],
          limit: 10,
          scoreLimit: 50,
          fromStartTime: new Date(startTimeMs - 1_000).toISOString(),
        },
      });

      expect(response.data).toHaveLength(1);
      expect(response.data[0]?.scores?.map((score) => score.id).sort()).toEqual(
        [itemScoreId, traceScoreId].sort(),
      );
    });
  });
});
