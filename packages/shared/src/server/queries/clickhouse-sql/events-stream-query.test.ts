import type { FilterCondition } from "../../../types";
import { InvalidRequestError } from "../../../errors";
import { describe, expect, it } from "vitest";
import {
  buildEventsObservationRowSelection,
  groupEventsObservationFilters,
} from "./events-observation-row-selection";
import {
  buildEventsBlobExportStreamQuery,
  buildEventsStreamQuery,
} from "./events-stream-query";

const projectId = "project-characterization";
const cutoffCreatedAt = new Date("2025-01-02T03:04:05.678Z");
const nativeFilter: FilterCondition = {
  column: "type",
  operator: "any of",
  value: ["GENERATION"],
  type: "stringOptions",
};

const normalizeSql = (query: string) => query.replace(/\s+/g, " ").trim();

const buildSelection = ({ filter }: { filter: FilterCondition[] }) => {
  const selection = buildEventsObservationRowSelection({
    projectId,
    filter,
  });

  const built = selection.queryBuilder
    .selectRaw("e.span_id AS id")
    .buildWithParams();

  return { ...selection, ...built };
};

describe("buildEventsStreamQuery", () => {
  it("builds the common event-stream selection", () => {
    const { queryBuilder } = buildEventsStreamQuery({
      projectId,
      cutoffCreatedAt,
      filter: [nativeFilter],
      searchQuery: "needle",
      searchType: ["id", "content"],
      rowLimit: 17,
    });
    const { query: rawQuery, params } = queryBuilder
      .selectFieldSet("eval")
      .buildWithParams();
    const query = normalizeSql(rawQuery);

    expect(query).toContain("e.project_id = {projectId: String}");
    expect(query).toContain("e.is_deleted = 0");

    const orderIndex = query.lastIndexOf("ORDER BY ");
    const deduplicationIndex = query.lastIndexOf("LIMIT 1 BY ");
    const rowLimitIndex = query.lastIndexOf("LIMIT {");
    expect(orderIndex).toBeGreaterThan(-1);
    expect(orderIndex).toBeLessThan(deduplicationIndex);
    expect(deduplicationIndex).toBeLessThan(rowLimitIndex);

    expect(params).toMatchObject({
      projectId,
      searchString: "%needle%",
      limit: 17,
    });
    expect(Object.values(params)).toContainEqual(["GENERATION"]);
    expect(Object.values(params)).toContain(cutoffCreatedAt.getTime());
  });

  it("omits the optional cutoff when it is absent", () => {
    const { queryBuilder } = buildEventsStreamQuery({
      projectId,
      filter: null,
      rowLimit: 7,
    });
    const { query, params } = queryBuilder
      .selectFieldSet("eval")
      .buildWithParams();

    expect(normalizeSql(query)).not.toMatch(/e\."start_time" < \{/);
    expect(params).toEqual({ projectId, limit: 7 });
  });

  it("reads events_full when a metadata filter is present", () => {
    const { queryBuilder } = buildEventsStreamQuery({
      projectId,
      filter: [
        {
          column: "metadata",
          key: "payload",
          operator: "contains",
          value: "needle",
          type: "stringObject",
        },
      ],
      rowLimit: 7,
    });
    const { query } = queryBuilder.selectFieldSet("eval").buildWithParams();

    expect(normalizeSql(query)).toContain("FROM events_full e");
  });

  it("reads events_core when neither search nor filters need full I/O", () => {
    const { queryBuilder } = buildEventsStreamQuery({
      projectId,
      filter: [nativeFilter],
      rowLimit: 7,
    });
    const { query } = queryBuilder.selectFieldSet("eval").buildWithParams();

    expect(normalizeSql(query)).toContain("FROM events_core e");
  });

  it("shares one bounded score dependency between filtering and projection", () => {
    const { queryBuilder, startTimeFrom } = buildEventsBlobExportStreamQuery({
      projectId,
      filter: [
        {
          type: "datetime",
          column: "startTime",
          operator: ">=",
          value: new Date("2025-01-02T03:04:05.678Z"),
        },
        {
          type: "numberObject",
          column: "scores_avg",
          operator: ">",
          key: "quality",
          value: 0.5,
        },
      ],
      rowLimit: 7,
    });
    const { query, params } = queryBuilder.buildWithParams();

    expect(startTimeFrom).toBe(params.startTimeFrom);
    expect(query.match(/\bscores_agg AS \(/g)).toHaveLength(1);
    expect(query).toContain("s.scores_avg as scores_avg");
    expect(query).toContain("s.score_categories as score_categories");
    expect(query).toContain(
      "s.score_categories_tuples as score_categories_tuples",
    );
    expect(query).toContain(
      "ON s.trace_id = e.trace_id AND s.observation_id = e.span_id",
    );
    expect(query).toContain(
      "AND timestamp >= {startTimeFrom: DateTime64(3)} - INTERVAL 1 HOUR",
    );
  });

  it("applies score filters without exposing them as native event filters", () => {
    const { queryBuilder } = buildEventsStreamQuery({
      projectId,
      filter: [
        nativeFilter,
        {
          column: "Scores",
          key: "quality",
          operator: ">",
          value: 0.5,
          type: "numberObject",
        },
      ],
      rowLimit: 7,
    });
    const { params } = queryBuilder.selectFieldSet("eval").buildWithParams();

    expect(Object.values(params)).toContain("quality");
  });
});

describe("buildEventsObservationRowSelection", () => {
  it("routes score filters and bounds both score scans from Events time", () => {
    const startTime = new Date("2025-01-02T03:04:05.678Z");
    const { query, params, filterGroups } = buildSelection({
      filter: [
        {
          type: "datetime",
          column: "startTime",
          operator: ">=",
          value: startTime,
        },
        {
          type: "numberObject",
          column: "scores_avg",
          operator: ">",
          key: "observation-quality",
          value: 0.5,
        },
        {
          type: "numberObject",
          column: "trace_scores_avg",
          operator: ">",
          key: "trace-quality",
          value: 0.5,
        },
      ],
    });

    expect(filterGroups.events).toHaveLength(1);
    expect(filterGroups.observationScores).toHaveLength(1);
    expect(filterGroups.traceScores).toHaveLength(1);
    expect(Object.values(params)).toContain("observation-quality");
    expect(Object.values(params)).toContain("trace-quality");
    expect(query).toContain(
      "AND timestamp >= {startTimeFrom: DateTime64(3)} - INTERVAL 1 HOUR",
    );
    expect(query).toContain(
      "AND timestamp >= {startTimeFrom: DateTime64(3)} - INTERVAL 2 DAY - INTERVAL 1 HOUR",
    );
  });

  it("does not invent score time bounds without an Events lower bound", () => {
    const { query, startTimeFrom } = buildSelection({
      filter: [
        {
          type: "numberObject",
          column: "scores_avg",
          operator: ">",
          key: "observation-quality",
          value: 0.5,
        },
        {
          type: "numberObject",
          column: "trace_scores_avg",
          operator: ">",
          key: "trace-quality",
          value: 0.5,
        },
      ],
    });

    expect(startTimeFrom).toBeNull();
    expect(query).not.toContain("AND timestamp >=");
  });

  it.each([
    ["scores_avg", "observationScores"],
    ["trace_scores_avg", "traceScores"],
    ["Scores", "observationScores"],
    ["SCORES", "observationScores"],
    ["Scores (numeric)", "observationScores"],
    ["Trace Scores (numeric)", "traceScores"],
  ] as const)(
    "classifies the score column %s as %s",
    (column, expectedGroup) => {
      const filter: FilterCondition = {
        type: "numberObject",
        column,
        operator: "=",
        key: "score-key",
        value: 1,
      };
      const filterGroups = groupEventsObservationFilters([filter]);
      expect(filterGroups[expectedGroup]).toHaveLength(1);
    },
  );

  it("rejects unresolved comment filters", () => {
    expect(() =>
      buildSelection({
        filter: [
          {
            column: "commentContent",
            operator: "contains",
            value: "comment-needle",
            type: "string",
          },
        ],
      }),
    ).toThrow(InvalidRequestError);
  });
});
