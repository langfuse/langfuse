import { expect, userEvent, within } from "storybook/test";
import preview from "@/.storybook/preview";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { TabBar } from "@/src/components/design-system/TabBar/TabBar";
import { SessionTraceNavigationBar } from "./SessionTraceNavigationBar";

const meta = preview.meta({
  component: SessionTraceNavigationBar,
  args: {
    position: 12,
    total: 36,
    sessionHref: "/project/project-1/sessions/session-1",
    traceName: "Checkout recovery",
    timestamp: new Date("2026-03-14T15:04:05.000Z"),
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
  args: { position: 1, total: 36, onPrevious: undefined },
});

export const Last = meta.story({
  name: "Last trace",
  args: { position: 36, total: 36, onNext: undefined },
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
      canvas.getByText("Message 1").getBoundingClientRect().top,
    ).toBeLessThan(scrollerBox.top);
    expect(
      canvas.getByRole("button", { name: "Previous trace in session" }),
    ).toBeVisible();
  },
});

export const EndsDisabled = meta.story({
  name: "(Test) Ends disable the matching control",
  args: { position: 1, total: 36, onPrevious: undefined },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Trace 1 of 36")).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Previous trace in session" }),
    ).toBeDisabled();
    const next = canvas.getByRole("button", {
      name: "Next trace in session",
    });
    expect(next).toBeEnabled();
    const position = canvas.getByText("Trace 1 of 36");
    expect(position.compareDocumentPosition(next)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  },
});

export const Narrow = meta.story({
  name: "(Test) Name truncates before the timestamp",
  args: {
    traceName:
      "A very long trace name that should give way before the timestamp",
  },
  render: (args) => (
    <div className="w-[420px]">
      <SessionTraceNavigationBar {...args} />
    </div>
  ),
  play: async ({ canvas }) => {
    const name = canvas.getByText(/very long trace name/);
    const time = canvas.getByTitle(/Local:/);
    expect(name.scrollWidth).toBeGreaterThan(name.clientWidth);
    expect(time.scrollWidth).toBeLessThanOrEqual(time.clientWidth + 1);
    expect(name.compareDocumentPosition(time)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
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
