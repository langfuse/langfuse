import { expect, userEvent, within } from "storybook/test";
import preview from "@/.storybook/preview";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { TabBar } from "@/src/components/design-system/TabBar/TabBar";
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
    startMs: start + startMinute * minute,
    endMs: start + (startMinute + durationMinute) * minute,
  };
}

const timeline: SessionTraceSpan[] = [
  span("first", 0, 4),
  span("current", 64, 3),
  span("last", 70, 5),
];

const meta = preview.meta({
  component: SessionTraceNavigationBar,
  args: {
    position: 12,
    total: 36,
    sessionHref: "/project/project-1/sessions/session-1",
    currentTraceId: "current",
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
    currentTraceId: "first",
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
    const track = canvas.getByRole("progressbar");
    const active = track.querySelector(".bg-primary");
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
    currentTraceId: "last",
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

const messages = Array.from({ length: 16 }, (_, index) => (
  <p key={index}>Message {index + 1}</p>
));

export const Scrolled = meta.story({
  name: "(Test) Toolbar stays above the message scroller",
  render: (args) => (
    <div className="bg-background flex h-[320px] w-[640px] flex-col overflow-hidden">
      <Tabs value="messages">
        <TabBar
          label="Trace views"
          tabs={[
            { value: "trace", label: "Trace" },
            { value: "messages", label: "Messages" },
          ]}
        />
      </Tabs>
      <SessionTraceNavigationBar {...args} />
      <div className="text-muted-foreground min-h-0 flex-1 space-y-4 overflow-y-auto p-4 text-sm">
        {messages}
      </div>
    </div>
  ),
  play: async ({ canvas }) => {
    const traceTab = canvas.getByRole("tab", { name: "Trace" });
    const messagesTab = canvas.getByRole("tab", { name: "Messages" });
    expect(traceTab.getBoundingClientRect().top).toBeCloseTo(
      messagesTab.getBoundingClientRect().top,
      0,
    );
    const scroller = canvas.getByText("Message 1").parentElement;
    if (!scroller) throw new Error("Missing message scroller");
    scroller.scrollTop = scroller.scrollHeight;
    const toolbar = canvas.getByText("Trace 12 of 36");
    const toolbarBox = toolbar.getBoundingClientRect();
    const scrollerBox = scroller.getBoundingClientRect();
    expect(toolbarBox.bottom).toBeLessThanOrEqual(scrollerBox.top + 1);
    expect(toolbarBox.top).toBeGreaterThanOrEqual(
      messagesTab.getBoundingClientRect().bottom - 1,
    );
    expect(
      canvas.getByRole("button", { name: "Previous trace in session" }),
    ).toBeVisible();
  },
});

export const EndsDisabled = meta.story({
  name: "(Test) Ends disable the matching control",
  args: {
    position: 1,
    total: 36,
    currentTraceId: "first",
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

export const Narrow = meta.story({
  name: "(Test) Narrow width hides the time labels",
  render: (args) => (
    <div className="w-[280px]">
      <SessionTraceNavigationBar {...args} />
    </div>
  ),
  play: async ({ canvas }) => {
    const position = canvas.getByText("Trace 12 of 36");
    expect(position.scrollWidth).toBeLessThanOrEqual(position.clientWidth + 1);
    expect(canvas.getByText(/ \/ /)).not.toBeVisible();
    expect(canvas.getByRole("progressbar")).toBeVisible();
    expect(
      canvas.getByRole("button", { name: "Next trace in session" }),
    ).toBeVisible();
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
  name: "(Test) Idle gap is hatched",
  args: {
    position: 2,
    total: 3,
    currentTraceId: "current",
    timeline: idleTimeline,
  },
  play: async ({ canvas }) => {
    const track = canvas.getByRole("progressbar");
    const hatched = track.querySelector("[class*='repeating-linear-gradient']");
    expect(hatched).not.toBeNull();
  },
});
