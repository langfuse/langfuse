import { describe, expect, it } from "vitest";
import { tooltipPlacement } from "./tooltipPlacement";

describe("tooltipPlacement", () => {
  /** The box the placement implies, given a content size it never asks about. */
  const boxOf = (
    placement: ReturnType<typeof tooltipPlacement>,
    height: number,
  ) => {
    const width = placement.maxWidth;
    const flipX = placement.transform.includes("-100%,");
    const flipY = placement.transform.endsWith("-100%)");
    return {
      left: flipX ? placement.left - width : placement.left,
      right: flipX ? placement.left : placement.left + width,
      top: flipY ? placement.top - height : placement.top,
      bottom: flipY ? placement.top : placement.top + height,
    };
  };

  it("never leaves the viewport, at any window size or pointer position", () => {
    // Phone through desktop, including the widths where a fixed 320px cap and a
    // fixed flip threshold disagree — that combination ran the box off the right
    // edge for any pointer just short of the threshold.
    for (const viewportWidth of [320, 480, 700, 800, 830, 1024, 1280, 1920]) {
      for (const viewportHeight of [300, 568, 658, 900]) {
        for (const fraction of [0, 0.1, 0.49, 0.5, 0.51, 0.59, 0.6, 0.61, 1]) {
          const clientX = Math.round(viewportWidth * fraction);
          const clientY = Math.round(viewportHeight * fraction);
          const placement = tooltipPlacement({
            clientX,
            clientY,
            viewportWidth,
            viewportHeight,
          });
          // Two text lines, and then some, since the metrics line can wrap.
          const box = boxOf(placement, 80);
          const at = `${viewportWidth}x${viewportHeight} @${fraction}`;
          expect(box.left, `left ${at}`).toBeGreaterThanOrEqual(0);
          expect(box.right, `right ${at}`).toBeLessThanOrEqual(viewportWidth);
          expect(box.top, `top ${at}`).toBeGreaterThanOrEqual(0);
          expect(box.bottom, `bottom ${at}`).toBeLessThanOrEqual(
            viewportHeight,
          );
        }
      }
    }
  });

  it("takes the roomier side of the pointer", () => {
    const viewport = { viewportWidth: 1000, viewportHeight: 800 };
    // Left of centre: grow right and down, anchored at the pointer.
    expect(
      tooltipPlacement({ clientX: 100, clientY: 100, ...viewport }).transform,
    ).toBe("translate(0, 0)");
    // Right of centre: grow left and up, anchored by its own far edge.
    expect(
      tooltipPlacement({ clientX: 900, clientY: 700, ...viewport }).transform,
    ).toBe("translate(-100%, -100%)");
  });

  it("spends the room it has, and never more", () => {
    const viewport = { viewportWidth: 1000, viewportHeight: 800 };
    // Middle of a wide window: the full width is affordable.
    expect(
      tooltipPlacement({ clientX: 300, clientY: 400, ...viewport }).maxWidth,
    ).toBe(320);
    // 200px from the left edge leaves 200 minus the offset and the margin.
    expect(
      tooltipPlacement({ clientX: 200, clientY: 400, ...viewport }).maxWidth,
    ).toBe(320);
    expect(
      tooltipPlacement({
        clientX: 120,
        clientY: 400,
        viewportWidth: 260,
        viewportHeight: 800,
      }).maxWidth,
    ).toBe(260 - 120 - 16);
  });
});
