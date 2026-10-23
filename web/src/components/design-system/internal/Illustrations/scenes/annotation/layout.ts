/**
 * Human Annotation, traced from langfuse-docs components/home/img/tools/human.png (428 × 390): a form on a tilted
 * plate — a dropdown, a True / False toggle with the picked side raised, and a score bar hatched past its value.
 * Same axes as Evaluation on a 32-unit grid; values are 15.6px text, labels 12.3px. Plan coordinates.
 */

import {
  charWidth,
  clamp01,
  floorFor,
  project,
  PROJECTION,
  round,
  type Point,
  type Rect,
} from "../../engine/projection";
import type { SceneLayout } from "../../engine/Scene";
import { label, length, truncate, type Slot } from "../../engine/slots";
import { formatValue, type FormattedValue } from "../../engine/values";
import { SCENE_FRAMES } from "../frames";
import { ANNOTATION_LIMITS, type AnnotationContent } from "./content";

const BASE = SCENE_FRAMES.annotation;
const ANNOTATION_GRID = { cell: 32.02, u: 13.9, v: 25.1 };

const VALUE_SIZE = 15.6;
const LABEL_SIZE = 12.3;
const VALUE_CHAR = charWidth(VALUE_SIZE);

const PLATE: Rect = { x: -152.3, y: 121.3, width: 458.8, height: 319.7 };
const COLUMN = { x: -35, width: 225 };
const DROPDOWN = {
  y: 186,
  height: 32,
  pad: 31,
  minPad: 12,
  chevronGap: 9.1,
  chevronWidth: 9,
  baseline: 21.9,
  chevronDrop: 1.1,
};
/** The raised side stands 13px off the floor and is a little shallower than the flat card, as in the PNG. */
const TOGGLE = {
  y: 258,
  width: 105,
  height: 50,
  depth: 13,
  raised: { dx: 7.9, dy: -10.8, height: 47.75 },
  baselineDrop: 6.6,
};
const BAR = {
  y: 343.5,
  height: 31,
  tick: 32,
  tickHeight: 4.7,
  baseline: 21.5,
  textNudge: -0.5,
};
/** Where each label sits under its control: gap to the baseline, and a nudge along the row. */
const CAPTIONS = {
  category: { gap: 19.9, dx: -0.1 },
  check: { gap: 18, dx: -0.8 },
  score: { gap: 19.6, dx: -0.1 },
};

/**
 * Run timing in ms. The dropdown's chevron flashes, the category types in, the hero toggle presses once it's set,
 * then the score bar fills as its count climbs and its ticks light along the fill.
 */
const RUN = {
  flash: 100,
  typeAt: 200,
  perChar: 26,
  press: 640,
  fillAt: 760,
  fillFor: 700,
};

type AnnotationTick = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  at: number;
};

const caption = (
  text: string,
  under: Rect,
  { gap, dx }: { gap: number; dx: number },
) => ({
  slot: label(text, ANNOTATION_LIMITS.label),
  x: under.x + dx,
  baseline: under.y + under.height + gap,
});

/** "8/10": the number counts up, the max stays. */
function scoreText(value: number, max: number): FormattedValue {
  const number = formatValue(value);
  const full = `${number.full}/${formatValue(max).full}`;
  const show = (text: string) => truncate(text, ANNOTATION_LIMITS.score);
  return {
    text: show(full),
    full,
    count: number.count && {
      to: value,
      format: (n) =>
        show(`${number.count!.format(n)}/${formatValue(max).full}`),
    },
  };
}

const RIGHT = COLUMN.x + COLUMN.width;

/** The category dropdown: its value centred with the chevron when it fits, the chevron drawn after it. */
function dropdownOf(category: AnnotationContent["category"]) {
  const card: Rect = {
    x: COLUMN.x,
    y: DROPDOWN.y,
    width: COLUMN.width,
    height: DROPDOWN.height,
  };
  const value: Slot = {
    text: truncate(category.value.trim(), ANNOTATION_LIMITS.category),
    full: category.value.trim(),
  };
  const valueWidth = VALUE_CHAR * length(value.text);
  const contentWidth = valueWidth + DROPDOWN.chevronGap + DROPDOWN.chevronWidth;
  const valueX =
    COLUMN.x +
    Math.max(
      DROPDOWN.minPad,
      Math.min(DROPDOWN.pad, (COLUMN.width - contentWidth) / 2),
    );
  const chevronX =
    valueX + valueWidth + DROPDOWN.chevronGap + DROPDOWN.chevronWidth / 2;
  const chevronY = DROPDOWN.y + DROPDOWN.height / 2 + DROPDOWN.chevronDrop;
  return {
    card,
    value,
    valueX: round(valueX),
    baseline: card.y + DROPDOWN.baseline,
    chevron: `M${round(chevronX - 4.5)} ${round(chevronY - 2.5)}L${round(chevronX)} ${round(chevronY + 2)}L${round(chevronX + 4.5)} ${round(chevronY - 2.5)}`,
  };
}

