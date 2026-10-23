// @vitest-environment node

import { describe, expect, it } from "vitest";
import { SCENE_FRAMES } from "../frames";
import {
  PLAYGROUND_DEFAULTS,
  PLAYGROUND_LIMITS,
  type PlaygroundContent,
} from "./content";
import { layoutPlayground, wrapPlaygroundReply } from "./layout";

const layoutOf = (content: Partial<PlaygroundContent> = {}) =>
  layoutPlayground({ ...PLAYGROUND_DEFAULTS, ...content });

describe("layoutPlayground", () => {
  it("reproduces playground.png's frame and text for its defaults, messages as written", () => {
    const layout = layoutOf();

    expect(layout.viewBox).toEqual(SCENE_FRAMES.playground);
    expect(layout.messages.map(({ slot }) => slot.text)).toEqual([
      "You're skilled customer service representa…",
      "Do I need SDK to run Langfuse on my machine",
    ]);
    expect(layout.models.map(({ name }) => name.text)).toEqual([
      "Opus 4.6",
      "GPT 5.2",
    ]);
    expect(layout.models[0]!.lines.map(({ text }) => text.slice(0, 8))).toEqual(
      [
        "No, you ",
        "To run L",
        "need Git",
        "You can ",
        "(which i",
        "The proc",
        "and star",
      ],
    );
  });

  it("ends a reply longer than its lines in an ellipsis", () => {
    const [first] = layoutOf({
      models: [{ name: "Model", output: "word ".repeat(200) }],
    }).models;

    expect(first!.lines).toHaveLength(PLAYGROUND_LIMITS.lines);
    expect(first!.lines.at(-1)!.text.endsWith("…")).toBe(true);
  });

  it("presses each model as its packet lands", () => {
    const { models, forkPackets, run } = layoutOf();

    models.forEach((model, index) =>
      expect(model.pressAt).toBe(run.fork + forkPackets[index]!.duration),
    );
    models.forEach((model) =>
      expect(model.replyAt).toBe(model.downAt + model.down.duration),
    );
    expect(models[1]!.perChar).toBeGreaterThan(models[0]!.perChar);
  });

  it("branches the fork only when there is a second model", () => {
    expect(layoutOf().fork).toContain("H");
    expect(
      layoutOf({ models: [{ name: "Opus 4.6", output: "Hi" }] }).fork,
    ).not.toContain("H");
  });
});

describe("wrapPlaygroundReply", () => {
  it("wraps on words, keeps line breaks and breaks words longer than a line", () => {
    expect(wrapPlaygroundReply("one two three four", 9, 9)).toEqual([
      "one two",
      "three",
      "four",
    ]);
    expect(wrapPlaygroundReply("first\nsecond", 50, 9)).toEqual([
      "first",
      "second",
    ]);
    expect(wrapPlaygroundReply("abcdefghijkl", 5, 9)).toEqual([
      "abcde",
      "fghij",
      "kl",
    ]);
  });
});
