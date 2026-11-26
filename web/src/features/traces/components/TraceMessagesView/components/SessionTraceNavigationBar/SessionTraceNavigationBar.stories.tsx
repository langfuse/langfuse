import { expect, fn } from "storybook/test";
import preview from "@/.storybook/preview";
import { SessionTraceNavigationBar } from "./SessionTraceNavigationBar";

const meta = preview.meta({
  component: SessionTraceNavigationBar,
  args: {
    position: 12,
    total: 36,
    sessionHref: "/project/project-1/sessions/session-1",
    onPrevious: fn(),
    onNext: fn(),
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

export const Scrolled = meta.story({
  name: "Scrolled",
  render: (args) => (
    <div className="bg-background h-48 overflow-y-auto">
      <SessionTraceNavigationBar {...args} />
      <div className="text-muted-foreground space-y-4 p-4 text-sm">
        {Array.from({ length: 12 }, (_, index) => (
          <p key={index}>Message {index + 1}</p>
        ))}
      </div>
    </div>
  ),
});

export const EndsDisabled = meta.story({
  name: "(Test) Ends disable the matching control",
  args: { position: 1, total: 36, onPrevious: undefined },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Trace 1 / 36")).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Previous trace" }),
    ).toBeDisabled();
    await expect(
      canvas.getByRole("button", { name: "Next trace" }),
    ).toBeEnabled();
    await expect(canvas.getByRole("link", { name: "Session" })).toHaveAttribute(
      "href",
      "/project/project-1/sessions/session-1",
    );
  },
});
