import { fn } from "storybook/test";

import preview from "@/.storybook/preview";
import { IngestionSettingsFields } from "./IngestionSettingsFields";

const meta = preview.meta({ component: IngestionSettingsFields });

const projects = [
  { id: "project-production", name: "Production" },
  { id: "project-staging", name: "Staging" },
];

export const NewProject = meta.story({
  args: {
    settings: {
      ingestionMode: "USAGE",
      projectTarget: "new",
      newProjectName: "ai-gateway",
      existingProjectId: undefined,
    },
    projects,
    onChange: fn(),
  },
});

export const ExistingProject = meta.story({
  args: {
    ...NewProject.input.args,
    settings: {
      ingestionMode: "FULL",
      projectTarget: "existing",
      newProjectName: "ai-gateway",
      existingProjectId: "project-staging",
    },
  },
});

export const NoRecording = meta.story({
  args: {
    ...NewProject.input.args,
    settings: {
      ingestionMode: "NONE",
      projectTarget: "new",
      newProjectName: "ai-gateway",
      existingProjectId: undefined,
    },
  },
});
