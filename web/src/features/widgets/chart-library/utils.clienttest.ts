import { formatMetric } from "@/src/features/widgets/chart-library/utils";

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
