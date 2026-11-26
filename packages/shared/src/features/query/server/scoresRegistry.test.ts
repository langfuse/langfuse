import { describe, expect, it } from "vitest";

import {
  scoresBooleanViewV2,
  scoresCategoricalViewV2,
  scoresListableCountViewV2,
  scoresNumericViewV2,
} from "../dataModel";
import { SCORE_DIMENSIONS, SCORE_MEASURES } from "./scoresRegistry";

const views = [
  scoresNumericViewV2,
  scoresCategoricalViewV2,
  scoresBooleanViewV2,
  scoresListableCountViewV2,
];

/** The names the four views declare, deduplicated in declaration order. */
const declared = (part: "dimensions" | "measures") => [
  ...new Set(views.flatMap((view) => Object.keys(view[part]))),
];

describe("v2 score registry", () => {
  it("has an entry for every dimension and measure the views declare, in order", () => {
    expect(Object.keys(SCORE_DIMENSIONS)).toEqual(declared("dimensions"));
    expect(Object.keys(SCORE_MEASURES)).toEqual(declared("measures"));
  });
});
