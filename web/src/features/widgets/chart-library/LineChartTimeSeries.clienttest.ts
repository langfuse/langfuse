import { describe, expect, it } from "vitest";

import { __test } from "./LineChartTimeSeries";

const { thresholdAnnotationLabelProps } = __test;

/**
 * Contrast contract for threshold annotation labels ("Alert" / "Warning").
 * The prior styling reused the reference-line stroke (`*-600`) at 11px with no
 * weight or halo, so red "Alert" text washed out against the tinted violation
 * band and was easy to miss on the monitor live preview.
 */
describe("thresholdAnnotationLabelProps", () => {
  it("uses a darker palette step than the reference-line stroke for fill", () => {
    const props = thresholdAnnotationLabelProps("red");
    // Reference line stroke is `*-600`; the label must be at least `*-800`.
    expect(props.fill).toBe("var(--color-red-800)");
    expect(props.fill).not.toBe("var(--color-red-600)");
  });

  it("renders at a readable size with the app bold weight role", () => {
    const props = thresholdAnnotationLabelProps("yellow");
    expect(props.fontSize).toBeGreaterThanOrEqual(12);
    expect(props.className).toContain("font-bold");
  });

  it("paints a background-colored halo so the label stays legible on the tint", () => {
    const props = thresholdAnnotationLabelProps("red");
    expect(props.paintOrder).toBe("stroke fill");
    expect(props.stroke).toBe("var(--color-background)");
    expect(props.strokeWidth).toBeGreaterThanOrEqual(3);
  });
});
