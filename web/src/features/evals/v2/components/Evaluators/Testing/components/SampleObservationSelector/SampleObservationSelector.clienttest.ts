import { mergeSampleFilters } from "./SampleObservationSelector";

describe("mergeSampleFilters", () => {
  it("appends an example without replacing existing filters", () => {
    expect(
      mergeSampleFilters(
        [
          {
            column: "environment",
            type: "stringOptions",
            operator: "any of",
            value: ["production"],
          },
        ],
        [
          {
            column: "type",
            type: "stringOptions",
            operator: "any of",
            value: ["GENERATION"],
          },
        ],
      ),
    ).toEqual([
      {
        column: "environment",
        type: "stringOptions",
        operator: "any of",
        value: ["production"],
      },
      {
        column: "type",
        type: "stringOptions",
        operator: "any of",
        value: ["GENERATION"],
      },
    ]);
  });

  it("unions repeated option filters instead of creating contradictory clauses", () => {
    expect(
      mergeSampleFilters(
        [
          {
            column: "type",
            type: "stringOptions",
            operator: "any of",
            value: ["SPAN"],
          },
        ],
        [
          {
            column: "type",
            type: "stringOptions",
            operator: "any of",
            value: ["GENERATION"],
          },
        ],
      ),
    ).toEqual([
      {
        column: "type",
        type: "stringOptions",
        operator: "any of",
        value: ["SPAN", "GENERATION"],
      },
    ]);
  });
});
