import type { FilterCondition } from "../../../types";
import { describe, expect, it } from "vitest";
import { buildEventsStreamQuery } from "./events-stream-query";

const projectId = "project-characterization";
const cutoffCreatedAt = new Date("2025-01-02T03:04:05.678Z");
const nativeFilter: FilterCondition = {
  column: "type",
  operator: "any of",
  value: ["GENERATION"],
  type: "stringOptions",
};

const normalizeSql = (query: string) => query.replace(/\s+/g, " ").trim();

describe("buildEventsStreamQuery", () => {
  it("builds the common event-stream selection", () => {
    const { query: rawQuery, params } = buildEventsStreamQuery({
      projectId,
      cutoffCreatedAt,
      filter: [nativeFilter],
      searchQuery: "needle",
      searchType: ["id", "content"],
      rowLimit: 17,
      configureQuery: (builder) =>
        builder.selectRaw("'configured' AS configured"),
    });
    const query = normalizeSql(rawQuery);

    expect(query).toContain("'configured' AS configured");
    expect(query).toContain("FROM events_full e");
    expect(query).toContain("e.project_id = {projectId: String}");
    expect(query).toMatch(/e\."type" IN \(\{[^}]+: Array\(String\)\}\)/);
    expect(query).toMatch(
      /e\."start_time" < \{dateTimeFilter[^}]+: DateTime64\(3\)\}/,
    );
    expect(query).toContain("hasAllTokens(lower(e.input)");
    expect(query).toContain("hasAllTokens(lower(e.output)");
    for (const column of [
      "span_id",
      "name",
      "trace_name",
      "user_id",
      "session_id",
      "trace_id",
    ]) {
      expect(query).toContain(`e.${column} ILIKE {searchString: String}`);
    }
    expect(query).toContain("e.is_deleted = 0");

    const orderIndex = query.indexOf(
      "ORDER BY e.project_id DESC, toStartOfMinute(e.start_time) DESC, e.start_time DESC",
    );
    const deduplicationIndex = query.indexOf(
      "LIMIT 1 BY e.span_id, e.project_id",
    );
    const rowLimitIndex = query.indexOf("LIMIT {limit: Int32}");
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
    const { query, params } = buildEventsStreamQuery({
      projectId,
      filter: null,
      rowLimit: 7,
      configureQuery: (builder) => builder.selectFieldSet("eval"),
    });

    expect(normalizeSql(query)).not.toMatch(/e\."start_time" < \{/);
    expect(params).toEqual({ projectId, limit: 7 });
  });

  it("keeps score filters out of the legacy stream selection", () => {
    const { query, params, eventOnlyFilters } = buildEventsStreamQuery({
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
      configureQuery: (builder) => builder.selectFieldSet("eval"),
    });

    expect(eventOnlyFilters).toEqual([nativeFilter]);
    expect(normalizeSql(query)).not.toContain("scores_agg");
    expect(Object.values(params)).not.toContain("quality");
  });

  it("keeps comment filters out of the legacy stream selection", () => {
    const { query, params, eventOnlyFilters } = buildEventsStreamQuery({
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
      configureQuery: (builder) => builder.selectFieldSet("eval"),
    });

    expect(eventOnlyFilters).toEqual([nativeFilter]);
    expect(normalizeSql(query)).not.toContain("commentContent");
    expect(Object.values(params)).not.toContain("comment-needle");
  });
});
