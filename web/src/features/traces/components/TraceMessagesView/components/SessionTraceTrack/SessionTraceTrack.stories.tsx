import { expect, userEvent, within } from "storybook/test";
import preview from "@/.storybook/preview";
import { SessionTraceTrack } from "./SessionTraceTrack";

const start = Date.parse("2026-03-14T14:00:00.000Z");
const minute = 60_000;

function trace(id: string, startMinute: number, durationMinute: number) {
  return {
    id,
    name: id,
    start: start + startMinute * minute,
    end: start + (startMinute + durationMinute) * minute,
  };
}

const few = [
  trace("first", 0, 4),
  trace("current", 8, 3),
  trace("last", 14, 5),
];

let selected = -1;

const meta = preview.meta({
  component: SessionTraceTrack,
  args: {
    traces: few,
    activeIndex: 1,
    onSelect: (index: number) => {
      selected = index;
    },
  },
});

export default meta;

export const FewTraces = meta.story({
  name: "(Test) Few traces are clickable",
  play: async ({ canvas }) => {
    selected = -1;
    await userEvent.click(
      canvas.getByRole("button", { name: /Go to trace 1 of 3/ }),
    );
    expect(selected).toBe(0);
  },
});

export const ManyTraces = meta.story({
  name: "(Test) Many traces are not clickable",
  args: {
    activeIndex: 40,
    traces: Array.from({ length: 400 }, (_, index) =>
      trace(`trace-${index + 1}`, index, 0.2),
    ),
  },
  play: async ({ canvas }) => {
    const track = canvas.getByRole("group", { name: "Session timeline" });
    expect(within(track).queryAllByRole("button")).toHaveLength(0);
  },
});

export const WideActive = meta.story({
  name: "(Test) Active labels follow a resize",
  args: {
    activeIndex: 1,
    traces: [
      trace("first", 0, 4),
      trace("current", 6, 30),
      trace("last", 38, 4),
    ],
  },
  play: async ({ canvas }) => {
    const track = canvas.getByRole("group", { name: "Session timeline" });
    const active = track.querySelector("[data-active]");
    const label = canvas.getByText("14:06");
    if (!(active instanceof HTMLElement))
      throw new Error("Missing active segment");
    track.style.flex = "0 0 280px";
    track.style.width = "280px";
    await new Promise((resolve) => setTimeout(resolve, 50));
    const segment = active.getBoundingClientRect();
    const text = label.getBoundingClientRect();
    expect(Math.abs(text.left - segment.left - 6)).toBeLessThan(2);
  },
});

export const ActiveEnd = meta.story({
  name: "Active at the end",
  args: { activeIndex: 2 },
});

export const IdleTooltip = meta.story({
  name: "(Test) Idle gap tooltip",
  args: {
    activeIndex: 1,
    traces: [
      trace("first", 0, 4),
      trace("current", 40, 3),
      trace("last", 46, 5),
    ],
  },
  play: async ({ canvas, canvasElement }) => {
    const gap = canvas.getByRole("img", { name: /36m/ });
    expect(gap.tabIndex).toBe(-1);
    await userEvent.hover(gap);
    const tooltip = await within(canvasElement.ownerDocument.body).findByRole(
      "tooltip",
    );
    await expect(tooltip).toHaveTextContent("Idle");
    await expect(tooltip).toHaveTextContent("From");
    await expect(tooltip).toHaveTextContent("Duration");
    await expect(tooltip).toHaveTextContent("36m");
    expect(canvas.queryByRole("button", { name: /Idle/ })).toBeNull();
  },
});

export const Dark = meta.story({
  name: "Dark mode",
  globals: { theme: "dark" },
});
