import type { FilterCondition } from "../../../types";
import type { OrderByState } from "../../../interfaces/orderBy";
import { InvalidRequestError } from "../../../errors/InvalidRequestError";
import { QueryCompileError } from "../../query-ast/errors";
import { describe, expect, it, vi } from "vitest";
import { fromFilterState } from "../../../query-ast/filterStateCodec";
import { convertDateToClickhouseDateTime } from "../../clickhouse/client";
import {
  buildEventsObservationRowSelection,
  groupEventsObservationFilters,
} from "./events-observation-row-selection";
import {
  buildEventsBlobExportStreamQuery,
  buildEventsStreamQuery,
} from "./events-stream-query";

// Pass-through, so a test can hand the planner a predicate shape the codec
// does not build yet.
vi.mock("../../../query-ast/filterStateCodec", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../../query-ast/filterStateCodec")
    >();
  return { ...actual, fromFilterState: vi.fn(actual.fromFilterState) };
});

const projectId = "project-characterization";
const cutoffCreatedAt = new Date("2025-01-02T03:04:05.678Z");
const nativeFilter: FilterCondition = {
  column: "type",
  operator: "any of",
  value: ["GENERATION"],
  type: "stringOptions",
};
const scoreFilter: FilterCondition = {
  type: "numberObject",
  column: "scores_avg",
  operator: ">",
  key: "quality",
  value: 0.5,
};

const normalizeSql = (query: string) => query.replace(/\s+/g, " ").trim();

