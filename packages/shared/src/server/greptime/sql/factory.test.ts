import { describe, expect, it } from "vitest";

import { InvalidRequestError } from "../../../errors";
import { type EventsTableFilterState } from "../../../types";
import { FilterList } from "./greptime-filter";
import {
  createGreptimeFilterFromFilterState,
  greptimeProjectIdDefaultFilter,
} from "./factory";
import {
  tracesTableGreptimeColumnDefinitions,
  scoresTableGreptimeColumnDefinitions,
} from "./columnMappings";

const compile = (
  filter: EventsTableFilterState,
  mapping = tracesTableGreptimeColumnDefinitions,
) =>
  new FilterList(createGreptimeFilterFromFilterState(filter, mapping)).apply();

describe("createGreptimeFilterFromFilterState", () => {
  it("resolves a plain string column to a prefixed, quoted ref", () => {
    const { query } = compile([
      { type: "string", column: "name", operator: "=", value: "foo" },
    ]);
    expect(query).toMatch(/^t\.`name` = :v/);
  });

  it("routes metadata (stringObject) to a project-scoped, soft-delete-aware EAV EXISTS", () => {
    const { query } = compile([
      {
        type: "stringObject",
        column: "metadata",
        key: "env",
        operator: "=",
        value: "prod",
      },
    ]);
    // EAV over <table>_metadata, correlated on BOTH project_id and entity_id (tenant isolation),
    // filtered to live rows.
    expect(query).toContain("EXISTS (SELECT 1 FROM `traces_metadata` m");
    expect(query).toContain("m.`project_id` = t.`project_id`");
    expect(query).toContain("m.`entity_id` = t.`id`");
    expect(query).toContain("m.`is_deleted` = false");
  });

  it("routes tags (arrayOptions) to an EAV EXISTS over <table>_tags", () => {
    const { query } = compile([
      {
        type: "arrayOptions",
        column: "tags",
        operator: "any of",
        value: ["a", "b"],
      },
    ]);
    expect(query).toContain("EXISTS (SELECT 1 FROM `traces_tags` m");
    expect(query).toContain("m.`tag` IN (");
  });

  it("emits a datetime comparison with a bound ms-precision literal", () => {
    const { query, params } = compile([
      {
        type: "datetime",
        column: "timestamp",
        operator: ">=",
        value: new Date("2026-06-01T12:34:56.789Z"),
      },
    ]);
    expect(query).toMatch(/^t\.`timestamp` >= :v/);
    expect(Object.values(params)).toContain("2026-06-01 12:34:56.789");
  });

  it("maps the sessions Created At filter alias to trace timestamp", () => {
    const { query } = compile([
      {
        type: "datetime",
        column: "Created At",
        operator: ">=",
        value: new Date("2026-06-01T00:00:00.000Z"),
      },
    ]);
    expect(query).toMatch(/^t\.`timestamp` >= :v/);
  });

  it("throws on a column absent from the mapping", () => {
    expect(() =>
      createGreptimeFilterFromFilterState(
        [
          {
            type: "string",
            column: "definitelyNotAColumn",
            operator: "=",
            value: "x",
          },
        ],
        tracesTableGreptimeColumnDefinitions,
      ),
    ).toThrow(InvalidRequestError);
  });

  it("routes categoryOptions on a score-grain column to a correlated EXISTS over scores", () => {
    const { query } = compile([
      {
        type: "categoryOptions",
        column: "score_categories",
        key: "accuracy",
        operator: "any of",
        value: ["good"],
      },
    ]);
    expect(query).toContain("EXISTS (SELECT 1 FROM `scores` cs");
    expect(query).toContain("cs.`trace_id` = t.`id`");
    expect(query).toContain("cs.`string_value` IN (");
  });

  it("routes numberObject on a score-grain column to a grouped HAVING-avg EXISTS", () => {
    const { query } = compile([
      {
        type: "numberObject",
        column: "scores_avg",
        key: "quality",
        operator: ">=",
        value: 0.5,
      },
    ]);
    expect(query).toContain("EXISTS (SELECT 1 FROM `scores` cs");
    expect(query).toContain("HAVING avg(cs.`value`) >= :");
  });

  it("throws on categoryOptions when the column has no score grain", () => {
    expect(() =>
      createGreptimeFilterFromFilterState(
        [
          {
            type: "categoryOptions",
            column: "score_categories",
            key: "accuracy",
            operator: "any of",
            value: ["good"],
          },
        ],
        scoresTableGreptimeColumnDefinitions,
      ),
    ).toThrow(InvalidRequestError);
  });
});

describe("greptimeProjectIdDefaultFilter", () => {
  it("emits a prefixed project_id equality for traces and unprefixed for scores/observations", () => {
    const { tracesFilter, scoresFilter, observationsFilter } =
      greptimeProjectIdDefaultFilter("proj-1", { tracesPrefix: "t" });
    expect(tracesFilter.apply().query).toMatch(/^t\.`project_id` = :v/);
    expect(scoresFilter.apply().query).toMatch(/^`project_id` = :v/);
    expect(observationsFilter.apply().query).toMatch(/^`project_id` = :v/);
    expect(Object.values(tracesFilter.apply().params)).toContain("proj-1");
  });
});
