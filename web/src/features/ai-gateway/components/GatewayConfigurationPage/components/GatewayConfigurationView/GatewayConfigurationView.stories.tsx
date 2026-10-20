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
    gatewayBaseUrl: "https://gateway.staging.langfuse.com/v1",
    initialProjectId: "project-production",
    initialIngestionMode: "USAGE",
    availableIngestionModes: ["USAGE", "FULL"],
    isSaving: false,
    saveError: false,
    onSave: fn(),
    onCreateProject: fn(),
  },
});

export const SelfHostedNoCapture = meta.story({
  args: {
    projects,
    gatewayBaseUrl: "https://gateway.example.com/v1",
    initialProjectId: "project-production",
    initialIngestionMode: "NONE",
    availableIngestionModes: ["NONE", "USAGE", "FULL"],
    isSaving: false,
    saveError: false,
    onSave: fn(),
    onCreateProject: fn(),
  },
});

export const MissingProjectWarning = meta.story({
  args: {
    projects,
    gatewayBaseUrl: "https://gateway.staging.langfuse.com/v1",
    initialProjectId: "deleted-project",
    initialIngestionMode: "FULL",
    availableIngestionModes: ["USAGE", "FULL"],
    isSaving: false,
    saveError: false,
    onSave: fn(),
    onCreateProject: fn(),
  },
});
