import {
  encodeFilters,
  decodeFilters,
  type FilterQueryOptions,
} from "../features/filters/lib/filter-query-encoding";
import { type FilterState } from "@langfuse/shared";

describe("Filter Query Encoding & Decoding", () => {
  const mockOptions: FilterQueryOptions = {
    name: [
      "chat-completion",
      "text-generation",
      "embedding",
      "chat:completion",
      "text:generation",
    ],
    environment: ["production", "staging", "development"],
    level: ["DEFAULT", "DEBUG", "WARNING", "ERROR"],
  };

  describe("Encoding", () => {
    it("should encode empty filter state to empty string", () => {
      const filters: FilterState = [];
      expect(encodeFilters(filters, mockOptions)).toBe("");
    });

    it("should encode single environment filter", () => {
      const filters: FilterState = [
        {
          column: "environment",
          type: "stringOptions",
          operator: "any of",
          value: ["production"],
        },
      ];
      expect(encodeFilters(filters, mockOptions)).toBe("env:production");
    });

    it("should encode multiple environment values", () => {
      const filters: FilterState = [
        {
          column: "environment",
          type: "stringOptions",
          operator: "any of",
          value: ["production", "staging"],
        },
      ];
      expect(encodeFilters(filters, mockOptions)).toBe(
        "env:production,staging",
      );
    });

    it("should encode single name filter", () => {
      const filters: FilterState = [
        {
          column: "name",
          type: "stringOptions",
          operator: "any of",
          value: ["chat-completion"],
        },
      ];
      expect(encodeFilters(filters, mockOptions)).toBe("name:chat-completion");
    });

    it("should encode single level filter", () => {
      const filters: FilterState = [
        {
          column: "level",
          type: "stringOptions",
          operator: "any of",
          value: ["ERROR"],
        },
      ];
      expect(encodeFilters(filters, mockOptions)).toBe("level:error");
    });

    it("should handle colons in filter values by quoting", () => {
      const filters: FilterState = [
        {
          column: "name",
          type: "stringOptions",
          operator: "any of",
          value: ["chat:completion", "text:generation"],
        },
      ];
      expect(encodeFilters(filters, mockOptions)).toBe(
        'name:"chat:completion","text:generation"',
      );
    });

    it("should encode multiple filters", () => {
      const filters: FilterState = [
        {
          column: "environment",
          type: "stringOptions",
          operator: "any of",
          value: ["production"],
        },
        {
          column: "level",
          type: "stringOptions",
          operator: "any of",
          value: ["ERROR", "WARNING"],
        },
      ];
      expect(encodeFilters(filters, mockOptions)).toBe(
        "env:production level:error,warning",
      );
    });

    it("should serialize filter even when all values are selected", () => {
      const filters: FilterState = [
        {
          column: "environment",
          type: "stringOptions",
          operator: "any of",
          value: ["production", "staging", "development"], // All available
        },
      ];
      expect(encodeFilters(filters, mockOptions)).toBe(
        "env:production,staging,development",
      );
    });

    it("should serialize level filter even when all levels are selected", () => {
      const filters: FilterState = [
        {
          column: "level",
          type: "stringOptions",
          operator: "any of",
          value: ["DEFAULT", "DEBUG", "WARNING", "ERROR"], // All available
        },
      ];
      expect(encodeFilters(filters, mockOptions)).toBe(
        "level:default,debug,warning,error",
      );
    });

    it("should handle mixed filters with all and specific values", () => {
      const filters: FilterState = [
        {
          column: "environment",
          type: "stringOptions",
          operator: "any of",
          value: ["production", "staging", "development"], // All - now included
        },
        {
          column: "level",
          type: "stringOptions",
          operator: "any of",
          value: ["ERROR"], // Specific - should be included
        },
      ];
      expect(encodeFilters(filters, mockOptions)).toBe(
        "env:production,staging,development level:error",
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
          column: "environment",
          type: "stringOptions",
          operator: "any of",
          value: ["production"],
        },
      ];
      expect(encodeFilters(filters, mockOptions)).toBe("env:production");
    });
  });

  describe("Decoding", () => {
    it("should decode empty string to empty filter state", () => {
      expect(decodeFilters("", mockOptions)).toEqual([]);
    });

    it("should decode single environment filter", () => {
      const result = decodeFilters("env:production", mockOptions);
      expect(result).toEqual([
        {
          column: "environment",
          type: "stringOptions",
          operator: "any of",
          value: ["production"],
        },
      ]);
    });

    it("should decode quoted values with colons", () => {
      const result = decodeFilters(
        'name:"chat:completion","text:generation"',
        mockOptions,
      );
      expect(result).toEqual([
        {
          column: "name",
          type: "stringOptions",
          operator: "any of",
          value: ["chat:completion", "text:generation"],
        },
      ]);
    });

    it("should decode multiple environment values", () => {
      const result = decodeFilters("env:production,staging", mockOptions);
      expect(result).toEqual([
        {
          column: "environment",
          type: "stringOptions",
          operator: "any of",
          value: ["production", "staging"],
        },
      ]);
    });

    it("should decode multiple filters", () => {
      const result = decodeFilters(
        "env:production level:error,warning",
        mockOptions,
      );
      expect(result).toEqual([
        {
          column: "environment",
          type: "stringOptions",
          operator: "any of",
          value: ["production"],
        },
        {
          column: "level",
          type: "stringOptions",
          operator: "any of",
          value: ["ERROR", "WARNING"],
        },
      ]);
    });

    it("should ignore empty filter values (malformed query)", () => {
      const result = decodeFilters("env:", mockOptions);
      expect(result).toEqual([]);
    });

    it("should ignore unknown filter types", () => {
      const result = decodeFilters(
        "env:production unknown:value level:error",
        mockOptions,
      );
      expect(result).toEqual([
        {
          column: "environment",
          type: "stringOptions",
          operator: "any of",
          value: ["production"],
        },
        {
          column: "level",
          type: "stringOptions",
          operator: "any of",
          value: ["ERROR"],
        },
      ]);
    });

    it("should filter out invalid values for known filters", () => {
      const result = decodeFilters(
        "env:production,invalid,staging",
        mockOptions,
      );
      expect(result).toEqual([
        {
          column: "environment",
          type: "stringOptions",
          operator: "any of",
          value: ["production", "staging"], // 'invalid' filtered out
        },
      ]);
    });

    it("should handle malformed syntax gracefully", () => {
      // Missing colon
      expect(decodeFilters("environment", mockOptions)).toEqual([]);

      // Multiple colons
      expect(decodeFilters("env:production:extra", mockOptions)).toEqual([]);

      // Empty parts
      expect(decodeFilters("env:production  level:error", mockOptions)).toEqual(
        [
          {
            column: "environment",
            type: "stringOptions",
            operator: "any of",
            value: ["production"],
          },
          {
            column: "level",
            type: "stringOptions",
            operator: "any of",
            value: ["ERROR"],
          },
        ],
      );
    });
  });

  describe("Round-trip consistency", () => {
    it("should maintain consistency through encode -> decode", () => {
      const originalFilters: FilterState = [
        {
          column: "environment",
          type: "stringOptions",
          operator: "any of",
          value: ["production", "staging"],
        },
        {
          column: "level",
          type: "stringOptions",
          operator: "any of",
          value: ["ERROR"],
        },
      ];

      const serialized = encodeFilters(originalFilters, mockOptions);
      const deserialized = decodeFilters(serialized, mockOptions);

      expect(deserialized).toEqual(originalFilters);
    });

    it("should maintain consistency for values with colons through encode -> decode", () => {
      const originalFilters: FilterState = [
        {
          column: "name",
          type: "stringOptions",
          operator: "any of",
          value: ["chat:completion", "text:generation"],
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
          column: "environment",
          type: "stringOptions",
          operator: "any of",
          value: ["production", "staging", "development"],
        },
      ];

      const serialized = encodeFilters(allEnvironmentsFilter, mockOptions);
      expect(serialized).toBe("env:production,staging,development"); // Should encode all values

      const deserialized = decodeFilters(serialized, mockOptions);
      expect(deserialized).toEqual(allEnvironmentsFilter); // Should decode to original
    });
  });
});
