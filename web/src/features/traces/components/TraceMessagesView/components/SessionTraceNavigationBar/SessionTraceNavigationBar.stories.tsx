import { expect, userEvent } from "storybook/test";
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

const timeline: SessionTraceSpan[] = Array.from({ length: 36 }, (_, index) =>
  span(`trace-${index + 1}`, index * 2, 1),
);

let previousCount = 0;

const meta = preview.meta({
  component: SessionTraceNavigationBar,
  args: {
    position: 12,
    total: 36,
    sessionHref: "/project/project-1/sessions/session-1",
    currentTraceId: "trace-12",
    timeline,
    onPrevious: () => {
      previousCount += 1;
    },
    onNext: () => undefined,
  },
});

export default meta;

export const Middle = meta.story({
  name: "Middle of session",
});

export const First = meta.story({
  name: "(Test) First trace disables previous",
  args: {
    position: 1,
    total: 36,
    currentTraceId: "trace-1",
    onPrevious: undefined,
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: "Previous trace in session" }),
    ).toBeDisabled();
    await expect(
      canvas.getByRole("button", { name: "Next trace in session" }),
    ).toBeEnabled();
  },
});

export const NoSession = meta.story({
  name: "(Test) Missing trace hides the track",
  args: { currentTraceId: "missing" },
  play: async ({ canvas }) => {
    expect(
      canvas.queryByRole("group", { name: "Session timeline" }),
    ).toBeNull();
    await expect(canvas.getByText("Trace 12 of 36")).toBeVisible();
  },
});

export const Narrow = meta.story({
  name: "(Test) Narrow bar keeps the arrows in view",
  play: async ({ canvas, canvasElement }) => {
    const frame = canvasElement.parentElement;
    const row = canvas.getByRole("link", { name: /Session/ }).parentElement;
    if (!frame || !row) throw new Error("Missing bar");
    frame.style.width = "260px";
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(row.scrollWidth).toBeLessThanOrEqual(row.clientWidth + 4);
    await expect(
      canvas.getByRole("button", { name: "Next trace in session" }),
    ).toBeVisible();
  },
});

export const Keyboard = meta.story({
  name: "(Test) Shift+K selects the previous trace",
  play: async () => {
    previousCount = 0;
    await userEvent.keyboard("{Shift>}k{/Shift}");
    expect(previousCount).toBe(1);
  },
});
