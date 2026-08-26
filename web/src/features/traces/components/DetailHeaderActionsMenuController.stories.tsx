import { EllipsisVertical } from "lucide-react";
import { expect, userEvent, within } from "storybook/test";

import { Button } from "@/src/components/ui/button";
import { DetailHeaderActionsMenuController } from "./DetailHeaderActionsMenuController";
import preview from "../../../../.storybook/preview";

const meta = preview.meta({
  component: DetailHeaderActionsMenuController,
  parameters: {
    layout: "centered",
    nextjs: {
      router: {
        asPath: "/project/storybook-project/traces/storybook-trace",
      },
    },
  },
});

export const Default = meta.story({
  name: "(Test) Opens the actions menu",
  args: {
    idItems: [{ id: "storybook-trace", name: "Trace ID" }],
    projectId: "storybook-project",
  },
  render: (args) => (
    <DetailHeaderActionsMenuController {...args}>
      {({ Trigger }) => (
        <Trigger asChild>
          <Button
            aria-label="Options"
            size="icon-xs"
            title="Options"
            variant="ghost"
          >
            <EllipsisVertical className="h-4 w-4" />
          </Button>
        </Trigger>
      )}
    </DetailHeaderActionsMenuController>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Options" }));
    await expect(
      await within(document.body).findByText("Copy Trace ID"),
    ).toBeVisible();
  },
});
