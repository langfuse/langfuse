import {
  formatWidgetValueByUnit,
  getDefaultView,
  shouldUseWidgetSSE,
} from "@/src/features/widgets/utils";

describe("getDefaultView", () => {
  it("should return 'observations' when v4 beta is enabled", () => {
    expect(getDefaultView(true)).toBe("observations");
  });

  it("should return 'traces' when v4 beta is disabled", () => {
    expect(getDefaultView(false)).toBe("traces");
  });
});

describe("shouldUseWidgetSSE", () => {
  it("should enable SSE on the v4 beta v2 path", () => {
    expect(
      shouldUseWidgetSSE({
        isV4Enabled: true,
        version: "v2",
      }),
    ).toBe(true);
  });

  it("should disable SSE when v4 beta is off", () => {
    expect(
      shouldUseWidgetSSE({
        isV4Enabled: false,
        version: "v2",
      }),
    ).toBe(false);
  });

  it("should disable SSE for non-v4 query versions", () => {
    expect(
      shouldUseWidgetSSE({
        isV4Enabled: true,
        version: "v1",
      }),
    ).toBe(false);
  });
});

describe("formatWidgetValueByUnit", () => {
  it("formats usd values as currency", () => {
    expect(formatWidgetValueByUnit(12.5, "USD")).toBe("$12.50");
  });

  it("formats millisecond values as compact seconds", () => {
    expect(formatWidgetValueByUnit(1250, "millisecond")).toBe("1.25s");
  });

  it("appends the unit for non-special units", () => {
    expect(formatWidgetValueByUnit(1500, "tokens")).toBe("1.5K tokens");
  });
});
