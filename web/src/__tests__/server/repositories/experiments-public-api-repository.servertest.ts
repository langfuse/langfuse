import { randomUUID } from "crypto";

import {
  createDatasetRunScore,
  createEvent,
  createEventsCh,
  createOrgProjectAndApiKey,
  createScoresCh,
  parseClickhouseUTCDateTimeFormat,
} from "@langfuse/shared/src/server";

import { env } from "@/src/env.mjs";
import { queryExperimentSummariesForPublicApi } from "@/src/features/experiments/server/public/repository";

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
  experimentItemId = randomUUID(),
}: {
  projectId: string;
  experimentId: string;
  experimentName?: string;
  datasetId?: string | null;
  startTimeMs: number;
  traceId?: string;
  spanId?: string;
  metadata?: Record<string, string>;
  experimentItemId?: string;
}) =>
  createEvent({
    id: spanId,
    span_id: spanId,
    trace_id: traceId,
    project_id: projectId,
    name: `${experimentName}-root`,
    type: "SPAN",
    start_time: startTimeMs * 1000,
    end_time: (startTimeMs + 100) * 1000,
    experiment_id: experimentId,
    experiment_name: experimentName,
    experiment_description: `${experimentName} description`,
    experiment_dataset_id: datasetId,
    experiment_item_id: experimentItemId,
    experiment_item_root_span_id: spanId,
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
        fromStartTime: new Date(startTimeMs - 1_000),
        includeMetadata: true,
        includeScores: false,
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
        includeScores: false,
        limit: 10,
      });

      const row = rows.find((item) => item.experiment_id === experimentId);
      expect(row).toBeDefined();
      expect(row).not.toHaveProperty("experiment_metadata");
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
        includeScores: false,
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
        includeScores: false,
        limit: 10,
      });

      expect(simpleRows.map((row) => row.experiment_id)).toContain(matchingId);
      expect(simpleRows.map((row) => row.experiment_id)).not.toContain(otherId);

      const structuredRows = await queryExperimentSummariesForPublicApi({
        projectId,
        fromStartTime,
        includeMetadata: false,
        includeScores: false,
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

    it("returns experiment scores without multiplying event aggregates", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      const startTimeMs = Date.now();
      const experimentId = `exp-${randomUUID()}`;
      const scoreId = `score-${randomUUID()}`;
      const traceScopedScoreId = `score-${randomUUID()}`;
      const otherExperimentScoreId = `score-${randomUUID()}`;

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
        {
          ...createDatasetRunScore({
            id: traceScopedScoreId,
            project_id: projectId,
            dataset_run_id: experimentId,
          }),
          trace_id: randomUUID(),
        },
        createDatasetRunScore({
          id: otherExperimentScoreId,
          project_id: projectId,
          dataset_run_id: `exp-${randomUUID()}`,
        }),
      ]);

      const rows = await queryExperimentSummariesForPublicApi({
        projectId,
        fromStartTime: new Date(startTimeMs - 1_000),
        includeMetadata: false,
        includeScores: true,
        limit: 10,
      });

      const row = rows.find((item) => item.experiment_id === experimentId);
      expect(row).toMatchObject({
        experiment_id: experimentId,
        item_count: 1,
      });
      expect(row?.scores?.map((score) => score.id)).toEqual([scoreId]);
      expect(row?.scores?.map((score) => score.id)).not.toContain(
        traceScopedScoreId,
      );
      expect(row?.scores?.map((score) => score.id)).not.toContain(
        otherExperimentScoreId,
      );
    });

    it("limits scores per experiment", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
      const startTimeMs = Date.now();
      const experimentId = `exp-${randomUUID()}`;

      await createEventsCh([
        createExperimentRootEvent({
          projectId,
          experimentId,
          startTimeMs,
        }),
      ]);
      await createScoresCh(
        Array.from({ length: 3 }, (_, index) =>
          createDatasetRunScore({
            id: `score-${randomUUID()}`,
            project_id: projectId,
            dataset_run_id: experimentId,
            timestamp: startTimeMs + index,
            created_at: startTimeMs + index,
            updated_at: startTimeMs + index,
            event_ts: startTimeMs + index,
          }),
        ),
      );

      const rows = await queryExperimentSummariesForPublicApi({
        projectId,
        fromStartTime: new Date(startTimeMs - 1_000),
        includeMetadata: false,
        includeScores: true,
        limit: 10,
        scoreLimit: 2,
      });

      const row = rows.find((item) => item.experiment_id === experimentId);
      expect(row?.scores).toHaveLength(2);
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
        includeScores: false,
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
        includeScores: false,
        cursor: {
          lastStartTime: parseClickhouseUTCDateTimeFormat(firstRow.start_time),
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
});
