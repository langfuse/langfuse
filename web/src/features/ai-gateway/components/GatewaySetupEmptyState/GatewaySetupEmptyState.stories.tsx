import { FolderInput, Lock, Plus } from "@langfuse/icons";
import { expect, fn, userEvent, within } from "storybook/test";

import preview from "@/.storybook/preview";
import { GatewaySetupEmptyState } from "./GatewaySetupEmptyState";

const meta = preview.meta({ component: GatewaySetupEmptyState });

export const Default = meta.story({
  args: {
    icon: Lock,
    title: "The AI Gateway isn't set up yet",
    description: "Ask your organization admin to set up the AI Gateway.",
  },
});

export const WithActions = meta.story({
  args: {
    icon: FolderInput,
    title: "Set up an ingestion project first",
    description:
      "Gateway traffic needs a project to be recorded in. Credentials, models and API keys become available once it is set.",
    actions: [
      {
        type: "button",
        label: "Create ingestion project",
        icon: Plus,
        onClick: fn(),
      },
      {
        type: "menu",
        label: "Use existing project",
        items: [
          { id: "production", title: "Production" },
          { id: "staging", title: "Staging" },
        ],
        onSelect: fn(),
      },
    ],
  },
});

export const SelectsMenuItem = WithActions.extend({
  name: "(Test) Selects Menu Item",
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.click(
      canvas.getByRole("button", { name: "Use existing project" }),
    );
    await userEvent.click(body.getByRole("menuitem", { name: "Staging" }));

    const menuAction = args.actions?.find((action) => action.type === "menu");
    await expect(menuAction?.onSelect).toHaveBeenCalledWith("staging");
  },
});
