import type { ComponentProps } from "react";
import { fn } from "storybook/test";

import preview from "@/.storybook/preview";
import { GatewayConfigurationView } from "./GatewayConfigurationView";

const meta = preview.meta({ component: GatewayConfigurationView });

const projects = [
  { id: "project-production", name: "Production", deletedAt: null },
  { id: "project-staging", name: "Staging", deletedAt: null },
] satisfies ComponentProps<typeof GatewayConfigurationView>["projects"];

export const Enabled = meta.story({
  args: {
    projects,
    initialProjectId: "project-production",
    initialMode: "USAGE",
    isSaving: false,
    saveError: false,
    onSave: fn(),
  },
});

export const MissingProjectWarning = meta.story({
  args: {
    projects,
    initialProjectId: "deleted-project",
    initialMode: "FULL",
    isSaving: false,
    saveError: false,
    onSave: fn(),
  },
});
