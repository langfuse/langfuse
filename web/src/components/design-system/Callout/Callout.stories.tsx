import { Bot } from "lucide-react";
import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { Button } from "../../ui/button";
import { Callout } from "./Callout";

const meta = preview.meta({
  component: Callout,
});

const message = (
  <div className="flex items-start gap-2 sm:items-center">
    <Bot className="mt-0.5 h-4 w-4 shrink-0 sm:mt-0" />
    <span>
      <span className="font-bold">
        Langfuse works great with your AI agents.
      </span>{" "}
      Connect your tools to your Langfuse data.
    </span>
  </div>
);

export const Default = meta.story({
  args: {
    variant: "info",
    align: "middle",
    children: message,
    actions: null,
    onDismiss: fn(),
  },
});

export const Warning = meta.story({
  args: {
    variant: "warning",
    align: "top",
    children: (
      <span>
        <span className="font-bold">Heads up:</span> this workspace is close to
        its ingestion limit.
      </span>
    ),
    actions: null,
    onDismiss: fn(),
  },
});

export const WithActions = meta.story({
  args: {
    variant: "info",
    align: "middle",
    children: message,
    actions: (
      <Button size="sm" variant="secondary">
        Learn more
      </Button>
    ),
    onDismiss: fn(),
  },
});

export const Dismisses = meta.story({
  name: "(Test) Dismisses",
  args: {
    variant: "info",
    align: "middle",
    children: <span>This callout can be dismissed.</span>,
    actions: null,
    onDismiss: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(
      await canvas.findByRole("button", { name: "Dismiss" }),
    );

    await expect(args.onDismiss).toHaveBeenCalledOnce();
  },
});
