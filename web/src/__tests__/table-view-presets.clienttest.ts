// @vitest-environment node

import {
  validateOrderBy,
  validateFilters,
} from "@/src/components/table/table-view-presets/validation";
import {
  type ColumnDefinition,
  type FilterState,
  type OrderByState,
} from "@langfuse/shared";
import { experimentsFilterConfig } from "@/src/features/experiments/components/table/filter-config";
import { experimentItemsFilterConfig } from "@/src/features/experiments/config/experiment-items-filter-config";

// Mock data for testing
const mockColumns = [
  { id: "name", enableSorting: true, accessorKey: "name" },
  { id: "traceName", enableSorting: true, accessorKey: "traceName" },
  { id: "status", enableSorting: true, accessorKey: "status" },
  { id: "age", enableSorting: false, accessorKey: "age" },
];

const mockTraceTableColumns = [
  { id: "name", enableSorting: true, accessorKey: "name" },
  { id: "status", enableSorting: true, accessorKey: "status" },
];

const mockFilterDefinitions: ColumnDefinition[] = [
  {
    id: "traceName",
    name: "Name",
    type: "string",
    internal: "name",
    aliases: ["name"],
  },
  { id: "status", name: "status", type: "string", internal: "status" },
  { id: "city", name: "city", type: "string", internal: "city" },
  {
    id: "traceTags",
    name: "Tags",
    type: "arrayOptions",
    internal: "tags",
    options: [],
    aliases: ["tags"],
  },
];

describe("table view presets validation functions", () => {
  describe("validateOrderBy", () => {
    it("should return null if orderBy is null", () => {
      expect(validateOrderBy(null, mockColumns)).toBeNull();
    });

    it("should return null if columns are empty", () => {
      expect(validateOrderBy({ column: "name", order: "ASC" }, [])).toBeNull();
    });

    it("should return orderBy if column exists and supports sorting", () => {
      const orderBy: OrderByState = { column: "name", order: "ASC" };
      expect(validateOrderBy(orderBy, mockColumns)).toEqual(orderBy);
    });

    it("should normalize legacy orderBy columns via aliases", () => {
      const orderBy: OrderByState = { column: "traceName", order: "ASC" };
      expect(
        validateOrderBy(orderBy, mockTraceTableColumns, mockFilterDefinitions),
      ).toEqual({
        column: "name",
        order: "ASC",
      });
    });

    it("should return null if column does not exist", () => {
      const orderBy: OrderByState = { column: "nonexistent", order: "ASC" };
      expect(validateOrderBy(orderBy, mockColumns)).toBeNull();
    });

    it("should return null if column exists but does not support sorting", () => {
      const orderBy: OrderByState = { column: "age", order: "ASC" };
      expect(validateOrderBy(orderBy, mockColumns)).toBeNull();
    });

    it("should find a sortable column nested inside a column group", () => {
      // e.g. the events table nests totalTokens under a "Usage" group def; a
      // flat lookup dropped the saved orderBy of any view sorting by it.
      const groupedColumns = [
        { id: "name", enableSorting: true, accessorKey: "name" },
        {
          id: "usage",
          accessorKey: "usage",
          columns: [
            {
              id: "totalTokens",
              enableSorting: true,
              accessorKey: "totalTokens",
            },
            { id: "inputTokens", enableSorting: false, accessorKey: "input" },
          ],
        },
      ];
      const orderBy: OrderByState = { column: "totalTokens", order: "DESC" };
      expect(validateOrderBy(orderBy, groupedColumns)).toEqual(orderBy);
      // A nested column that opts out of sorting still returns null.
      expect(
        validateOrderBy(
          { column: "inputTokens", order: "DESC" },
          groupedColumns,
        ),
      ).toBeNull();
    });
  });

  describe("validateFilters", () => {
    it("should return all filters if filter definitions are empty", () => {
      const filters: FilterState = [
        {
          type: "string",
          value: "John",
          column: "name",
          operator: "=",
        },
      ];

      expect(validateFilters(filters, [])).toEqual(filters);
    });

    it("should filter out invalid columns", () => {
      const filters: FilterState = [
        {
          type: "string",
          value: "John",
          column: "name",
          operator: "=",
        },
        {
          type: "string",
          value: "New York",
          column: "nonexistent",
          operator: "=",
        },
      ];
      const expected = [
        {
          type: "string",
          value: "John",
          column: "traceName",
          operator: "=",
        },
      ];
      expect(validateFilters(filters, mockFilterDefinitions)).toEqual(expected);
    });

    it("should match on both id and name", () => {
      const filters: FilterState = [
        {
          type: "string",
          value: "John",
          column: "traceName",
          operator: "=",
        },
        {
          type: "string",
          value: "New York",
          column: "city",
          operator: "=",
        },
      ];
      expect(validateFilters(filters, mockFilterDefinitions)).toEqual(filters);
    });

    it("should normalize legacy aliases to canonical trace filter ids", () => {
      const filters: FilterState = [
        {
          type: "string",
          value: "John",
          column: "name",
          operator: "=",
        },
        {
          type: "arrayOptions",
          value: ["prod"],
          column: "tags",
          operator: "any of",
        },
      ];

      expect(validateFilters(filters, mockFilterDefinitions)).toEqual([
        {
          type: "string",
          value: "John",
          column: "traceName",
          operator: "=",
        },
        {
          type: "arrayOptions",
          value: ["prod"],
          column: "traceTags",
          operator: "any of",
        },
      ]);
    });

    it("should return empty array if no filters are valid", () => {
      const filters: FilterState = [
        {
          type: "string",
          value: "value1",
          column: "nonexistent1",
          operator: "=",
        },
        {
          type: "string",
          value: "value2",
          column: "nonexistent2",
          operator: "=",
        },
      ];
      expect(validateFilters(filters, mockFilterDefinitions)).toEqual([]);
    });
  });
});

