import type { ComponentProps } from "react";
import preview from "../../../.storybook/preview";
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { ProjectDropdownMenu } from "./ProjectDropdownMenu";

type Project = Extract<
  ComponentProps<typeof ProjectDropdownMenu>,
  { state: "loaded" }
>["projects"][number];

const createProject = (id: string, name: string): Project => ({
  id,
  name,
  role: "ADMIN",
  deletedAt: null,
  retentionDays: null,
  hasTraces: false,
  metadata: {},
  createdAt: new Date().toISOString(),
});

const projects = [
  createProject("project-analytics", "Analytics"),
  createProject("project-production", "Production"),
  createProject("project-staging", "Staging"),
  createProject(
    "project-long-name",
    "A project name that is too long to fit in the menu",
  ),
];

const meta = preview.meta({
  component: ProjectDropdownMenu,
  args: {
    organizationId: "org-acme",
    canCreateProjects: true,
    getProjectPath: (projectId) => `/project/${projectId}`,
  },
  render: (args) => (
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger>Trigger</DropdownMenuTrigger>
      <ProjectDropdownMenu {...args} />
    </DropdownMenu>
  ),
});

export const Default = meta.story({
  args: {
    state: "loaded",
    projects,
  },
});

export const Many = meta.story({
  args: {
    state: "loaded",
    projects: Array.from({ length: 10 }, (_, index) =>
      createProject(`project-${index + 1}`, `Project ${index + 1}`),
    ),
  },
});

export const WithoutCreation = meta.story({
  args: {
    state: "loaded",
    projects,
    canCreateProjects: false,
  },
});

export const Loading = meta.story({
  args: {
    state: "loading",
  },
});
