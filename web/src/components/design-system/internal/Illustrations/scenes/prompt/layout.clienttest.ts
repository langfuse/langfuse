// @vitest-environment node

import { describe, expect, it } from "vitest";
import { PROMPT_DEFAULTS, PROMPT_LIMITS, type PromptContent } from "./content";
import { SCENE_FRAMES } from "../frames";
import { layoutPrompt } from "./layout";

const BASE = SCENE_FRAMES.prompt;

const layoutOf = (content: Partial<PromptContent> = {}) =>
  layoutPrompt({ ...PROMPT_DEFAULTS, ...content });

describe("layoutPrompt", () => {
  it("reproduces prompt.png's frame and wiring for its defaults", () => {
    const layout = layoutOf();
    const { sockets, deployment } = layout;

    expect(layout.viewBox).toEqual(BASE);
    expect(layout.versions.map((version) => version.card.y)).toEqual([
      187, 259, 331,
    ]);
    expect(layout.hero.face).toEqual({
      x: 74,
      y: 317,
      width: 127,
      height: 53.5,
    });

    expect(sockets.block[0]).toBeCloseTo(129.4, 0);
    expect(sockets.block[1]).toBeCloseTo(386, 0);
    expect(deployment.card.y).toBeCloseTo(422.8, 0);
    expect(deployment.card.width).toBeCloseTo(191, 0);
  });

  it("keeps the live version last and draws the experiment's connector from its card", () => {
    const layout = layoutOf();

    expect(layout.versions.map((version) => version.live)).toEqual([
      false,
      false,
      true,
    ]);
    expect(layout.dash.startsWith(`M34 ${layout.versions[1]!.mid}`)).toBe(true);
  });

  it("falls back to the version before the live one when the experiment's version is not in the stack", () => {
    const layout = layoutOf({
      versions: ["v7", "v8"],
      experiment: { version: "v9", tag: "A/B" },
    });

    expect(layout.dash.startsWith(`M34 ${layout.versions[0]!.mid}`)).toBe(true);
  });

  it("never re-cases versions, tags or names, and sentence-cases the label", () => {
    const layout = layoutPrompt({
      versions: ["V1", "rc-2"],
      experiment: { version: "rc-2", tag: "EXP" },
      author: "marc jannick",
      label: "STAGING Canary",
    });

    expect(layout.versions.map((version) => version.slot.text)).toEqual([
      "V1",
      "rc-2",
    ]);
    expect(layout.tag.slot.text).toBe("EXP");
    expect(layout.author.slot.text).toBe("marc jannick");
    expect(layout.deployment.slot.text).toBe("STAGING canary");
  });

  it(`keeps at most ${PROMPT_LIMITS.versions} versions and an empty stack falls back to the defaults`, () => {
    expect(
      layoutOf({ versions: ["a", "b", "c", "d", "e", "f"] }).versions,
    ).toHaveLength(PROMPT_LIMITS.versions);
    expect(layoutOf({ versions: [] }).versions).toHaveLength(
      PROMPT_DEFAULTS.versions.length,
    );
  });

  it("grows the block for a long tag and the frame for long text, instead of clipping", () => {
    const layout = layoutOf({
      experiment: { version: "v2", tag: "Staging" },
      author: "Alexandra Rivera-Lund",
      label: "Production canary",
    });

    expect(layout.hero.face.width).toBeGreaterThan(127);
    expect(layout.viewBox.width).toBeGreaterThan(BASE.width);
  });
});
