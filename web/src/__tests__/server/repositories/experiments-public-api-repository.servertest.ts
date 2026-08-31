import { randomUUID } from "crypto";

import {
  createDatasetRunScore,
  createEvent,
  createEventsCh,
  createOrgProjectAndApiKey,
  createScoresCh,
  createTraceScore,
  parseClickhouseUTCDateTimeFormat,
} from "@langfuse/shared/src/server";

import { env } from "@/src/env.mjs";
import {
  listExperimentItemsForPublicApi,
  listExperimentsForPublicApi,
} from "@/src/features/experiments/server/public";
import {
  queryExperimentItemsForPublicApi,
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
  endTimeMs = startTimeMs + 100,
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
  endTimeMs?: number;
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
    end_time: endTimeMs * 1000,
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
        fromTime: new Date(startTimeMs - 1_000),
        includeMetadata: true,
        limit: 10,
      });

      const row = rows.find((item) => item.experiment_id === experimentId);
      expect(row).toMatchObject({
        experiment_id: experimentId,
        experiment_name: "repository experiment",
        experiment_description: "repository experiment description",
        experiment_dataset_id: "dataset-public-api",
        cursor_span_id: expect.any(String),
        experiment_metadata: { region: "eu" },
      });
      // start_time surfaces the earliest event, cursor anchors the latest one
      expect(parseClickhouseUTCDateTimeFormat(row!.start_time).getTime()).toBe(
        startTimeMs,
      );
      expect(parseClickhouseUTCDateTimeFormat(row!.cursor_time).getTime()).toBe(
        startTimeMs + 1_000,
      );
      expect(parseClickhouseUTCDateTimeFormat(row!.end_time).getTime()).toBe(
        startTimeMs + 1_100,
      );
      expect(Number(row!.item_count)).toBe(2);
    });

    it("orders by latest experiment activity while surfacing the earliest start time", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      const startTimeMs = Date.now();
      const longRunningExperimentId = `exp-${randomUUID()}`;
      const recentExperimentId = `exp-${randomUUID()}`;

      await createEventsCh([
        createExperimentRootEvent({
          projectId,
          experimentId: longRunningExperimentId,
          startTimeMs,
          // outlives the later-starting event: the experiment end must come
          // from here, not from the latest event start
          endTimeMs: startTimeMs + 300_000,
        }),
        createExperimentRootEvent({
          projectId,
          experimentId: longRunningExperimentId,
          startTimeMs: startTimeMs + 120_000,
        }),
        createExperimentRootEvent({
          projectId,
          experimentId: recentExperimentId,
          startTimeMs: startTimeMs + 60_000,
        }),
      ]);

      const rows = await queryExperimentSummariesForPublicApi({
        projectId,
        fromTime: new Date(startTimeMs - 1_000),
        includeMetadata: false,
        limit: 10,
      });

      // The long-running experiment leads the page (latest activity) even
      // though its start time is the oldest.
      expect(rows.map((row) => row.experiment_id)).toEqual([
        longRunningExperimentId,
        recentExperimentId,
      ]);
      expect(
        parseClickhouseUTCDateTimeFormat(rows[0]!.start_time).getTime(),
      ).toBe(startTimeMs);
      expect(
        parseClickhouseUTCDateTimeFormat(rows[0]!.end_time).getTime(),
      ).toBe(startTimeMs + 300_000);
      expect(
        parseClickhouseUTCDateTimeFormat(rows[1]!.start_time).getTime(),
      ).toBe(startTimeMs + 60_000);
    });

    it("lists experiments whose latest event falls between another experiment's first and last event", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      const startTimeMs = Date.now();
      const spanningExperimentId = `exp-${randomUUID()}`;
      const inBetweenExperimentId = `exp-${randomUUID()}`;

      await createEventsCh([
        createExperimentRootEvent({
          projectId,
          experimentId: spanningExperimentId,
          startTimeMs,
        }),
        createExperimentRootEvent({
          projectId,
          experimentId: spanningExperimentId,
          startTimeMs: startTimeMs + 120_000,
        }),
        createExperimentRootEvent({
          projectId,
          experimentId: inBetweenExperimentId,
          startTimeMs: startTimeMs + 60_000,
        }),
      ]);

      const fromTime = new Date(startTimeMs - 1_000);
      const firstPage = await queryExperimentSummariesForPublicApi({
        projectId,
        fromTime,
        includeMetadata: false,
        limit: 1,
      });

      expect(firstPage.map((row) => row.experiment_id)).toEqual([
        spanningExperimentId,
      ]);
      const firstRow = firstPage[0];
      if (!firstRow) throw new Error("expected first page row");

      // The cursor must anchor on the spanning experiment's LATEST event;
      // anchoring on its earliest would drop the in-between experiment.
      const secondPage = await queryExperimentSummariesForPublicApi({
        projectId,
        fromTime,
        includeMetadata: false,
        cursor: {
          lastTime: firstRow.cursor_time,
          lastTraceId: firstRow.cursor_trace_id,
          lastId: firstRow.cursor_span_id,
          lastExperimentId: firstRow.experiment_id,
        },
        limit: 10,
      });

      expect(secondPage.map((row) => row.experiment_id)).toEqual([
        inBetweenExperimentId,
      ]);
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
        fromTime: new Date(startTimeMs - 1_000),
        includeMetadata: false,
        limit: 10,
      });

      const row = rows.find((item) => item.experiment_id === experimentId);
      expect(row).toBeDefined();
      expect(row).not.toHaveProperty("experiment_metadata");
    });

    it("includes experiment events without a dataset id", async () => {
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
        fromTime: new Date(startTimeMs - 1_000),
        includeMetadata: false,
        limit: 10,
      });

      expect(rows).toEqual([
        expect.objectContaining({
          experiment_id: experimentId,
          experiment_dataset_id: null,
        }),
      ]);
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

      const fromTime = new Date(startTimeMs - 1_000);
      const simpleRows = await queryExperimentSummariesForPublicApi({
        projectId,
        id: [matchingId, "missing"],
        fromTime,
        includeMetadata: false,
        limit: 10,
      });

      expect(simpleRows.map((row) => row.experiment_id)).toContain(matchingId);
      expect(simpleRows.map((row) => row.experiment_id)).not.toContain(otherId);

      const structuredRows = await queryExperimentSummariesForPublicApi({
        projectId,
        fromTime,
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
        id: [simpleOnlyId],
        fromTime: new Date(startTimeMs - 1_000),
        includeMetadata: false,
        advancedFilters: [
          {
            type: "stringOptions",
            column: "id",
            operator: "any of",
            value: [structuredId],
          },
        ],
        limit: 10,
      });

      expect(rows.map((row) => row.experiment_id)).toContain(structuredId);
      expect(rows.map((row) => row.experiment_id)).not.toContain(simpleOnlyId);
    });

    it("attaches experiment scores without multiplying event aggregates", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      const startTimeMs = Date.now() - 60_000;
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
      });
      expect(row?.scores?.map((score) => score.id)).toEqual([scoreId]);
    });

    it("bounds experiment summary score lookup to the returned row timestamp envelope", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      const startTimeMs = Date.now() - 3 * 24 * 60 * 60 * 1_000;
      const scoredExperimentId = `exp-z-${randomUUID()}`;
      const lastRowExperimentId = `exp-a-${randomUUID()}`;
      const scoreId = `score-${randomUUID()}`;
      const tooOldScoreId = `score-${randomUUID()}`;
      const outOfWindowScoreId = `score-${randomUUID()}`;
      const oldestReturnedStartTimeMs = startTimeMs + 60 * 60 * 1_000;
      const newestReturnedStartTimeMs = startTimeMs + 2 * 60 * 60 * 1_000;

      await createEventsCh([
        createExperimentRootEvent({
          projectId,
          experimentId: scoredExperimentId,
          startTimeMs: newestReturnedStartTimeMs,
        }),
        createExperimentRootEvent({
          projectId,
          experimentId: lastRowExperimentId,
          startTimeMs: oldestReturnedStartTimeMs,
        }),
      ]);
      await createScoresCh([
        createDatasetRunScore({
          id: scoreId,
          project_id: projectId,
          dataset_run_id: scoredExperimentId,
          name: "early experiment score",
          timestamp: oldestReturnedStartTimeMs + 10 * 60 * 1_000,
          created_at: oldestReturnedStartTimeMs + 10 * 60 * 1_000,
          updated_at: oldestReturnedStartTimeMs + 10 * 60 * 1_000,
          event_ts: oldestReturnedStartTimeMs + 10 * 60 * 1_000,
        }),
        createDatasetRunScore({
          id: tooOldScoreId,
          project_id: projectId,
          dataset_run_id: scoredExperimentId,
          name: "too old experiment score",
          timestamp: oldestReturnedStartTimeMs - 25 * 60 * 60 * 1_000,
          created_at: oldestReturnedStartTimeMs - 25 * 60 * 60 * 1_000,
          updated_at: oldestReturnedStartTimeMs - 25 * 60 * 60 * 1_000,
          event_ts: oldestReturnedStartTimeMs - 25 * 60 * 60 * 1_000,
        }),
        createDatasetRunScore({
          id: outOfWindowScoreId,
          project_id: projectId,
          dataset_run_id: scoredExperimentId,
          name: "late experiment score",
          timestamp: newestReturnedStartTimeMs + 24 * 60 * 60 * 1_000,
          created_at: newestReturnedStartTimeMs + 24 * 60 * 60 * 1_000,
          updated_at: newestReturnedStartTimeMs + 24 * 60 * 60 * 1_000,
          event_ts: newestReturnedStartTimeMs + 24 * 60 * 60 * 1_000,
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

      const row = response.data.find((item) => item.id === scoredExperimentId);
      expect(row?.scores?.map((score) => score.id)).toEqual([scoreId]);
      expect(row?.scores?.map((score) => score.id)).not.toContain(
        tooOldScoreId,
      );
      expect(row?.scores?.map((score) => score.id)).not.toContain(
        outOfWindowScoreId,
      );
    });

    it("paginates by experiment summary cursor tuple order", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      const startTimeMs = Date.now();
      const experimentIds = [`exp-z-${randomUUID()}`, `exp-a-${randomUUID()}`];

      await createEventsCh([
        createExperimentRootEvent({
          projectId,
          experimentId: experimentIds[0],
          startTimeMs,
          spanId: "span-a",
        }),
        createExperimentRootEvent({
          projectId,
          experimentId: experimentIds[1],
          startTimeMs,
          spanId: "span-z",
        }),
      ]);

      const fromTime = new Date(startTimeMs - 1_000);
      const firstPage = await queryExperimentSummariesForPublicApi({
        projectId,
        fromTime,
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
        fromTime,
        includeMetadata: false,
        cursor: {
          lastTime: firstRow.cursor_time,
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

    it("excludes experiments seen in the one day lookback on cursor pages", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      const startTimeMs = Date.now();
      const repeatedExperimentId = `exp-z-${randomUUID()}`;
      const nextExperimentId = `exp-a-${randomUUID()}`;

      await createEventsCh([
        createExperimentRootEvent({
          projectId,
          experimentId: repeatedExperimentId,
          startTimeMs,
          spanId: "span-z-new",
        }),
        createExperimentRootEvent({
          projectId,
          experimentId: repeatedExperimentId,
          startTimeMs: startTimeMs - 10_000,
          spanId: "span-z-old",
        }),
        createExperimentRootEvent({
          projectId,
          experimentId: nextExperimentId,
          startTimeMs: startTimeMs - 25 * 60 * 60 * 1_000,
          spanId: "span-a",
        }),
      ]);

      const fromTime = new Date(startTimeMs - 26 * 60 * 60 * 1_000);
      const firstPage = await queryExperimentSummariesForPublicApi({
        projectId,
        fromTime,
        includeMetadata: false,
        limit: 1,
      });

      expect(firstPage.map((row) => row.experiment_id)).toEqual([
        repeatedExperimentId,
      ]);

      const firstRow = firstPage[0];
      if (!firstRow) throw new Error("expected first page row");

      const secondPage = await queryExperimentSummariesForPublicApi({
        projectId,
        fromTime,
        includeMetadata: false,
        cursor: {
          lastTime: firstRow.cursor_time,
          lastTraceId: firstRow.cursor_trace_id,
          lastId: firstRow.cursor_span_id,
          lastExperimentId: firstRow.experiment_id,
        },
        limit: 10,
      });

      expect(secondPage.map((row) => row.experiment_id)).toContain(
        nextExperimentId,
      );
      expect(secondPage.map((row) => row.experiment_id)).not.toContain(
        repeatedExperimentId,
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
        fromTime: new Date(startTimeMs - 1_000),
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

    it("includes experiment items without a dataset id", async () => {
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
        fromTime: new Date(startTimeMs - 1_000),
        includeDataset: true,
        includeIo: false,
        includeMetadata: false,
        includeItemMetadata: false,
        includeExperimentMetadata: false,
        limit: 10,
      });

      expect(rows.map((row) => row.id)).toEqual([spanId]);
      expect([null, ""]).toContain(rows[0]?.experiment_dataset_id);
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
        fromTime: new Date(startTimeMs - 1_000),
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
        fromTime: new Date(startTimeMs - 1_000),
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
        fromTime: new Date(startTimeMs - 1_000),
        includeDataset: true,
        includeIo: false,
        includeMetadata: false,
        includeItemMetadata: false,
        includeExperimentMetadata: false,
        cursor: {
          lastTime: firstRow.start_time,
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
        fromTime: new Date(startTimeMs - 1_000),
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
        fromTime: new Date(startTimeMs - 1_000),
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
      ) as { lastTime: string };

      expect(decodedCursor.lastTime).toContain(".123456");
    });

    it("attaches flat item and trace scores", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      const startTimeMs = Date.now() - 3 * 24 * 60 * 60 * 1_000;
      const traceId = `trace-${randomUUID()}`;
      const spanId = `span-${randomUUID()}`;
      const experimentId = `exp-${randomUUID()}`;
      const itemScoreId = `score-${randomUUID()}`;
      const traceScoreId = `score-${randomUUID()}`;
      const tooOldItemScoreId = `score-${randomUUID()}`;
      const outOfWindowItemScoreId = `score-${randomUUID()}`;

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
        createTraceScore({
          id: tooOldItemScoreId,
          project_id: projectId,
          trace_id: traceId,
          observation_id: spanId,
          name: "too old item score",
          timestamp: startTimeMs - 25 * 60 * 60 * 1_000,
          created_at: startTimeMs - 25 * 60 * 60 * 1_000,
          updated_at: startTimeMs - 25 * 60 * 60 * 1_000,
          event_ts: startTimeMs - 25 * 60 * 60 * 1_000,
        }),
        createTraceScore({
          id: outOfWindowItemScoreId,
          project_id: projectId,
          trace_id: traceId,
          observation_id: spanId,
          name: "late item score",
          timestamp: startTimeMs + 25 * 60 * 60 * 1_000,
          created_at: startTimeMs + 25 * 60 * 60 * 1_000,
          updated_at: startTimeMs + 25 * 60 * 60 * 1_000,
          event_ts: startTimeMs + 25 * 60 * 60 * 1_000,
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
      expect(response.data[0]?.scores?.map((score) => score.id)).not.toContain(
        tooOldItemScoreId,
      );
      expect(response.data[0]?.scores?.map((score) => score.id)).not.toContain(
        outOfWindowItemScoreId,
      );
    });
  });
});
