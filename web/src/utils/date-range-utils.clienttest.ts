import { describe, expect, it } from "vitest";

import {
  DASHBOARD_AGGREGATION_OPTIONS,
  DEFAULT_DASHBOARD_AGGREGATION_SELECTION,
  rangeToString,
  resolveTimeRange,
} from "@/src/utils/date-range-utils";

describe("resolveTimeRange (presence-XOR)", () => {
  const allowed = DASHBOARD_AGGREGATION_OPTIONS;
  const fallback = DEFAULT_DASHBOARD_AGGREGATION_SELECTION;

  it("uses the URL value when present, ignoring the stored preference", () => {
    expect(
      resolveTimeRange(
        { urlValue: "7d", storedValue: "30d" },
        allowed,
        fallback,
      ),
    ).toEqual({ range: "last7Days" });
  });

  it("falls back to the stored preference when the URL has no time param", () => {
    expect(
      resolveTimeRange(
        { urlValue: undefined, storedValue: "30d" },
        allowed,
        fallback,
      ),
    ).toEqual({ range: "last30Days" });
  });

  it("degrades to the fallback when the URL preset is invalid for this view (does not fall through to storage)", () => {
    // "6h" (last6Hours) is a table-only option, absent from the dashboard set.
    // Because the URL is present it wins under XOR, so the stored "30d" must be
    // ignored entirely and the result must be the fallback — never "30d".
    expect(
      resolveTimeRange(
        { urlValue: "6h", storedValue: "30d" },
        allowed,
        fallback,
      ),
    ).toEqual({ range: fallback });
  });

  it("treats an empty-string URL value as absent", () => {
    expect(
      resolveTimeRange({ urlValue: "", storedValue: "7d" }, allowed, fallback),
    ).toEqual({ range: "last7Days" });
  });

  it("uses the view fallback when neither source is set", () => {
    expect(
      resolveTimeRange(
        { urlValue: undefined, storedValue: null },
        allowed,
        fallback,
      ),
    ).toEqual({ range: fallback });
  });

  it("degrades to the fallback when the stored preset is invalid for this view", () => {
    // "6h" (last6Hours) is a table-only option, absent from the dashboard set.
    expect(
      resolveTimeRange(
        { urlValue: undefined, storedValue: "6h" },
        allowed,
        fallback,
      ),
    ).toEqual({ range: fallback });
  });

  it("round-trips an absolute custom range from either source", () => {
    const from = new Date("2026-01-01T00:00:00.000Z");
    const to = new Date("2026-01-08T00:00:00.000Z");
    const encoded = rangeToString({ from, to });

    expect(
      resolveTimeRange(
        { urlValue: encoded, storedValue: null },
        allowed,
        fallback,
      ),
    ).toEqual({ from, to });
    expect(
      resolveTimeRange(
        { urlValue: undefined, storedValue: encoded },
        allowed,
        fallback,
      ),
    ).toEqual({ from, to });
  });
});
