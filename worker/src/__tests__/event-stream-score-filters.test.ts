import type { FilterCondition } from "@langfuse/shared";
import {
  createEvent,
  createEventsCh,
  createScoresCh,
  createTraceScore,
  getEventsStreamForEval,
} from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";
import type { Readable } from "stream";
import { describe, expect, it } from "vitest";
import {
  getEventsStream,
  getEventsStreamForAnnotationQueue,
  getEventsStreamForDataset,
} from "../features/database-read-stream/event-stream";

const maybeDescribe =
  process.env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN === "true"
    ? describe
    : describe.skip;

type StreamInput = {
  projectId: string;
  cutoffCreatedAt: Date;
  filter: FilterCondition[];
  rowLimit: number;
};

type StreamAdapter = {
  name: string;
  run: (input: StreamInput) => Promise<Readable>;
};

const streamAdapters: StreamAdapter[] = [
  { name: "blob export", run: getEventsStream },
  { name: "dataset", run: getEventsStreamForDataset },
  { name: "annotation queue", run: getEventsStreamForAnnotationQueue },
  { name: "evaluation", run: getEventsStreamForEval },
];

const collectRows = async (
  stream: Readable,
): Promise<Array<{ id: string; [key: string]: unknown }>> => {
  const rows: Array<{ id: string; [key: string]: unknown }> = [];
  for await (const row of stream) {
    rows.push(row as { id: string; [key: string]: unknown });
  }
  return rows;
};

type ScoreValues = {
  numericValue: number;
  categoryValue: string;
  booleanValue: boolean;
};

const createScoreSet = ({
  projectId,
  traceId,
  observationId,
  observationValues,
  traceValues,
  observationTimestamp,
  traceTimestamp,
}: {
  projectId: string;
  traceId: string;
  observationId: string;
  observationValues: ScoreValues;
  traceValues: ScoreValues;
  observationTimestamp?: number;
  traceTimestamp?: number;
}) => {
  const observationTimestampField =
    observationTimestamp === undefined
      ? {}
      : { timestamp: observationTimestamp };
  const traceTimestampField =
    traceTimestamp === undefined ? {} : { timestamp: traceTimestamp };

  return [
    createTraceScore({
      project_id: projectId,
      trace_id: traceId,
      observation_id: observationId,
      name: "observation-numeric",
      data_type: "NUMERIC",
      value: observationValues.numericValue,
      ...observationTimestampField,
    }),
    createTraceScore({
      project_id: projectId,
      trace_id: traceId,
      observation_id: observationId,
      name: "observation:category",
      data_type: "CATEGORICAL",
      value: 0,
      string_value: observationValues.categoryValue,
      ...observationTimestampField,
    }),
    createTraceScore({
      project_id: projectId,
      trace_id: traceId,
      observation_id: observationId,
      name: "observation-boolean",
      data_type: "BOOLEAN",
      value: observationValues.booleanValue ? 1 : 0,
      string_value: observationValues.booleanValue ? "True" : "False",
      ...observationTimestampField,
    }),
    createTraceScore({
      project_id: projectId,
      trace_id: traceId,
      observation_id: null,
      name: "trace-numeric",
      data_type: "NUMERIC",
      value: traceValues.numericValue,
      ...traceTimestampField,
    }),
    createTraceScore({
      project_id: projectId,
      trace_id: traceId,
      observation_id: null,
      name: "trace-category",
      data_type: "CATEGORICAL",
      value: 0,
      string_value: traceValues.categoryValue,
      ...traceTimestampField,
    }),
    createTraceScore({
      project_id: projectId,
      trace_id: traceId,
      observation_id: null,
      name: "trace-boolean",
      data_type: "BOOLEAN",
      value: traceValues.booleanValue ? 1 : 0,
      string_value: traceValues.booleanValue ? "True" : "False",
      ...traceTimestampField,
    }),
  ];
};

const scoreFilters: FilterCondition[] = [
  {
    type: "numberObject",
    column: "SCORES",
    key: "observation-numeric",
    operator: ">",
    value: 0.5,
  },
  {
    type: "categoryOptions",
    column: "score_categories",
    key: "observation:category",
    operator: "any of",
    value: ["matching"],
  },
  {
    type: "booleanObject",
    column: "score_booleans",
    key: "observation-boolean",
    operator: "=",
    value: true,
  },
  {
    type: "numberObject",
    column: "trace_scores_avg",
    key: "trace-numeric",
    operator: ">",
    value: 0.5,
  },
  {
    type: "categoryOptions",
    column: "trace_score_categories",
    key: "trace-category",
    operator: "any of",
    value: ["matching"],
  },
  {
    type: "booleanObject",
    column: "trace_score_booleans",
    key: "trace-boolean",
    operator: "=",
    value: true,
  },
];

