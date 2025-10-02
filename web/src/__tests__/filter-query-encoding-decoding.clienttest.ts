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
};

const TEST_COLUMN_DEFS = [
  { id: "species", name: "species", type: "stringOptions" as const },
  { id: "diet", name: "diet", type: "stringOptions" as const },
  { id: "period", name: "period", type: "stringOptions" as const },
  { id: "habitat", name: "habitat", type: "arrayOptions" as const },
  { id: "extinct", name: "extinct", type: "boolean" as const },
  { id: "length", name: "length", type: "number" as const },
  { id: "name", name: "name", type: "string" as const },
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

describe("Filter Query Encoding & Decoding", () => {
  const mockOptions: FilterQueryOptions = {
    species: [
      "t-rex",
      "triceratops",
      "velociraptor",
      "brachiosaurus",
      "stegosaurus",
      "t-rex:variant",
      "triceratops:variant",
    ],
    diet: ["carnivore", "herbivore", "omnivore", "diet:special"],
    period: ["triassic", "jurassic", "cretaceous"],
    habitat: ["forest", "plains", "swamp", "desert"],
    extinct: ["Extinct", "Not extinct"],
    length: [],
    name: [],
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
      expect(encodeFilters(filters, mockOptions)).toBe("period:jurassic");
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
        "period:jurassic,cretaceous",
      );
    });

    it("should encode another categorical filter", () => {
      const filters: FilterState = [
        {
          column: "species",
          type: "stringOptions",
          operator: "any of",
          value: ["t-rex"],
        },
      ];
      expect(encodeFilters(filters, mockOptions)).toBe("species:t-rex");
    });

    it("should encode categorical filter with lowercase conversion", () => {
      const filters: FilterState = [
        {
          column: "diet",
          type: "stringOptions",
          operator: "any of",
          value: ["carnivore"],
        },
      ];
      expect(encodeFilters(filters, mockOptions)).toBe("diet:carnivore");
    });

    it("should handle colons in filter values by quoting", () => {
      const filters: FilterState = [
        {
          column: "diet",
          type: "stringOptions",
          operator: "any of",
          value: ["diet:special", "carnivore"],
        },
      ];
      expect(encodeFilters(filters, mockOptions)).toBe(
        'diet:"diet:special",carnivore',
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
        "period:jurassic diet:carnivore,omnivore",
      );
    });

    it("should serialize filter even when all values are selected", () => {
      const filters: FilterState = [
        {
          column: "period",
          type: "stringOptions",
          operator: "any of",
          value: ["triassic", "jurassic", "cretaceous"], // All available
        },
      ];
      expect(encodeFilters(filters, mockOptions)).toBe(
        "period:triassic,jurassic,cretaceous",
      );
    });

    it("should serialize level filter even when all levels are selected", () => {
      const filters: FilterState = [
        {
          column: "diet",
          type: "stringOptions",
          operator: "any of",
          value: ["herbivore", "omnivore", "herbivore", "carnivore"], // All available
        },
      ];
      expect(encodeFilters(filters, mockOptions)).toBe(
        "diet:herbivore,omnivore,herbivore,carnivore",
      );
    });

    it("should handle mixed filters with all and specific values", () => {
      const filters: FilterState = [
        {
          column: "period",
          type: "stringOptions",
          operator: "any of",
          value: ["triassic", "jurassic", "cretaceous"], // All - now included
        },
        {
          column: "diet",
          type: "stringOptions",
          operator: "any of",
          value: ["carnivore"], // Specific - should be included
        },
      ];
      expect(encodeFilters(filters, mockOptions)).toBe(
        "period:triassic,jurassic,cretaceous diet:carnivore",
      );
    });

    it("should ignore non-stringOptions filters", () => {
      const filters: FilterState = [
        {
          column: "Timestamp",
          type: "datetime",
          operator: ">=",
          value: new Date("2024-01-01"),
        },
        {
          column: "period",
          type: "stringOptions",
          operator: "any of",
          value: ["triassic"],
        },
      ];
      expect(encodeFilters(filters, mockOptions)).toBe("period:triassic");
    });

    it("should encode exclusive filters with minus prefix", () => {
      const filters: FilterState = [
        {
          column: "period",
          type: "stringOptions",
          operator: "none of",
          value: ["triassic"],
        },
      ];
      expect(encodeFilters(filters, mockOptions)).toBe("-period:triassic");
    });

    it("should encode multiple exclusive filter values", () => {
      const filters: FilterState = [
        {
          column: "diet",
          type: "stringOptions",
          operator: "none of",
          value: ["carnivore", "herbivore"],
        },
      ];
      expect(encodeFilters(filters, mockOptions)).toBe(
        "-diet:carnivore,herbivore",
      );
    });

    it("should encode mixed inclusive and exclusive filters", () => {
      const filters: FilterState = [
        {
          column: "period",
          type: "stringOptions",
          operator: "any of",
          value: ["triassic"],
        },
        {
          column: "diet",
          type: "stringOptions",
          operator: "none of",
          value: ["omnivore"],
        },
      ];
      expect(encodeFilters(filters, mockOptions)).toBe(
        "period:triassic -diet:omnivore",
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
      expect(encodeFilters(filters, mockOptions)).toBe("length:>=5");
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
      expect(encodeFilters(filters, mockOptions)).toBe("length:<=10");
    });

    it("should encode numeric range with both >= and <= as bracket notation", () => {
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
      expect(encodeFilters(filters, mockOptions)).toBe("length:[5,10]");
    });

    it("should encode numeric filter with decimal values", () => {
      const filters: FilterState = [
        {
          column: "length",
          type: "number",
          operator: ">=",
          value: 2.5,
        },
        {
          column: "length",
          type: "number",
          operator: "<=",
          value: 7.8,
        },
      ];
      expect(encodeFilters(filters, mockOptions)).toBe("length:[2.5,7.8]");
    });

    it("should encode numeric range with negative numbers", () => {
      const filters: FilterState = [
        {
          column: "length",
          type: "number",
          operator: ">=",
          value: -5,
        },
        {
          column: "length",
          type: "number",
          operator: "<=",
          value: 10,
        },
      ];
      expect(encodeFilters(filters, mockOptions)).toBe("length:[-5,10]");
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
      expect(encodeFilters(filters, mockOptions)).toBe("name:*rex*");
    });

    it("should encode string filter and escape spaces with backslashes", () => {
      const filters: FilterState = [
        {
          column: "name",
          type: "string",
          operator: "contains",
          value: "tyrannosaurus rex",
        },
      ];
      expect(encodeFilters(filters, mockOptions)).toBe(
        "name:*tyrannosaurus\\ rex*",
      );
    });

    it("should encode string filter and escape asterisks", () => {
      const filters: FilterState = [
        {
          column: "name",
          type: "string",
          operator: "contains",
          value: "t*rex",
        },
      ];
      expect(encodeFilters(filters, mockOptions)).toBe("name:*t\\*rex*");
    });

    it("should skip empty string filters", () => {
      const filters: FilterState = [
        {
          column: "name",
          type: "string",
          operator: "contains",
          value: "",
        },
        {
          column: "period",
          type: "stringOptions",
          operator: "any of",
          value: ["jurassic"],
        },
      ];
      expect(encodeFilters(filters, mockOptions)).toBe("period:jurassic");
    });
  });

  describe("Decoding", () => {
    it("should decode empty string to empty filter state", () => {
      expect(decodeFilters("", mockOptions)).toEqual([]);
    });

    it("should decode single environment filter", () => {
      const result = decodeFilters("period:triassic", mockOptions);
      expect(result).toEqual([
        {
          column: "period",
          type: "stringOptions",
          operator: "any of",
          value: ["triassic"],
        },
      ]);
    });

    it("should decode quoted values with colons", () => {
      const result = decodeFilters(
        'species:"t-rex:variant","triceratops:variant"',
        mockOptions,
      );
      expect(result).toEqual([
        {
          column: "species",
          type: "stringOptions",
          operator: "any of",
          value: ["t-rex:variant", "triceratops:variant"],
        },
      ]);
    });

    it("should decode multiple environment values", () => {
      const result = decodeFilters("period:triassic,jurassic", mockOptions);
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
        "period:triassic diet:carnivore,herbivore",
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

    it("should ignore empty filter values (malformed query)", () => {
      const result = decodeFilters("period:", mockOptions);
      expect(result).toEqual([]);
    });

    it("should ignore unknown filter types", () => {
      const result = decodeFilters(
        "period:triassic unknown:value diet:carnivore",
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
          value: ["carnivore"],
        },
      ]);
    });

    it("should filter out invalid values for known filters", () => {
      const result = decodeFilters(
        "period:triassic,invalid,jurassic",
        mockOptions,
      );
      expect(result).toEqual([
        {
          column: "period",
          type: "stringOptions",
          operator: "any of",
          value: ["triassic", "jurassic"], // 'invalid' filtered out
        },
      ]);
    });

    it("should handle malformed syntax gracefully", () => {
      // Missing colon
      expect(decodeFilters("period", mockOptions)).toEqual([]);

      // Multiple colons
      expect(decodeFilters("period:triassic:extra", mockOptions)).toEqual([]);

      // Empty parts
      expect(
        decodeFilters("period:triassic  diet:carnivore", mockOptions),
      ).toEqual([
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
          value: ["carnivore"],
        },
      ]);
    });

    it("should decode exclusive filters with minus prefix", () => {
      const result = decodeFilters("-period:triassic", mockOptions);
      expect(result).toEqual([
        {
          column: "period",
          type: "stringOptions",
          operator: "none of",
          value: ["triassic"],
        },
      ]);
    });

    it("should decode multiple exclusive filter values", () => {
      const result = decodeFilters("-diet:carnivore,herbivore", mockOptions);
      expect(result).toEqual([
        {
          column: "diet",
          type: "stringOptions",
          operator: "none of",
          value: ["carnivore", "herbivore"],
        },
      ]);
    });

    it("should decode mixed inclusive and exclusive filters", () => {
      const result = decodeFilters(
        "period:triassic -diet:omnivore",
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
          operator: "none of",
          value: ["omnivore"],
        },
      ]);
    });

    it("should handle exclusive filters with quoted values", () => {
      const result = decodeFilters('-species:"t-rex:variant"', mockOptions);
      expect(result).toEqual([
        {
          column: "species",
          type: "stringOptions",
          operator: "none of",
          value: ["t-rex:variant"],
        },
      ]);
    });

    it("should decode numeric >= filter", () => {
      const query = "length:>=5";
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
      const query = "length:<=10";
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

    it("should decode bracket notation range [min,max]", () => {
      const query = "length:[5,10]";
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

    it("should decode bracket notation with decimal values", () => {
      const query = "length:[2.5,7.8]";
      const decoded = decodeFilters(query, mockOptions);
      expect(decoded).toEqual([
        {
          column: "length",
          type: "number",
          operator: ">=",
          value: 2.5,
        },
        {
          column: "length",
          type: "number",
          operator: "<=",
          value: 7.8,
        },
      ]);
    });

    it("should decode bracket notation with negative numbers", () => {
      const query = "length:[-5,10]";
      const decoded = decodeFilters(query, mockOptions);
      expect(decoded).toEqual([
        {
          column: "length",
          type: "number",
          operator: ">=",
          value: -5,
        },
        {
          column: "length",
          type: "number",
          operator: "<=",
          value: 10,
        },
      ]);
    });

    it("should decode separate >= and <= operators as individual filters", () => {
      const query = "length:>=5 length:<=10";
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

    it("should decode string filter with asterisks", () => {
      const query = "name:*rex*";
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

    it("should decode string filter with escaped spaces", () => {
      const query = "name:*tyrannosaurus\\ rex*";
      const decoded = decodeFilters(query, mockOptions);
      expect(decoded).toEqual([
        {
          column: "name",
          type: "string",
          operator: "contains",
          value: "tyrannosaurus rex",
        },
      ]);
    });

    it("should decode string filter with escaped asterisks", () => {
      const query = "name:*t\\*rex*";
      const decoded = decodeFilters(query, mockOptions);
      expect(decoded).toEqual([
        {
          column: "name",
          type: "string",
          operator: "contains",
          value: "t*rex",
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
        {
          column: "period",
          type: "stringOptions",
          operator: "any of",
          value: ["triassic"],
        },
      ];

      const serialized = encodeFilters(originalFilters, mockOptions);
      const deserialized = decodeFilters(serialized, mockOptions);

      expect(deserialized).toEqual(originalFilters);
    });

    it("should maintain consistency for values with colons through encode -> decode", () => {
      const originalFilters: FilterState = [
        {
          column: "species",
          type: "stringOptions",
          operator: "any of",
          value: ["t-rex:variant", "triceratops:variant"],
        },
      ];

      const serialized = encodeFilters(originalFilters, mockOptions);
      const deserialized = decodeFilters(serialized, mockOptions);

      expect(deserialized).toEqual(originalFilters);
    });

    it("should handle all values selected correctly in round-trip", () => {
      // All environments selected should now be encoded and round-trip consistently
      const allEnvironmentsFilter: FilterState = [
        {
          column: "period",
          type: "stringOptions",
          operator: "any of",
          value: ["triassic", "jurassic", "cretaceous"],
        },
      ];

      const serialized = encodeFilters(allEnvironmentsFilter, mockOptions);
      expect(serialized).toBe("period:triassic,jurassic,cretaceous"); // Should encode all values

      const deserialized = decodeFilters(serialized, mockOptions);
      expect(deserialized).toEqual(allEnvironmentsFilter); // Should decode to original
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

    it("should maintain consistency for mixed inclusive/exclusive filters", () => {
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
          column: "species",
          type: "stringOptions",
          operator: "any of",
          value: ["t-rex:variant"], // With colon
        },
        {
          column: "habitat",
          type: "arrayOptions",
          operator: "none of",
          value: ["swamp"],
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
      ];

      const serialized = encodeFilters(mixedFilters, mockOptions);
      const deserialized = decodeFilters(serialized, mockOptions);

      expect(deserialized).toEqual(mixedFilters);
    });
  });
});
