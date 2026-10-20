import { FolderInput, Lock, Plus } from "@langfuse/icons";
import { fn } from "storybook/test";

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
      { label: "Create ingestion project", icon: Plus, onClick: fn() },
      { label: "Use existing project", variant: "secondary", onClick: fn() },
    ],
  },
});
