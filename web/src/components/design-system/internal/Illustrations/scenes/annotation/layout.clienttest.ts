// @vitest-environment node

import { describe, expect, it } from "vitest";
import { SCENE_FRAMES } from "../frames";
import { ANNOTATION_DEFAULTS, type AnnotationContent } from "./content";
import { layoutAnnotation } from "./layout";

const layoutOf = (content: Partial<AnnotationContent> = {}) =>
  layoutAnnotation({ ...ANNOTATION_DEFAULTS, ...content });

describe("layoutAnnotation", () => {
  it("reproduces human.png's frame and form for its defaults", () => {
    const layout = layoutOf();

    expect(layout.viewBox).toEqual(SCENE_FRAMES.annotation);
    expect(layout.dropdown.card).toEqual({
      x: -35,
      y: 186,
      width: 225,
      height: 32,
    });
    expect(layout.score.bar).toEqual({
      x: -35,
      y: 343.5,
      width: 225,
      height: 31,
    });
    expect(layout.toggle.chosen.text).toBe("True");
    expect(layout.toggle.other.card.x).toBe(85);
  });

  it("hatches what the score leaves out and puts a ruler tick every 32 units of the fill", () => {
    const { score } = layoutOf();

    expect(score.remainder.x).toBe(-35 + 225 * 0.8);
    expect(score.text.text).toBe("8/10");
    expect(score.text.count?.format(4)).toBe("4/10");
    expect(score.ticks).toHaveLength(5);
  });

  it("raises False when the check is false", () => {
    const { toggle } = layoutOf({
      check: { label: "Is JSON output?", value: false },
    });

    expect(toggle.chosen.text).toBe("False");
    expect(toggle.face.x).toBeGreaterThan(85);
    expect(toggle.other.card.x).toBe(-35);
  });

  it("writes labels in sentence case and keeps the category as written", () => {
    const layout = layoutOf({
      category: { label: "QUESTION type", value: "Technical Issue" },
    });

    expect(layout.labels.score.slot.text).toBe("Answer quality");
    expect(layout.labels.category.slot.text).toBe("QUESTION type");
    expect(layout.dropdown.value.text).toBe("Technical Issue");
  });

  it("pads a long category less, so it stays inside the dropdown", () => {
    const long = "a category name far too long for the dropdown";
    const layout = layoutOf({ category: { label: "Category", value: long } });

    expect(layout.dropdown.valueX).toBeGreaterThanOrEqual(-35 + 12);
  });

  it("keeps the score inside its bar", () => {
    expect(
      layoutOf({ score: { label: "Score", value: 14, max: 10 } }).score
        .remainder.width,
    ).toBe(0);
    expect(
      layoutOf({ score: { label: "Score", value: -3, max: 10 } }).score
        .remainder.width,
    ).toBe(225);
    expect(
      layoutOf({ score: { label: "Score", value: 1, max: 0 } }).score.text.full,
    ).toBe("1/1");
  });
});
