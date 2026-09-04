import { expect } from "storybook/test";
import preview from "../../../.storybook/preview";
import { CommentCountIcon } from "./CommentCountIcon";

const meta = preview.meta({
  component: CommentCountIcon,
  args: { count: 3 },
});

export const Single = meta.story({ args: { count: 1 } });
export const TwoDigits = meta.story({ args: { count: 42 } });
export const Capped = meta.story({ args: { count: 1234 } });

/**
 * The count badge overlaps the bubble's corner, and it has to do that from INSIDE
 * the icon's own box. Positioned absolutely it hung outside, so it overlapped
 * whatever followed it in a flow layout, and a clipping ancestor — the trace
 * timeline's metric cluster — cut it mid-glyph at exactly two digits.
 */
export const TheCountStaysInsideTheIconsBox = meta.story({
  name: "(Test) The Count Stays Inside The Icon's Box",
  args: { count: 1234 },
  play: async ({ canvasElement }) => {
    // By testid, not by text: the icon's own wrapper has the same textContent,
    // and a `find` over every span picks the wrapper — which measures nothing.
    const badge = canvasElement.querySelector<HTMLElement>(
      "[data-testid='comment-count']",
    );
    if (!badge) throw new Error("no capped count badge");
    const icon = badge.parentElement!;
    const box = icon.getBoundingClientRect();
    const drawn = badge.getBoundingClientRect();
    // Fully inside, on every side: the timeline's metric cluster clips both axes,
    // so an overhang out of the top is cut just as an overhang out of the right is.
    await expect(drawn.right).toBeLessThanOrEqual(box.right + 0.5);
    await expect(drawn.left).toBeGreaterThanOrEqual(box.left - 0.5);
    await expect(drawn.top).toBeGreaterThanOrEqual(box.top - 0.5);
    await expect(drawn.bottom).toBeLessThanOrEqual(box.bottom + 0.5);
    // And it still overlaps the bubble rather than sitting beside it.
    const bubble = icon.querySelector("svg")!.getBoundingClientRect();
    await expect(drawn.left).toBeLessThan(bubble.right);
  },
});