const word = (picked: boolean) => (picked ? "True" : "False");

const toggleBaselineOf = ({ y, height }: Rect) =>
  y + height / 2 + TOGGLE.baselineDrop;

/** The True / False pair: True left, False right; the picked side is raised. */
function toggleOf(isTrue: boolean) {
  const slots: [Rect, Rect] = [
    { x: COLUMN.x, y: TOGGLE.y, width: TOGGLE.width, height: TOGGLE.height },
    {
      x: RIGHT - TOGGLE.width,
      y: TOGGLE.y,
      width: TOGGLE.width,
      height: TOGGLE.height,
    },
  ];
  const chosenBase = isTrue ? slots[0] : slots[1];
  const otherBase = isTrue ? slots[1] : slots[0];
  const face: Rect = {
    ...chosenBase,
    x: chosenBase.x + TOGGLE.raised.dx,
    y: chosenBase.y + TOGGLE.raised.dy,
    height: TOGGLE.raised.height,
  };
  return {
    first: slots[0],
    face,
    depth: TOGGLE.depth,
    chosen: {
      text: word(isTrue),
      x: face.x + face.width / 2,
      baseline: toggleBaselineOf(face),
    },
    other: {
      card: otherBase,
      text: word(!isTrue),
      x: otherBase.x + otherBase.width / 2,
      baseline: toggleBaselineOf(otherBase),
    },
  };
}

/** The bar's ticks inside the fill, in screen space, each lighting as the fill passes it. */
function ticksOf(bar: Rect, filled: number): AnnotationTick[] {
  return Array.from(
    { length: Math.ceil(bar.width / BAR.tick) - 1 },
    (_, i) => (i + 1) * BAR.tick,
  )
    .filter((offset) => offset < filled)
    .map((offset) => {
      const [x, y] = project([bar.x + offset, bar.y + bar.height - 1] as Point);
      return {
        x1: round(x),
        y1: round(y),
        x2: round(x),
        y2: round(y - BAR.tickHeight),
        at: RUN.fillAt + (offset / filled) * RUN.fillFor * 0.6,
      };
    });
}

/** The score bar: filled to value / max, hatched past it. */
function scoreOf(score: AnnotationContent["score"]) {
  const max = score.max > 0 ? score.max : 1;
  const bar: Rect = {
    x: COLUMN.x,
    y: BAR.y,
    width: COLUMN.width,
    height: BAR.height,
  };
  const filled = round(bar.width * clamp01(score.value / max));
  const remainder: Rect = {
    x: bar.x + filled,
    y: bar.y,
    width: bar.width - filled,
    height: bar.height,
  };
  return {
    bar,
    remainder,
    /** How much wider the hatch is while the bar is empty, for the fill animation. */
    emptyScale: remainder.width > 0 ? round(bar.width / remainder.width) : 1,
    text: scoreText(score.value, max),
    textX: bar.x + bar.width / 2 + BAR.textNudge,
    baseline: bar.y + BAR.baseline,
    ticks: ticksOf(bar, filled),
  };
}

type Labels = {
  category: ReturnType<typeof caption>;
  check: ReturnType<typeof caption>;
  score: ReturnType<typeof caption>;
};

const labelOf = (
  labels: Labels,
  value: Slot,
  isTrue: boolean,
  shown: FormattedValue,
) =>
  `Annotation form: ${labels.category.slot.full} ${value.full}, ${labels.check.slot.full} ${word(isTrue)}, ${labels.score.slot.full} ${shown.full}`;

export function layoutAnnotation(content: AnnotationContent) {
  const { category, check, score } = content;
  const dropdown = dropdownOf(category);
  const { first, ...toggle } = toggleOf(check.value);
  const scoreBar = scoreOf(score);
  const labels: Labels = {
    category: caption(category.label, dropdown.card, CAPTIONS.category),
    check: caption(check.label, first, CAPTIONS.check),
    score: caption(score.label, scoreBar.bar, CAPTIONS.score),
  };
  return {
    projection: PROJECTION,
    viewBox: BASE,
    floor: floorFor(BASE, BASE, ANNOTATION_GRID, { side: 32, top: 110 }),
    plate: PLATE,
    panelGrid: "stops",
    keyframes: [],
    runDuration: RUN.fillAt + RUN.fillFor + 200,
    ariaLabel: labelOf(labels, dropdown.value, check.value, scoreBar.text),
    sizes: { value: VALUE_SIZE, label: LABEL_SIZE },
    labels,
    dropdown,
    toggle,
    score: scoreBar,
    run: RUN,
  } satisfies SceneLayout & Record<string, unknown>;
}
