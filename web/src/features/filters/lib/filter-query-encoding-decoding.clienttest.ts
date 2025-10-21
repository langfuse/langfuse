import {
  encodeFiltersGeneric,
  decodeFiltersGeneric,
} from "@/src/features/filters/lib/filter-query-encoding";
import type { FilterState } from "@langfuse/shared";

// Test-specific dinosaur-themed column mapping
const TEST_COLUMN_TO_QUERY_KEY = {
  species: "species",
  diet: "diet",
  period: "period",
  habitat: "habitat",
  extinct: "extinct",
  length: "length",
  name: "name",
  ratings: "ratings",
  scoresNumeric: "scoresNumeric",
  metadata: "metadata",
};

const TEST_COLUMN_DEFS = [
  { id: "species", name: "species", type: "stringOptions" as const },
  { id: "diet", name: "diet", type: "stringOptions" as const },
  { id: "period", name: "period", type: "stringOptions" as const },
  { id: "habitat", name: "habitat", type: "arrayOptions" as const },
  { id: "extinct", name: "extinct", type: "boolean" as const },
  { id: "length", name: "length", type: "number" as const },
  { id: "name", name: "name", type: "string" as const },
  { id: "ratings", name: "ratings", type: "categoryOptions" as const },
  {
    id: "scoresNumeric",
    name: "scoresNumeric",
    type: "numberObject" as const,
  },
  { id: "metadata", name: "metadata", type: "stringObject" as const },
];

type FilterQueryOptions = Record<
  keyof typeof TEST_COLUMN_TO_QUERY_KEY,
  string[]
>;

// Wrapper functions for tests
const encodeFilters = (filters: FilterState, options: FilterQueryOptions) =>
  encodeFiltersGeneric(filters, TEST_COLUMN_TO_QUERY_KEY, options);

const decodeFilters = (query: string, options: FilterQueryOptions) => {
  return decodeFiltersGeneric(
    query,
    TEST_COLUMN_TO_QUERY_KEY,
    options,
    (column) => {
      const columnDef = TEST_COLUMN_DEFS.find((col) => col.id === column);
      return columnDef?.type || "stringOptions";
    },
  );
};