maybeDescribe("event stream score filters", () => {
  it("applies observation and trace score filters to every stream", async () => {
    const projectId = randomUUID();
    const unscoredTraceId = randomUUID();
    const unscoredEventId = randomUUID();
    const now = Date.now();
    const observationScoreTimestamp = now - 30 * 60 * 1_000;
    const traceScoreTimestamp = now - (48 * 60 + 30) * 60 * 1_000;
    const matchingValues: ScoreValues = {
      numericValue: 0.9,
      categoryValue: "matching",
      booleanValue: true,
    };
    const variants = [
      {
        label: "matching-all-score-filters",
        observationValues: matchingValues,
        traceValues: matchingValues,
        matches: true,
      },
      {
        label: "observation-numeric-mismatch",
        observationValues: { ...matchingValues, numericValue: 0.1 },
        traceValues: matchingValues,
      },
      {
        label: "observation-category-mismatch",
        observationValues: {
          ...matchingValues,
          categoryValue: "not-matching",
        },
        traceValues: matchingValues,
      },
      {
        label: "observation-boolean-mismatch",
        observationValues: { ...matchingValues, booleanValue: false },
        traceValues: matchingValues,
      },
      {
        label: "trace-numeric-mismatch",
        observationValues: matchingValues,
        traceValues: { ...matchingValues, numericValue: 0.1 },
      },
      {
        label: "trace-category-mismatch",
        observationValues: matchingValues,
        traceValues: { ...matchingValues, categoryValue: "not-matching" },
      },
      {
        label: "trace-boolean-mismatch",
        observationValues: matchingValues,
        traceValues: { ...matchingValues, booleanValue: false },
      },
    ].map((variant, index) => ({
      ...variant,
      eventId: randomUUID(),
      traceId: randomUUID(),
      startTime: (now + index) * 1000,
    }));
    const matchingEventId = variants.find(
      (variant) => variant.matches,
    )!.eventId;

    await createEventsCh([
      ...variants.map((variant) =>
        createEvent({
          id: variant.eventId,
          span_id: variant.eventId,
          project_id: projectId,
          trace_id: variant.traceId,
          name: variant.label,
          start_time: variant.startTime,
        }),
      ),
      createEvent({
        id: unscoredEventId,
        span_id: unscoredEventId,
        project_id: projectId,
        trace_id: unscoredTraceId,
        name: "missing-scores",
        start_time: (now + 2) * 1000,
      }),
    ]);

    await createScoresCh([
      ...variants.flatMap((variant) =>
        createScoreSet({
          projectId,
          traceId: variant.traceId,
          observationId: variant.eventId,
          observationValues: variant.observationValues,
          traceValues: variant.traceValues,
          observationTimestamp: observationScoreTimestamp,
          traceTimestamp: traceScoreTimestamp,
        }),
      ),
      createTraceScore({
        project_id: projectId,
        trace_id: variants[0]!.traceId,
        observation_id: variants[0]!.eventId,
        name: "outside-score-lookback",
        data_type: "NUMERIC",
        value: 1,
        timestamp: now - 61 * 60 * 1_000,
      }),
    ]);

    for (const { name, run } of streamAdapters) {
      const rows = await collectRows(
        await run({
          projectId,
          cutoffCreatedAt: new Date(now + 60_000),
          filter: [
            {
              type: "datetime",
              column: "startTime",
              operator: ">=",
              value: new Date(now),
            },
            ...scoreFilters,
          ],
          rowLimit: 100,
        }),
      );

      expect(rows.map((row) => row.id).sort(), name).toEqual([matchingEventId]);
      if (name === "blob export") {
        expect(rows[0]?.["observation-numeric"]).toEqual([0.9]);
        expect(rows[0]?.["observation:category"]).toEqual(["matching"]);
        expect(rows[0]).not.toHaveProperty("trace-numeric");
        expect(rows[0]).not.toHaveProperty("outside-score-lookback");
      }
    }
  }, 30_000);

  it("preserves negative score semantics for unscored rows", async () => {
    const projectId = randomUUID();
    const now = Date.now();
    const allowedEventId = randomUUID();
    const allowedTraceId = randomUUID();
    const blockedEventId = randomUUID();
    const blockedTraceId = randomUUID();
    const unscoredEventId = randomUUID();

    await createEventsCh([
      createEvent({
        id: allowedEventId,
        span_id: allowedEventId,
        project_id: projectId,
        trace_id: allowedTraceId,
        start_time: now * 1000,
      }),
      createEvent({
        id: blockedEventId,
        span_id: blockedEventId,
        project_id: projectId,
        trace_id: blockedTraceId,
        start_time: (now + 1) * 1000,
      }),
      createEvent({
        id: unscoredEventId,
        span_id: unscoredEventId,
        project_id: projectId,
        trace_id: randomUUID(),
        start_time: (now + 2) * 1000,
      }),
    ]);
    await createScoresCh([
      ...createScoreSet({
        projectId,
        traceId: allowedTraceId,
        observationId: allowedEventId,
        observationValues: {
          numericValue: 0,
          categoryValue: "allowed",
          booleanValue: false,
        },
        traceValues: {
          numericValue: 0,
          categoryValue: "allowed",
          booleanValue: false,
        },
      }),
      ...createScoreSet({
        projectId,
        traceId: blockedTraceId,
        observationId: blockedEventId,
        observationValues: {
          numericValue: 0,
          categoryValue: "blocked",
          booleanValue: true,
        },
        traceValues: {
          numericValue: 0,
          categoryValue: "blocked",
          booleanValue: true,
        },
      }),
    ]);

    for (const { name, run } of streamAdapters) {
      const rows = await collectRows(
        await run({
          projectId,
          cutoffCreatedAt: new Date(now + 60_000),
          rowLimit: 100,
          filter: [
            {
              type: "categoryOptions",
              column: "score_categories",
              key: "observation:category",
              operator: "none of",
              value: ["blocked"],
            },
            {
              type: "booleanObject",
              column: "score_booleans",
              key: "observation-boolean",
              operator: "<>",
              value: true,
            },
            {
              type: "categoryOptions",
              column: "trace_score_categories",
              key: "trace-category",
              operator: "none of",
              value: ["blocked"],
            },
            {
              type: "booleanObject",
              column: "trace_score_booleans",
              key: "trace-boolean",
              operator: "<>",
              value: true,
            },
          ],
        }),
      );

      expect(rows.map((row) => row.id).sort(), name).toEqual(
        [allowedEventId, unscoredEventId].sort(),
      );
    }
  }, 30_000);
});
