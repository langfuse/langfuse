import { describe, expect, it } from "vitest";

import { __test } from "./LineChartTimeSeries";

const { thresholdAnnotationChipAppearance, layoutThresholdAnnotationChip } =
  __test;

/**
 * Contrast contract for threshold annotation chips ("Alert" / "Warning").
 * Bare colored text on the translucent violation band was easy to miss on the
 * monitor live preview; chips use solid fills with white labels instead.
 */
describe("thresholdAnnotationChipAppearance", () => {
  it("pairs a solid threshold-color fill with white foreground text", () => {
    const appearance = thresholdAnnotationChipAppearance("red");
    expect(appearance.background).toBe("var(--color-red-600)");
    expect(appearance.foreground).toBe("#fff");
  });

  it("keeps the chip compact but bold-readable", () => {
    const appearance = thresholdAnnotationChipAppearance("yellow");
    expect(appearance.fontSize).toBeGreaterThanOrEqual(11);
    expect(appearance.paddingX).toBeGreaterThanOrEqual(4);
  });
});

describe("layoutThresholdAnnotationChip", () => {
  it("anchors the chip to the top-right of the reference-line viewBox", () => {
    const appearance = thresholdAnnotationChipAppearance("red");
    const layout = layoutThresholdAnnotationChip({
      label: "Alert",
      viewBox: { x: 40, y: 120, width: 400 },
      appearance,
    });

    expect(layout.x + layout.width).toBe(40 + 400 - appearance.gapFromRight);
    expect(layout.y + layout.height).toBe(120 - appearance.gapFromLine);
    expect(layout.width).toBeGreaterThan(layout.height);
  });

  it("drops the chip below the line when above would clip the chart top", () => {
    const appearance = thresholdAnnotationChipAppearance("red");
    const layout = layoutThresholdAnnotationChip({
      label: "Alert",
      viewBox: { x: 40, y: 8, width: 400 },
      appearance,
    });

    expect(layout.y).toBe(8 + appearance.gapFromLine);
  });
});
