import type { FilterCondition } from "../../../types";
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

const buildSelection = ({
  filter,
  observationScores = true,
  traceScores = true,
}: {
  filter: FilterCondition[];
  observationScores?: boolean;
  traceScores?: boolean;
}) => {
  const selection = buildEventsObservationRowSelection({
    projectId,
    filter,
    scoreFilterCapabilities: {
      observation: observationScores,
      trace: traceScores,
    },
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

  it("keeps the blob-export score projection and source together", () => {
    const { queryBuilder } = buildEventsBlobExportStreamQuery({
      projectId,
      filter: [
        {
          type: "datetime",
          column: "startTime",
          operator: ">=",
          value: new Date("2025-01-02T03:04:05.678Z"),
        },
      ],
      rowLimit: 7,
    });
    const { query, params } = queryBuilder.buildWithParams();

    expect(query.match(/\bscores_agg AS \(/g)).toHaveLength(1);
    expect(query).toContain("s.scores_avg as scores_avg");
    expect(query).toContain("s.score_categories as score_categories");
    expect(query).toContain(
      "s.score_categories_tuples as score_categories_tuples",
    );
    expect(query).toContain(
      "ON s.trace_id = e.trace_id AND s.observation_id = e.span_id",
    );
    expect(params).not.toHaveProperty("startTimeFrom");
  });

  it("keeps score filters out of the legacy stream selection", () => {
    const { queryBuilder, eventOnlyFilters } = buildEventsStreamQuery({
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

    expect(eventOnlyFilters).toEqual([nativeFilter]);
    expect(Object.values(params)).not.toContain("quality");
  });

  it("keeps comment filters out of the legacy stream selection", () => {
    const { queryBuilder, eventOnlyFilters } = buildEventsStreamQuery({
      projectId,
      filter: [
        nativeFilter,
        {
          column: "commentContent",
          operator: "contains",
          value: "comment-needle",
          type: "string",
        },
      ],
      rowLimit: 7,
    });
    const { params } = queryBuilder.selectFieldSet("eval").buildWithParams();

    expect(eventOnlyFilters).toEqual([nativeFilter]);
    expect(Object.values(params)).not.toContain("comment-needle");
  });
});

describe("buildEventsObservationRowSelection", () => {
  it.each([
    ["scores_avg", "observationScores"],
    ["trace_scores_avg", "traceScores"],
    ["Scores", "observationScores"],
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

  it("does not apply score predicates when score filtering is disabled", () => {
    const { params, filterGroups } = buildSelection({
      filter: [
        {
          type: "numberObject",
          column: "scores_avg",
          operator: ">",
          key: "observation-score",
          value: 0,
        },
        {
          type: "numberObject",
          column: "trace_scores_avg",
          operator: ">",
          key: "trace-score",
          value: 0,
        },
      ],
      observationScores: false,
      traceScores: false,
    });

    expect(filterGroups.events).toHaveLength(0);
    expect(filterGroups.observationScores).toHaveLength(1);
    expect(filterGroups.traceScores).toHaveLength(1);

    expect(Object.values(params)).not.toContain("observation-score");
    expect(Object.values(params)).not.toContain("trace-score");
  });

  it("does not silently discard unresolved comment filters", () => {
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
    ).toThrow();
  });
});
