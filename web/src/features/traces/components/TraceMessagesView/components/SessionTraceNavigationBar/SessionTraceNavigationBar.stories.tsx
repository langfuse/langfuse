import { expect } from "storybook/test";
import preview from "@/.storybook/preview";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { TabBar } from "@/src/components/design-system/TabBar/TabBar";
import { SessionTraceNavigationBar } from "./SessionTraceNavigationBar";
import { type TraceMessagesNeighbor } from "@/src/features/traces/components/TraceMessagesView/hooks/useTraceMessagesNavigation";

const previous: TraceMessagesNeighbor = {
  href: "/project/project-1/traces/previous?traceView=messages",
};
const next: TraceMessagesNeighbor = {
  href: "/project/project-1/traces/next?traceView=messages",
  shallow: true,
};

const meta = preview.meta({
  component: SessionTraceNavigationBar,
  args: {
    position: 12,
    total: 36,
    sessionHref: "/project/project-1/sessions/session-1",
    previous,
    next,
  },
});

export default meta;

export const Middle = meta.story({
  name: "Middle of session",
});

export const First = meta.story({
  name: "First trace",
  args: { position: 1, total: 36, previous: undefined },
});

export const Last = meta.story({
  name: "Last trace",
  args: { position: 36, total: 36, next: undefined },
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
    const toolbar = canvas.getByText("Trace 12 / 36");
    const toolbarBox = toolbar.getBoundingClientRect();
    const scrollerBox = scroller.getBoundingClientRect();
    expect(toolbarBox.bottom).toBeLessThanOrEqual(scrollerBox.top + 1);
    expect(toolbarBox.top).toBeGreaterThanOrEqual(
      messagesTab.getBoundingClientRect().bottom - 1,
    );
    expect(
      canvas.getByText("Message 1").getBoundingClientRect().top,
    ).toBeLessThan(scrollerBox.top);
    expect(canvas.getByRole("link", { name: "Previous trace" })).toBeVisible();
  },
});

export const EndsDisabled = meta.story({
  name: "(Test) Ends disable the matching control",
  args: { position: 1, total: 36, previous: undefined },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Trace 1 / 36")).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Previous trace" }),
    ).toBeDisabled();
    const nextLink = canvas.getByRole("link", { name: "Next trace" });
    expect(nextLink).toHaveAttribute(
      "href",
      "/project/project-1/traces/next?traceView=messages",
    );
    const position = canvas.getByText("Trace 1 / 36");
    expect(position.compareDocumentPosition(nextLink)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  },
});
