import {
  formatMetric,
  getDimensionSummaries,
  getEvenTickInterval,
} from "@/src/features/widgets/chart-library/utils";
import { type DataPoint } from "@/src/features/widgets/chart-library/chart-props";

describe("formatMetric", () => {
  it("keeps compact numeric formatting within maxCharacters", () => {
    expect(
      formatMetric(12_345, { style: "compact", maxCharacters: 4 }),
    ).toEqual({
      main: "12",
      suffix: "K",
    });
    expect(
      formatMetric(1_234_567, { style: "compact", maxCharacters: 4 }),
    ).toEqual({
      main: "1.2",
      suffix: "M",
    });
    expect(
      formatMetric(-987_654_321, { style: "compact", maxCharacters: 5 }),
    ).toEqual({
      negative: true,
      main: "988",
      suffix: "M",
    });
    expect(
      formatMetric(12.3456, { style: "compact", maxCharacters: 4 }),
    ).toEqual({
      main: "12.3",
    });
  });

  it("normalizes compact units when constrained rounding reaches the next suffix", () => {
    expect(
      formatMetric(999_999, { style: "compact", maxCharacters: 4 }),
    ).toEqual({
      main: "1",
      suffix: "M",
    });
    expect(
      formatMetric(999_999_999, { style: "compact", maxCharacters: 4 }),
    ).toEqual({
      main: "1",
      suffix: "B",
    });
    expect(
      formatMetric(-999_999, { style: "compact", maxCharacters: 4 }),
    ).toEqual({
      negative: true,
      main: "1",
      suffix: "M",
    });
  });

  it("trims USD precision to fit maxCharacters", () => {
    expect(
      formatMetric(1.234567, {
        unit: "USD",
        style: "compact",
        maxCharacters: 4,
      }),
    ).toEqual({
      prefix: "$",
      main: "1.2",
    });
    expect(
      formatMetric(-1.234567, {
        unit: "USD",
        style: "compact",
        maxCharacters: 5,
      }),
    ).toEqual({
      negative: true,
      prefix: "$",
      main: "1.2",
    });
  });

  it("keeps negative currency sign ahead of the currency prefix", () => {
    expect(formatMetric(-1.234567, { unit: "USD", style: "compact" })).toEqual({
      negative: true,
      prefix: "$",
      main: "1.234567",
    });
    expect(formatMetric(-10.123456, { unit: "USD", style: "compact" })).toEqual(
      {
        negative: true,
        prefix: "$",
        main: "10.12",
      },
    );
  });

  it("trims duration precision to fit maxCharacters", () => {
    expect(
      formatMetric(1_500, {
        unit: "millisecond",
        style: "compact",
        maxCharacters: 3,
      }),
    ).toEqual({
      main: "2",
      suffix: "s",
    });
  });

  it("uses compact formatting for full-style sub-unit values above 1e-3", () => {
    expect(formatMetric(0.01234, { style: "full" })).toEqual({
      main: "0.012",
    });
    expect(formatMetric(-0.04567, { style: "full" })).toEqual({
      negative: true,
      main: "0.046",
    });
  });

  it("uses exponential formatting for very small full-style values", () => {
    expect(formatMetric(0.00012, { style: "full" })).toEqual({
      main: "1.20e-4",
    });
    expect(formatMetric(-0.00012, { style: "full" })).toEqual({
      negative: true,
      main: "1.20e-4",
    });
  });

  it("uses decimal formatting for compact sub-unit values above 1e-3", () => {
    expect(formatMetric(0.01234, { style: "compact" })).toEqual({
      main: "0.01234",
    });
    expect(
      formatMetric(-0.04567, { style: "compact", maxCharacters: 7 }),
    ).toEqual({
      negative: true,
      main: "0.0457",
    });
    expect(
      formatMetric(0.01234, { style: "compact", maxCharacters: 5 }),
    ).toEqual({
      main: "0.012",
    });
    expect(
      formatMetric(0.01234, { style: "compact", maxCharacters: 4 }),
    ).toEqual({
      main: "0.01",
    });
  });

  it("keeps zero as plain zero in compact formatting", () => {
    expect(formatMetric(0, { style: "compact" })).toEqual({
      main: "0",
    });
  });

  it("uses exponential formatting for compact very small values and shortens for maxCharacters", () => {
    expect(formatMetric(0.00012, { style: "compact" })).toEqual({
      main: "1.20e-4",
    });
    expect(
      formatMetric(0.00012, { style: "compact", maxCharacters: 6 }),
    ).toEqual({
      main: "1.2e-4",
    });
    expect(
      formatMetric(0.00012, { style: "compact", maxCharacters: 5 }),
    ).toEqual({
      main: "1e-4",
    });
  });

  it("applies maxCharacters to full formatting too", () => {
    expect(formatMetric(12.3456, { style: "full", maxCharacters: 4 })).toEqual({
      main: "12.3",
    });
    expect(formatMetric(12.3456, { style: "full", maxCharacters: 5 })).toEqual({
      main: "12.35",
    });
    expect(formatMetric(0.01234, { style: "full", maxCharacters: 5 })).toEqual({
      main: "0.012",
    });
    expect(formatMetric(0.01234, { style: "full", maxCharacters: 6 })).toEqual({
      main: "0.0123",
    });
    expect(formatMetric(0.01234, { style: "full", maxCharacters: 7 })).toEqual({
      main: "0.01234",
    });
    expect(formatMetric(0.00012, { style: "full", maxCharacters: 5 })).toEqual({
      main: "1e-4",
    });
    expect(formatMetric(0.00012, { style: "full", maxCharacters: 6 })).toEqual({
      main: "1.2e-4",
    });
    expect(formatMetric(0.00012, { style: "full", maxCharacters: 7 })).toEqual({
      main: "1.20e-4",
    });
  });
});

