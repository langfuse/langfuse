// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  EVALUATION_DEFAULTS,
  EVALUATION_LIMITS,
  statusOf,
  type EvaluationContent,
} from "./content";
import { SCENE_FRAMES } from "../frames";
import { layoutEvaluation } from "./layout";

const BASE = SCENE_FRAMES.evaluation;

const layoutOf = (content: Partial<EvaluationContent> = {}) =>
  layoutEvaluation({ ...EVALUATION_DEFAULTS, ...content });

describe("layoutEvaluation", () => {
  it("reproduces evaluation.png's frame, dots, values and card edges for its defaults", () => {
    const layout = layoutOf();

    expect(layout.viewBox).toEqual(BASE);
    expect(layout.execution.card).toEqual({
      x: 5,
      y: 180,
      width: 189,
      height: 54,
    });
    expect(layout.evaluator.face).toEqual({
      x: 11,
      y: 249,
      width: 185,
      height: 53,
    });
    expect(layout.rows.map((row) => row.card.y)).toEqual([333, 384, 435]);
    const traced = [
      { dotX: 182.5, valueX: 198.8, width: 194 },
      { dotX: 172, valueX: 186.1, width: 194 },
      { dotX: 219, valueX: 234.9, width: 229 },
    ];
    layout.rows.forEach((row, index) => {
      const expected = traced[index]!;
      expect(Math.abs(row.dotX - expected.dotX)).toBeLessThan(1);
      expect(Math.abs(row.valueX - expected.valueX)).toBeLessThan(1);
      expect(Math.abs(row.card.width - expected.width)).toBeLessThan(1);
    });
  });

  it("writes labels in sentence case and formats values", () => {
    const layout = layoutOf();

    expect(layout.execution.slot.text).toBe("LLM execution");
    expect(
      layout.rows.map((row) => `${row.name.text} ${row.value.text}`),
    ).toEqual(["Accuracy 87%", "Is JSON True", "Conciseness 0.2"]);
  });

  it("clears the old scores in order as the evaluator presses, each before its new one lands", () => {
    const { rows, run } = layoutOf();
    const clears = rows.map((row) => row.clearAt);

    expect(clears[0]).toBe(run.press);
    expect(
      Math.abs(clears[1]! - clears[0]! - (clears[2]! - clears[1]!)),
    ).toBeLessThan(2);
    rows.forEach((row) => expect(row.clearAt + 180).toBeLessThan(row.arriveAt));
  });

  it(`grows the frame for a fourth row and keeps at most ${EVALUATION_LIMITS.scores}`, () => {
    const five = Array.from({ length: 5 }, (_, i) => ({
      name: `Score ${i}`,
      value: i,
    }));

    expect(
      layoutOf({ scores: five.slice(0, 4) }).viewBox.height,
    ).toBeGreaterThan(BASE.height);
    expect(layoutOf({ scores: five }).rows).toHaveLength(
      EVALUATION_LIMITS.scores,
    );
  });
});

describe("statusOf", () => {
  it("colors booleans and thresholds unless a status is given", () => {
    expect(statusOf({ name: "a", value: false })).toBe("fail");
    expect(statusOf({ name: "a", value: 0.5, threshold: 0.5 })).toBe("pass");
    expect(statusOf({ name: "a", value: 0.4, threshold: 0.5 })).toBe("fail");
    expect(statusOf({ name: "a", value: 0.7 })).toBe("neutral");
    expect(statusOf({ name: "a", value: true, status: "neutral" })).toBe(
      "neutral",
    );
  });
});
