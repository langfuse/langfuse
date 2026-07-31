import { describe, expect, it } from "vitest";

import {
  getWidgetRequiredVersion,
  resolveWidgetEditorVersion,
  resolveWidgetRenderVersion,
  type WidgetQueryShape,
} from "./widgetVersion";

const v1Shape: WidgetQueryShape = {
  view: "observations",
  dimensions: [{ field: "name" }],
  measures: [{ measure: "count" }],
  filters: [],
};

const v2Shape: WidgetQueryShape = {
  ...v1Shape,
  dimensions: [{ field: "experimentName" }],
};

const tracesShape: WidgetQueryShape = {
  view: "traces",
  dimensions: [{ field: "name" }],
  measures: [{ measure: "count" }],
  filters: [],
};

describe("widget query version selection", () => {
  it.each([
    ["v1-compatible shape", v1Shape, 1],
    ["v2-only shape", v2Shape, 2],
    ["legacy traces shape", tracesShape, 1],
  ] as const)("classifies %s as v%s", (_name, shape, expected) => {
    expect(getWidgetRequiredVersion(shape)).toBe(expected);
  });

  it.each([
    ["v1-compatible observations", v1Shape, 1, "v1", "v1"],
    ["persisted v2 observations", v1Shape, 2, "v1", "v2"],
    ["active v2 observations", v1Shape, 1, "v2", "v2"],
    ["v2-only observations", v2Shape, 1, "v1", "v2"],
    ["legacy traces in v1", tracesShape, 1, "v1", "v1"],
    ["legacy traces in v4", tracesShape, 1, "v2", "v2"],
  ] as const)(
    "renders %s with the expected declaration",
    (_name, shape, persistedMinVersion, newestReadableVersion, expected) => {
      expect(
        resolveWidgetRenderVersion({
          shape,
          persistedMinVersion,
          newestReadableVersion,
        }),
      ).toBe(expected);
    },
  );

  it.each([
    ["v1 editor", v1Shape, 1, "v1", "v1"],
    ["frozen v2 editor floor", v1Shape, 2, "v1", "v2"],
    ["active v2 editor", v1Shape, 1, "v2", "v2"],
    ["v2-only current edit", v2Shape, 1, "v1", "v2"],
    ["legacy traces in active v4", tracesShape, 1, "v2", "v2"],
  ] as const)(
    "edits %s with the expected declaration",
    (_name, shape, baseMinVersion, activeVersion, expected) => {
      expect(
        resolveWidgetEditorVersion({
          shape,
          baseMinVersion,
          activeVersion,
        }),
      ).toBe(expected);
    },
  );
});
