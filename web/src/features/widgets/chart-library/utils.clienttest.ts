import {
  formatMetric,
  getDimensionSummaries,
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

  const series = [
    point("t1", "svc", 10),
    point("t2", "svc", 20),
    point("t3", "svc", 60),
  ];

  it("averages finite values per series under avg mode", () => {
    const summaries = getDimensionSummaries(series, "avg");
    expect(summaries.get("svc")).toBe(30);
  });

  it("returns the median value under median mode (odd and even counts)", () => {
    expect(getDimensionSummaries(series, "median").get("svc")).toBe(20);

    const evenSeries = [
      point("t1", "svc", 10),
      point("t2", "svc", 20),
      point("t3", "svc", 30),
      point("t4", "svc", 40),
    ];
    expect(getDimensionSummaries(evenSeries, "median").get("svc")).toBe(25);
  });

  it("returns the most recent (array-order) finite value under last mode", () => {
    expect(getDimensionSummaries(series, "last").get("svc")).toBe(60);

    // A trailing non-finite bucket must not become the "last" value.
    const withTrailingGap = [
      point("t1", "svc", 5),
      point("t2", "svc", 7),
      point("t3", "svc", NaN),
    ];
    expect(getDimensionSummaries(withTrailingGap, "last").get("svc")).toBe(7);
  });

  it("reports null for a no-data series under every non-additive mode", () => {
    const empty = [point("t1", "svc", NaN), point("t2", "svc", Infinity)];
    expect(getDimensionSummaries(empty, "avg").get("svc")).toBeNull();
    expect(getDimensionSummaries(empty, "median").get("svc")).toBeNull();
    expect(getDimensionSummaries(empty, "last").get("svc")).toBeNull();
  });
});
