import { describe, expect, it } from "vitest";

import {
  fillMissingValuesAndTransform,
  isEmptyTimeSeries,
} from "@/src/features/dashboard/components/hooks";

const ts1 = Date.UTC(2026, 6, 1);
const ts2 = Date.UTC(2026, 6, 2);

describe("fillMissingValuesAndTransform", () => {
  it("fills missing labels with 0 by default (additive metrics)", () => {
    const result = fillMissingValuesAndTransform(
      new Map([
        [ts1, [{ label: "gpt-4", value: 5 }]],
        [ts2, []],
      ]),
      ["gpt-4", "gpt-3.5"],
    );

    expect(result).toEqual([
      {
        ts: ts1,
        values: [
          { label: "gpt-4", value: 5 },
          { label: "gpt-3.5", value: 0 },
        ],
      },
      {
        ts: ts2,
        values: [
          { label: "gpt-4", value: 0 },
          { label: "gpt-3.5", value: 0 },
        ],
      },
    ]);
  });

  it("fills missing labels with no value for gap semantics (non-additive metrics)", () => {
    // p50 latency over an empty bucket is unknown, not 0 — fabricating a 0
    // deflates the chart. (LFE-10694)
    const result = fillMissingValuesAndTransform(
      new Map([
        [ts1, [{ label: "gpt-4", value: 120 }]],
        [ts2, []],
      ]),
      ["gpt-4"],
      "gap",
    );

    expect(result).toEqual([
      { ts: ts1, values: [{ label: "gpt-4", value: 120 }] },
      { ts: ts2, values: [{ label: "gpt-4", value: undefined }] },
    ]);
  });
});

describe("isEmptyTimeSeries", () => {
  it("treats all-zero series as empty by default", () => {
    expect(
      isEmptyTimeSeries({
        data: [{ ts: ts1, values: [{ label: "a", value: 0 }] }],
      }),
    ).toBe(true);
  });

  it("treats value-less (gap-filled) series as empty by default", () => {
    expect(
      isEmptyTimeSeries({
        data: [{ ts: ts1, values: [{ label: "a", value: undefined }] }],
      }),
    ).toBe(true);
  });

  it("keeps zero/gap values as real when isNullValueAllowed is set", () => {
    expect(
      isEmptyTimeSeries({
        data: [{ ts: ts1, values: [{ label: "a", value: 0 }] }],
        isNullValueAllowed: true,
      }),
    ).toBe(false);
  });

  it("is not empty when any bucket has a real value", () => {
    expect(
      isEmptyTimeSeries({
        data: [
          { ts: ts1, values: [{ label: "a", value: undefined }] },
          { ts: ts2, values: [{ label: "a", value: 3 }] },
        ],
      }),
    ).toBe(false);
  });
});