describe("getDimensionSummaries", () => {
  const point = (
    time_dimension: string,
    dimension: string | undefined,
    metric: DataPoint["metric"],
  ): DataPoint => ({ time_dimension, dimension, metric });

  it("sums numeric values per series", () => {
    const summaries = getDimensionSummaries([
      point("t1", "service_a", 2),
      point("t2", "service_a", 3),
      point("t1", "service_b", 10),
    ]);

    expect(summaries.get("service_a")).toBe(5);
    expect(summaries.get("service_b")).toBe(10);
  });

  it("treats 0 as a real value, not as missing data (LFE-10498)", () => {
    const summaries = getDimensionSummaries([
      point("t1", "service_c", 0),
      point("t2", "service_c", 0),
    ]);

    // A series whose data sums to 0 must keep its 0 summary, not be dropped.
    expect(summaries.get("service_c")).toBe(0);
  });

  it("reports series with no real data point as null, not 0 (LFE-10498)", () => {
    const summaries = getDimensionSummaries([
      // NaN/Infinity are not real data; the series has no finite metric.
      point("t1", "service_missing", NaN),
      point("t2", "service_missing", Infinity),
    ]);

    expect(summaries.get("service_missing")).toBeNull();
  });

  it("does not invent a value for a series that has data alongside non-finite points", () => {
    const summaries = getDimensionSummaries([
      point("t1", "service_a", NaN),
      point("t2", "service_a", 4),
    ]);

    // The single finite point counts; the NaN is ignored.
    expect(summaries.get("service_a")).toBe(4);
  });

  it("ignores the histogram tuple metric shape and rows without a dimension", () => {
    const summaries = getDimensionSummaries([
      point("t1", undefined, 5),
      point("t1", "histo", [
        [0, 1],
        [1, 2],
      ]),
    ]);

    expect(summaries.has("")).toBe(false);
    expect(summaries.get("histo")).toBeNull();
  });
});

describe("getEvenTickInterval", () => {
  it("shows every tick when the point count fits the target", () => {
    expect(getEvenTickInterval(7)).toBe(0);
    expect(getEvenTickInterval(8)).toBe(0);
    expect(getEvenTickInterval(0)).toBe(0);
  });

  it("skips ticks evenly past the target so gaps stay uniform", () => {
    // 14 daily points -> show every 2nd (6/1, 6/3, … — no width-dependent drop).
    expect(getEvenTickInterval(14)).toBe(1);
    expect(getEvenTickInterval(9)).toBe(1);
    expect(getEvenTickInterval(30)).toBe(3);
  });

  it("honors a custom max tick target", () => {
    expect(getEvenTickInterval(12, 6)).toBe(1);
    expect(getEvenTickInterval(6, 6)).toBe(0);
  });
});
