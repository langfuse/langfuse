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

export const LongIdle = meta.story({
  name: "Long idle gap",
  args: {
    activeIndex: 1,
    traces: [
      trace("first", 0, 4),
      trace("current", 40, 3),
      trace("last", 46, 5),
    ],
  },
});

export const ActiveStart = meta.story({
  name: "Active at the start",
  args: { activeIndex: 0 },
});

export const ActiveMiddle = meta.story({
  name: "Active in the middle",
});

export const ActiveEnd = meta.story({
  name: "Active at the end",
  args: { activeIndex: 2 },
});

export const SingleTrace = meta.story({
  name: "Single trace",
  args: {
    activeIndex: 0,
    traces: [trace("only", 0, 6)],
  },
});

export const SegmentTooltip = meta.story({
  name: "(Test) Hover tooltip",
  play: async ({ canvas, canvasElement }) => {
    await userEvent.hover(
      canvas.getByRole("button", { name: /Go to trace 1 of 3/ }),
    );
    const tooltip = await within(canvasElement.ownerDocument.body).findByRole(
      "tooltip",
    );
    await expect(tooltip).toHaveTextContent("first");
  },
});

export const Dark = meta.story({
  name: "Dark mode",
  globals: { theme: "dark" },
});