const buildSelection = ({
  filter,
  orderBy,
}: {
  filter: FilterCondition[];
  orderBy?: OrderByState;
}) => {
  const selection = buildEventsObservationRowSelection({
    projectId,
    filter,
    orderBy,
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
    expect(query).toContain("e.is_app_root as is_app_root");
    expect(query).toContain("e.experiment_name as experiment_name");

    const orderIndex = query.lastIndexOf("ORDER BY ");
    const deduplicationIndex = query.lastIndexOf("LIMIT 1 BY ");
    const rowLimitIndex = query.lastIndexOf("LIMIT {");
    expect(orderIndex).toBeGreaterThan(-1);
    expect(orderIndex).toBeLessThan(deduplicationIndex);
    expect(deduplicationIndex).toBeLessThan(rowLimitIndex);

    expect(params).toMatchObject({ projectId, limit: 17 });
    expect(Object.values(params)).toContain("%needle%");
    expect(Object.values(params)).toContainEqual(["GENERATION"]);
    expect(Object.values(params)).toContain(
      convertDateToClickhouseDateTime(cutoffCreatedAt),
    );
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

describe("buildEventsBlobExportStreamQuery", () => {
  const build = (filter: FilterCondition[]) =>
    buildEventsBlobExportStreamQuery({
      projectId,
      cutoffCreatedAt,
      filter,
      rowLimit: 7,
    });

  it("ignores a positionInTrace filter, which only the observations list applies", () => {
    expect(
      build([
        nativeFilter,
        {
          column: "positionInTrace",
          type: "positionInTrace",
          operator: "=",
          key: "first",
        },
      ]),
    ).toEqual(build([nativeFilter]));
  });

  it("reads a filter on the legacy scores column as one on scores_avg", () => {
    expect(build([{ ...scoreFilter, column: "scores" }])).toEqual(
      build([scoreFilter]),
    );
  });

  // Each relation that reads a tenant table carries its own project
  // condition: `e`, and `scores` inside each score aggregate.
  it("scopes events and the scores of both score aggregates to the project", () => {
    const { query, params } = build([nativeFilter, scoreFilter]);
    const scope = Object.entries(params).find(
      ([, value]) => value === projectId,
    )?.[0];
    const [, observationScores, traceScores, outer] =
      /^with scores_agg as \((.*)\), trace_scores_agg as \((.*)\) (select .*)$/s.exec(
        query,
      ) ?? [];

    expect(scope).toBeDefined();
    for (const body of [observationScores, traceScores]) {
      expect(body).toContain(
        `from scores final where scores.project_id = {${scope}:String}`,
      );
    }
    expect(outer).toContain("from events_full as e left join ");
    expect(outer).toContain(`where e.project_id = {${scope}:String} and `);
  });

  it("adds no row condition when nothing filters", () => {
    const { query } = buildEventsBlobExportStreamQuery({
      projectId,
      filter: null,
      rowLimit: 7,
    });

    expect(query).toMatch(/ where e\.project_id = \{\w+:String\} order by /);
  });

  it.each<[string, FilterCondition]>([
    [
      "another score type than its column takes",
      {
        type: "numberObject",
        column: "score_categories",
        operator: ">",
        key: "sentiment",
        value: 1,
      },
    ],
    [
      "a type no score column takes",
      {
        type: "stringOptions",
        column: "score_categories",
        operator: "any of",
        value: ["positive"],
      },
    ],
  ])("rejects a score filter of %s", (_name, filter) => {
    expect(() => build([filter])).toThrow(InvalidRequestError);
  });

  it("rejects an unresolved comment filter", () => {
    expect(() =>
      build([
        {
          column: "commentContent",
          operator: "contains",
          value: "comment-needle",
          type: "string",
        },
      ]),
    ).toThrow(InvalidRequestError);
  });
});

describe("buildEventsObservationRowSelection", () => {
  it.each([">=", ">"] as const)(
    "routes score filters and bounds both score scans from Events time %s",
    (operator) => {
      const startTime = new Date("2025-01-02T03:04:05.678Z");
      const { query, params, filterGroups } = buildSelection({
        filter: [
          {
            type: "datetime",
            column: "startTime",
            operator,
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
      expect(Object.values(params)).toContainEqual([
        "observation-quality",
        "trace-quality",
      ]);
      expect(query.match(/\bname IN \(\{/g)).toHaveLength(2);
      expect(query).toContain(
        "AND timestamp >= {startTimeFrom: DateTime64(3)} - INTERVAL 1 HOUR",
      );
      expect(query).toContain(
        "AND timestamp >= {startTimeFrom: DateTime64(3)} - INTERVAL 2 DAY - INTERVAL 1 HOUR",
      );
    },
  );

  it("does not invent score time bounds without an Events lower bound", () => {
    const { query, rowConditions } = buildSelection({
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

    expect(rowConditions.startTime.from).toBeUndefined();
    expect(query).not.toContain("AND timestamp >=");
  });

  it("keeps complete score data when ordering by a score", () => {
    const { query } = buildSelection({
      filter: [scoreFilter],
      orderBy: { column: "scores_avg", order: "DESC" },
    });

    expect(query).not.toContain("name IN ({");

    for (const [column, expectedJoin] of [
      ["scores_avg", "LEFT JOIN scores_agg AS s"],
      ["trace_scores_avg", "LEFT JOIN trace_scores_agg AS ts"],
    ] as const) {
      const scoreOrderQuery = buildSelection({
        filter: [],
        orderBy: { column, order: "DESC" },
      }).query;
      expect(scoreOrderQuery).toContain(expectedJoin);
    }
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

  it("rejects a positionInTrace filter the caller did not strip", () => {
    expect(() =>
      buildSelection({
        filter: [
          {
            column: "positionInTrace",
            type: "positionInTrace",
            operator: "=",
            key: "first",
          },
        ],
      }),
    ).toThrow(QueryCompileError);
  });

  it("rejects a search with an empty search type as an invalid request", () => {
    expect(() =>
      buildEventsObservationRowSelection({
        projectId,
        filter: [],
        searchQuery: "needle",
        searchType: [],
      }),
    ).toThrow(InvalidRequestError);
  });

  it("compiles a predicate whose only conjunct is not a plain condition", () => {
    vi.mocked(fromFilterState).mockReturnValueOnce({
      predicate: {
        kind: "and",
        children: [
          {
            kind: "not",
            child: {
              kind: "condition",
              type: "stringOptions",
              field: { id: "type" },
              op: "any of",
              value: ["GENERATION"],
            },
          },
        ],
      },
    });

    const { query, params } = buildSelection({ filter: [nativeFilter] });

    expect(query).toMatch(/\bnot\b/i);
    expect(Object.values(params)).toContainEqual(["GENERATION"]);
  });
});
