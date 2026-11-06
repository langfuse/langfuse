// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  OBSERVABILITY_DEFAULTS,
  OBSERVABILITY_LIMITS,
  type ObservabilityContent,
} from "./content";
import { SCENE_FRAMES } from "../frames";
import { layoutObservability } from "./layout";

const BASE = SCENE_FRAMES.observability;

const layoutOf = (content: Partial<ObservabilityContent> = {}) =>
  layoutObservability({ ...OBSERVABILITY_DEFAULTS, ...content });

describe("layoutObservability", () => {
  it("reproduces observability.png's frame and values for its defaults", () => {
    const layout = layoutOf();
    const [root, hero] = layout.rows;

    expect(layout.viewBox).toEqual(BASE);
    expect(layout.rows.map((row) => row.hero)).toEqual([
      false,
      true,
      false,
      false,
    ]);
    expect(layout.axis.ticks.map((tick) => tick.label.text)).toEqual([
      "0.00s",
      "0.50s",
      "1.00s",
      "1.50s",
      "2.00s",
    ]);
    expect([root!.name.text, root!.duration.text, root!.cost.text]).toEqual([
      "handle-chatbot-message",
      "18.22s",
      "$0.001688",
    ]);
    expect([hero!.name.text, hero!.duration.text, hero!.cost.text]).toEqual([
      "get-langfuse-prompt",
      "0.63s",
      "$0.00064",
    ]);
  });

  it("stacks rows on their footprints and fades the ones below the selected span", () => {
    const rows = layoutOf().rows;

    expect(rows.map((row) => row.opacity)).toEqual([1, 1, 0.5, 0.25]);
    rows
      .slice(1)
      .forEach((row, i) =>
        expect(row.bar.y).toBeGreaterThan(rows[i]!.bar.y + rows[i]!.bar.height),
      );
  });

  it("starts each bar at its span's start time and lets long spans run past the frame", () => {
    const [root, , , stream] = layoutOf().rows;

    expect(stream!.bar.x - root!.bar.x).toBeCloseTo(0.485 * 216, 0);
    expect(root!.bar.width).toBeGreaterThan(BASE.width);
  });

  it("cuts long span names in the middle, since they're code", () => {
    const name = "handle-chatbot-message-with-a-much-longer-suffix";
    const [row] = layoutOf({
      spans: [{ name, duration: 0.5, cost: 0.001 }],
      selected: 0,
    }).rows;

    expect(row!.name.text).toBe("handle-chatb…nger-suffix");
    expect(row!.name.full).toBe(name);
  });

  it(`keeps at most ${OBSERVABILITY_LIMITS.spans} spans and a selected index inside them`, () => {
    const spans = Array.from({ length: 7 }, (_, i) => ({
      name: `span-${i}`,
      duration: 0.1,
      cost: 0.0001,
    }));

    expect(layoutOf({ spans }).rows).toHaveLength(OBSERVABILITY_LIMITS.spans);
    expect(
      layoutOf({ spans, selected: 99 }).rows.findIndex((row) => row.hero),
    ).toBe(OBSERVABILITY_LIMITS.spans - 1);
  });

  it("grows the frame so a long raised span or a low selected row stays in view", () => {
    const wide = layoutOf({
      spans: [
        { name: "x".repeat(40), duration: 0.5, cost: 0.001 },
        ...OBSERVABILITY_DEFAULTS.spans,
      ],
      selected: 0,
    });

    expect(wide.viewBox.width).toBeGreaterThan(BASE.width);
    expect(layoutOf({ selected: 3 }).viewBox.height).toBeGreaterThan(
      BASE.height,
    );
  });
});
