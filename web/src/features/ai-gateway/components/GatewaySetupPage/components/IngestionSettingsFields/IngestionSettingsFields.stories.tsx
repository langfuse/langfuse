import { expect, fn } from "storybook/test";

import preview from "@/.storybook/preview";
import { IngestionSettingsFields } from "./IngestionSettingsFields";

const meta = preview.meta({ component: IngestionSettingsFields });

const projects = [
  { id: "project-production", name: "Production" },
  { id: "project-staging", name: "Staging" },
];

export const NewProject = meta.story({
  name: "(Test) Usage mode warns that project members see traffic",
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
  play: async ({ canvas }) => {
    const alert = canvas.getByRole("alert");
    await expect(alert).toHaveTextContent(
      "Everyone with project access sees gateway traffic",
    );
    await expect(alert).toHaveTextContent("organization member and viewer");
    await expect(alert).toHaveTextContent("costs, and gateway key owners");
    await expect(alert).not.toHaveTextContent("prompts and responses");
  },
});

export const ExistingProject = meta.story({
  name: "(Test) Full mode warning includes prompts and responses",
  args: {
    ...NewProject.input.args,
    settings: {
      ingestionMode: "FULL",
      projectTarget: "existing",
      newProjectName: "ai-gateway",
      existingProjectId: "project-staging",
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "prompts and responses",
    );
  },
});

export const NoRecording = meta.story({
  name: "(Test) No warning when nothing is recorded",
  args: {
    ...NewProject.input.args,
    settings: {
      ingestionMode: "NONE",
      projectTarget: "new",
      newProjectName: "ai-gateway",
      existingProjectId: undefined,
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("alert")).not.toBeInTheDocument();
  },
});
