import {
  validateOrderBy,
  validateFilters,
} from "@/src/components/table/table-view-presets/validation";
import {
  type ColumnDefinition,
  type FilterState,
  type OrderByState,
} from "@langfuse/shared";

// Mock data for testing
const mockColumns = [
  { id: "name", enableSorting: true, accessorKey: "name" },
  { id: "status", enableSorting: true, accessorKey: "status" },
  { id: "age", enableSorting: false, accessorKey: "age" },
];

const mockFilterDefinitions: ColumnDefinition[] = [
  { id: "name", name: "name", type: "string", internal: "name" },
  { id: "status", name: "status", type: "string", internal: "status" },
  { id: "city", name: "city", type: "string", internal: "city" },
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

    it("should return null if column does not exist", () => {
      const orderBy: OrderByState = { column: "nonexistent", order: "ASC" };
      expect(validateOrderBy(orderBy, mockColumns)).toBeNull();
    });

    it("should return null if column exists but does not support sorting", () => {
      const orderBy: OrderByState = { column: "age", order: "ASC" };
      expect(validateOrderBy(orderBy, mockColumns)).toBeNull();
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
          column: "name",
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
          column: "name",
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
