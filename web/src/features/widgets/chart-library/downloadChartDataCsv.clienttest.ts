import { describe, expect, it } from "vitest";
import { buildChartDataCsv } from "@/src/features/widgets/chart-library/downloadChartDataCsv";

describe("buildChartDataCsv", () => {
  it("escapes header names that contain commas, quotes, or CR/LF", () => {
    // Breakdown/dimension column names are user data and can contain
    // separators. Unescaped headers would shift every column in the export.
    const data = [
      { "model, v2": 1, 'quote"d': 2, "line\nbreak": 3, "carriage\rreturn": 4 },
    ];

    expect(buildChartDataCsv(data)).toBe(
      '"model, v2","quote""d","line\nbreak","carriage\rreturn"\n1,2,3,4',
    );
  });

  it("escapes values that contain commas, quotes, or CR/LF", () => {
    const data = [{ a: "x,y", b: 'has "quote"', c: "carriage\rreturn" }];

    expect(buildChartDataCsv(data)).toBe(
      'a,b,c\n"x,y","has ""quote""","carriage\rreturn"',
    );
  });
});
