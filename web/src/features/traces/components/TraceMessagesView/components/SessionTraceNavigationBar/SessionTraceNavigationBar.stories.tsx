import { expect, userEvent, within } from "storybook/test";
import preview from "@/.storybook/preview";
import { SessionTraceNavigationBar } from "./SessionTraceNavigationBar";
import { type SessionTraceSpan } from "./sessionTraceProgress";

const start = Date.parse("2026-03-14T14:00:00.000Z");
const minute = 60_000;

function span(
  id: string,
  startMinute: number,
  durationMinute: number,
): SessionTraceSpan {
  return {
    id,
    name: id,
    startMs: start + startMinute * minute,
    endMs: start + (startMinute + durationMinute) * minute,
  };
}

const threeTraces: SessionTraceSpan[] = [
  span("first", 0, 4),
  span("current", 64, 3),
  span("last", 70, 5),
];

const timeline: SessionTraceSpan[] = Array.from({ length: 36 }, (_, index) =>
  span(`trace-${index + 1}`, index * 2, 1),
);

const meta = preview.meta({
  component: SessionTraceNavigationBar,
  args: {
    position: 12,
    total: 36,
    sessionHref: "/project/project-1/sessions/session-1",
    currentTraceId: "trace-12",
    timeline,
    onPrevious: () => undefined,
    onNext: () => undefined,
  },
});

export default meta;

export const Middle = meta.story({
  name: "Middle of session",
});

export const First = meta.story({
  name: "First trace",
  args: {
    position: 1,
    total: 36,
    currentTraceId: "trace-1",
    onPrevious: undefined,
  },
});

const hour = 60 * minute;

export const ShortTrace = meta.story({
  name: "(Test) Short active trace stays visible",
  args: {
    position: 2,
    total: 3,
    currentTraceId: "current",
    timeline: [
      span("first", 0, 10),
      {
        id: "current",
        startMs: start + 2 * hour,
        endMs: start + 2 * hour,
      },
      {
        id: "last",
        startMs: start + 4 * hour,
        endMs: start + 4 * hour + 10 * minute,
      },
    ],
  },
  play: async ({ canvas }) => {
    const track = canvas.getByRole("group", { name: "Session timeline" });
    const active = track.querySelector("[data-active]");
    if (!(active instanceof HTMLElement))
      throw new Error("Missing active segment");
    expect(active.getBoundingClientRect().width).toBeGreaterThanOrEqual(4);
  },
});

export const Last = meta.story({
  name: "Last trace",
  args: {
    position: 36,
    total: 36,
    currentTraceId: "trace-36",
    onNext: undefined,
  },
});

const idleTimeline: SessionTraceSpan[] = [
  span("first", 0, 2),
  span("current", 42, 3),
  span("last", 46, 2),
];

export const IdleGap = meta.story({
  name: "Long idle gap",
  args: {
    position: 2,
    total: 3,
    currentTraceId: "current",
    timeline: idleTimeline,
  },
});

export const EndsDisabled = meta.story({
  name: "(Test) Ends disable the matching control",
  args: {
    position: 1,
    total: 36,
    currentTraceId: "trace-1",
    onPrevious: undefined,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Trace 1 of 36")).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Previous trace in session" }),
    ).toBeDisabled();
    const next = canvas.getByRole("button", { name: "Next trace in session" });
    expect(next).toBeEnabled();
  },
});

export const ShortcutTooltip = meta.story({
  name: "(Test) Previous shortcut tooltip",
  play: async ({ canvas, canvasElement }) => {
    await userEvent.hover(
      canvas.getByRole("button", { name: "Previous trace in session" }),
    );
    const page = within(canvasElement.ownerDocument.body);
    const tooltip = await page.findByRole("tooltip");
    await expect(tooltip).toHaveTextContent("Previous trace in session");
    await expect(tooltip).toHaveTextContent(/⇧|Shift/);
    await expect(tooltip).toHaveTextContent("K");
  },
});

export const IdleMarked = meta.story({
  name: "(Test) Segment boundaries are cut",
  args: {
    position: 2,
    total: 3,
    currentTraceId: "current",
    timeline: idleTimeline,
  },
  play: async ({ canvas }) => {
    const track = canvas.getByRole("group", { name: "Session timeline" });
    const idle = track.querySelectorAll(".border-dashed");
    expect(idle.length).toBeGreaterThan(0);
  },
});

let openedTrace: string | undefined;

export const ClickableSegments = meta.story({
  name: "(Test) Clicking a segment navigates",
  args: {
    position: 2,
    total: 3,
    currentTraceId: "current",
    timeline: threeTraces,
    onSelectTrace: (traceId: string) => {
      openedTrace = traceId;
    },
  },
  play: async ({ canvas }) => {
    openedTrace = undefined;
    await userEvent.click(
      canvas.getByRole("button", { name: /Go to trace 1 of 3/ }),
    );
    expect(openedTrace).toBe("first");
  },
});

export const SegmentTooltip = meta.story({
  name: "(Test) Trace segment tooltip",
  args: {
    position: 2,
    total: 3,
    currentTraceId: "current",
    timeline: threeTraces,
    onSelectTrace: () => undefined,
  },
  play: async ({ canvas, canvasElement }) => {
    await userEvent.hover(
      canvas.getByRole("button", { name: /Go to trace 1 of 3/ }),
    );
    const tooltip = await within(canvasElement.ownerDocument.body).findByRole(
      "tooltip",
    );
    await expect(tooltip).toHaveTextContent("first");
    await expect(tooltip).toHaveTextContent("Trace 1 of 3");
    await expect(tooltip).toHaveTextContent("Started");
    await expect(tooltip).toHaveTextContent("Duration");
  },
});