describe("Filter Query Encoding & Decoding (Legacy Format)", () => {
  const mockOptions: FilterQueryOptions = {
    species: [
      "t-rex",
      "triceratops",
      "velociraptor",
      "brachiosaurus",
      "stegosaurus",
    ],
    diet: ["carnivore", "herbivore", "omnivore"],
    period: ["triassic", "jurassic", "cretaceous"],
    habitat: ["forest", "plains", "swamp", "desert"],
    extinct: ["Extinct", "Not extinct"],
    length: [],
    name: [],
    ratings: [],
    scoresNumeric: [],
    metadata: [],
  };

  describe("Encoding", () => {
    it("should encode empty filter state to empty string", () => {
      const filters: FilterState = [];
      expect(encodeFilters(filters, mockOptions)).toBe("");
    });

    it("should encode single categorical filter", () => {
      const filters: FilterState = [
        {
          column: "period",
          type: "stringOptions",
          operator: "any of",
          value: ["jurassic"],
        },
      ];
      expect(encodeFilters(filters, mockOptions)).toBe(
        "period;stringOptions;;any of;jurassic",
      );
    });

    it("should encode multiple values in categorical filter", () => {
      const filters: FilterState = [
        {
          column: "period",
          type: "stringOptions",
          operator: "any of",
          value: ["jurassic", "cretaceous"],
        },
      ];
      expect(encodeFilters(filters, mockOptions)).toBe(
        "period;stringOptions;;any of;jurassic%7Ccretaceous",
      );
    });

    it("should encode multiple filters", () => {
      const filters: FilterState = [
        {
          column: "period",
          type: "stringOptions",
          operator: "any of",
          value: ["jurassic"],
        },
        {
          column: "diet",
          type: "stringOptions",
          operator: "any of",
          value: ["carnivore", "omnivore"],
        },
      ];
      expect(encodeFilters(filters, mockOptions)).toBe(
        "period;stringOptions;;any of;jurassic,diet;stringOptions;;any of;carnivore%7Comnivore",
      );
    });

    it("should encode exclusive filters", () => {
      const filters: FilterState = [
        {
          column: "period",
          type: "stringOptions",
          operator: "none of",
          value: ["triassic"],
        },
      ];
      expect(encodeFilters(filters, mockOptions)).toBe(
        "period;stringOptions;;none of;triassic",
      );
    });

    it("should encode numeric >= filter", () => {
      const filters: FilterState = [
        {
          column: "length",
          type: "number",
          operator: ">=",
          value: 5,
        },
      ];
      expect(encodeFilters(filters, mockOptions)).toBe("length;number;;>=;5");
    });

    it("should encode numeric <= filter", () => {
      const filters: FilterState = [
        {
          column: "length",
          type: "number",
          operator: "<=",
          value: 10,
        },
      ];
      expect(encodeFilters(filters, mockOptions)).toBe("length;number;;<=;10");
    });

    it("should encode numeric range with both >= and <=", () => {
      const filters: FilterState = [
        {
          column: "length",
          type: "number",
          operator: ">=",
          value: 5,
        },
        {
          column: "length",
          type: "number",
          operator: "<=",
          value: 10,
        },
      ];
      expect(encodeFilters(filters, mockOptions)).toBe(
        "length;number;;>=;5,length;number;;<=;10",
      );
    });

    it("should encode string filter with contains operator", () => {
      const filters: FilterState = [
        {
          column: "name",
          type: "string",
          operator: "contains",
          value: "rex",
        },
      ];
      expect(encodeFilters(filters, mockOptions)).toBe(
        "name;string;;contains;rex",
      );
    });

    it("should encode categoryOptions filter", () => {
      const filters: FilterState = [
        {
          column: "ratings",
          type: "categoryOptions",
          operator: "any of",
          key: "danger",
          value: ["high", "medium"],
        },
      ];
      expect(encodeFilters(filters, mockOptions)).toBe(
        "ratings;categoryOptions;danger;any of;high%7Cmedium",
      );
    });

    it("should encode numberObject filter", () => {
      const filters: FilterState = [
        {
          column: "scoresNumeric",
          type: "numberObject",
          operator: ">=",
          key: "accuracy",
          value: 0.8,
        },
      ];
      expect(encodeFilters(filters, mockOptions)).toBe(
        "scoresNumeric;numberObject;accuracy;>=;0.8",
      );
    });

    it("should encode stringObject filter", () => {
      const filters: FilterState = [
        {
          column: "metadata",
          type: "stringObject",
          operator: "contains",
          key: "environment",
          value: "production",
        },
      ];
      expect(encodeFilters(filters, mockOptions)).toBe(
        "metadata;stringObject;environment;contains;production",
      );
    });

    it("should encode boolean filter", () => {
      const filters: FilterState = [
        {
          column: "extinct",
          type: "boolean",
          operator: "=",
          value: true,
        },
      ];
      expect(encodeFilters(filters, mockOptions)).toBe(
        "extinct;boolean;;=;true",
      );
    });
  });

  describe("Decoding", () => {
    it("should decode empty string to empty filter state", () => {
      expect(decodeFilters("", mockOptions)).toEqual([]);
    });

    it("should decode single categorical filter", () => {
      const result = decodeFilters(
        "period;stringOptions;;any of;triassic",
        mockOptions,
      );
      expect(result).toEqual([
        {
          column: "period",
          type: "stringOptions",
          operator: "any of",
          value: ["triassic"],
        },
      ]);
    });

    it("should decode multiple values in categorical filter", () => {
      const result = decodeFilters(
        "period;stringOptions;;any of;triassic%7Cjurassic",
        mockOptions,
      );
      expect(result).toEqual([
        {
          column: "period",
          type: "stringOptions",
          operator: "any of",
          value: ["triassic", "jurassic"],
        },
      ]);
    });

    it("should decode multiple filters", () => {
      const result = decodeFilters(
        "period;stringOptions;;any of;triassic,diet;stringOptions;;any of;carnivore%7Cherbivore",
        mockOptions,
      );
      expect(result).toEqual([
        {
          column: "period",
          type: "stringOptions",
          operator: "any of",
          value: ["triassic"],
        },
        {
          column: "diet",
          type: "stringOptions",
          operator: "any of",
          value: ["carnivore", "herbivore"],
        },
      ]);
    });

    it("should decode exclusive filters", () => {
      const result = decodeFilters(
        "period;stringOptions;;none of;triassic",
        mockOptions,
      );
      expect(result).toEqual([
        {
          column: "period",
          type: "stringOptions",
          operator: "none of",
          value: ["triassic"],
        },
      ]);
    });

    it("should decode numeric >= filter", () => {
      const query = "length;number;;%3E%3D;5";
      const decoded = decodeFilters(query, mockOptions);
      expect(decoded).toEqual([
        {
          column: "length",
          type: "number",
          operator: ">=",
          value: 5,
        },
      ]);
    });

    it("should decode numeric <= filter", () => {
      const query = "length;number;;%3C%3D;10";
      const decoded = decodeFilters(query, mockOptions);
      expect(decoded).toEqual([
        {
          column: "length",
          type: "number",
          operator: "<=",
          value: 10,
        },
      ]);
    });

    it("should decode numeric range with both >= and <=", () => {
      const query = "length;number;;%3E%3D;5,length;number;;%3C%3D;10";
      const decoded = decodeFilters(query, mockOptions);
      expect(decoded).toEqual([
        {
          column: "length",
          type: "number",
          operator: ">=",
          value: 5,
        },
        {
          column: "length",
          type: "number",
          operator: "<=",
          value: 10,
        },
      ]);
    });

    it("should decode string filter", () => {
      const query = "name;string;;contains;rex";
      const decoded = decodeFilters(query, mockOptions);
      expect(decoded).toEqual([
        {
          column: "name",
          type: "string",
          operator: "contains",
          value: "rex",
        },
      ]);
    });

    it("should decode categoryOptions filter", () => {
      const query = "ratings;categoryOptions;danger;any of;high%7Cmedium";
      const decoded = decodeFilters(query, mockOptions);
      expect(decoded).toEqual([
        {
          column: "ratings",
          type: "categoryOptions",
          operator: "any of",
          key: "danger",
          value: ["high", "medium"],
        },
      ]);
    });

    it("should decode numberObject filter", () => {
      const query = "scoresNumeric;numberObject;accuracy;%3E%3D;0.8";
      const decoded = decodeFilters(query, mockOptions);
      expect(decoded).toEqual([
        {
          column: "scoresNumeric",
          type: "numberObject",
          operator: ">=",
          key: "accuracy",
          value: 0.8,
        },
      ]);
    });

    it("should decode stringObject filter", () => {
      const query = "metadata;stringObject;environment;contains;production";
      const decoded = decodeFilters(query, mockOptions);
      expect(decoded).toEqual([
        {
          column: "metadata",
          type: "stringObject",
          operator: "contains",
          key: "environment",
          value: "production",
        },
      ]);
    });

    it("should decode boolean filter", () => {
      const query = "extinct;boolean;;%3D;true";
      const decoded = decodeFilters(query, mockOptions);
      expect(decoded).toEqual([
        {
          column: "extinct",
          type: "boolean",
          operator: "=",
          value: true,
        },
      ]);
    });
  });

  describe("Round-trip consistency", () => {
    it("should maintain consistency through encode -> decode", () => {
      const originalFilters: FilterState = [
        {
          column: "name",
          type: "string",
          operator: "contains",
          value: "tyrannosaurus rex",
        },
        {
          column: "period",
          type: "stringOptions",
          operator: "any of",
          value: ["triassic", "jurassic"],
        },
        {
          column: "diet",
          type: "stringOptions",
          operator: "any of",
          value: ["carnivore"],
        },
        {
          column: "habitat",
          type: "arrayOptions",
          operator: "any of",
          value: ["forest"],
        },
      ];

      const serialized = encodeFilters(originalFilters, mockOptions);
      const deserialized = decodeFilters(serialized, mockOptions);

      expect(deserialized).toEqual(originalFilters);
    });

    it("should maintain consistency for exclusive filters through encode -> decode", () => {
      const exclusiveFilters: FilterState = [
        {
          column: "period",
          type: "stringOptions",
          operator: "none of",
          value: ["triassic"],
        },
        {
          column: "diet",
          type: "stringOptions",
          operator: "none of",
          value: ["carnivore", "herbivore"],
        },
      ];

      const serialized = encodeFilters(exclusiveFilters, mockOptions);
      const deserialized = decodeFilters(serialized, mockOptions);

      expect(deserialized).toEqual(exclusiveFilters);
    });

    it("should maintain consistency for mixed filter types", () => {
      const mixedFilters: FilterState = [
        {
          column: "period",
          type: "stringOptions",
          operator: "any of",
          value: ["triassic", "jurassic"],
        },
        {
          column: "diet",
          type: "stringOptions",
          operator: "none of",
          value: ["omnivore"],
        },
        {
          column: "extinct",
          type: "boolean",
          operator: "=",
          value: true,
        },
        {
          column: "length",
          type: "number",
          operator: ">=",
          value: 0.5,
        },
        {
          column: "length",
          type: "number",
          operator: "<=",
          value: 15.2,
        },
        {
          column: "ratings",
          type: "categoryOptions",
          operator: "any of",
          key: "danger",
          value: ["high"],
        },
      ];

      const serialized = encodeFilters(mixedFilters, mockOptions);
      const deserialized = decodeFilters(serialized, mockOptions);

      expect(deserialized).toEqual(mixedFilters);
    });
  });
});