describe("saved views built before the experiment score facets were unified", () => {
  // `validateFilters` drops any filter it cannot resolve to a column id, so a
  // renamed facet silently loses a saved view's filter unless the OLD id and
  // the OLD label are both aliases.
  const legacyColumns = [
    ["obs_scores_avg", "scores_avg"],
    ["Scores (numeric)", "scores_avg"],
    ["obs_score_categories", "score_categories"],
    ["Scores (categorical)", "score_categories"],
    ["obs_score_booleans", "score_booleans"],
    ["Scores (boolean)", "score_booleans"],
  ] as const;

  it.each(legacyColumns)("resolves %s onto %s", (stored, canonical) => {
    const validated = validateFilters(
      [
        {
          type: "numberObject",
          column: stored,
          key: "accuracy",
          operator: ">",
          value: 0.5,
        },
      ],
      experimentsFilterConfig.columnDefinitions,
    );

    expect(validated.map((filter) => filter.column)).toEqual([canonical]);
  });

  it.each([
    "trace_scores_avg",
    "trace_score_categories",
    "trace_score_booleans",
  ])("keeps a saved %s filter, which is no longer offered", (column) => {
    const validated = validateFilters(
      [
        {
          type: "numberObject",
          column,
          key: "accuracy",
          operator: ">",
          value: 0.5,
        },
      ],
      experimentsFilterConfig.columnDefinitions,
    );

    expect(validated.map((filter) => filter.column)).toEqual([column]);
  });

  it("keeps both levels when a saved view carries one of each", () => {
    const validated = validateFilters(
      [
        {
          type: "numberObject",
          column: "Scores (numeric)",
          key: "accuracy",
          operator: ">",
          value: 0.5,
        },
        {
          type: "numberObject",
          column: "Trace Scores (numeric)",
          key: "nps",
          operator: ">",
          value: 5,
        },
      ],
      experimentsFilterConfig.columnDefinitions,
    );

    expect(validated.map((filter) => filter.column)).toEqual([
      "scores_avg",
      "trace_scores_avg",
    ]);
  });
});

describe("saved views built before the experiment ITEM score facets were unified", () => {
  it.each([
    ["obs_scores_avg", "scores_avg"],
    ["Scores (numeric)", "scores_avg"],
    ["obs_score_categories", "score_categories"],
    ["Scores (categorical)", "score_categories"],
    ["obs_score_booleans", "score_booleans"],
    ["Scores (boolean)", "score_booleans"],
  ] as const)("resolves %s onto %s", (stored, canonical) => {
    const validated = validateFilters(
      [
        {
          type: "numberObject",
          column: stored,
          key: "accuracy",
          operator: ">",
          value: 0.5,
        },
      ],
      experimentItemsFilterConfig.columnDefinitions,
    );

    expect(validated.map((filter) => filter.column)).toEqual([canonical]);
  });

  it("keeps both levels when a saved view carries one of each", () => {
    const validated = validateFilters(
      [
        {
          type: "numberObject",
          column: "Scores (numeric)",
          key: "accuracy",
          operator: ">",
          value: 0.5,
        },
        {
          type: "numberObject",
          column: "trace_scores_avg",
          key: "nps",
          operator: ">",
          value: 5,
        },
      ],
      experimentItemsFilterConfig.columnDefinitions,
    );

    expect(validated.map((filter) => filter.column)).toEqual([
      "scores_avg",
      "trace_scores_avg",
    ]);
  });
});
