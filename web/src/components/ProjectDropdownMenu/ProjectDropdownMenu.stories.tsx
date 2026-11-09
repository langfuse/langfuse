import type { ComponentProps } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import preview from "../../../.storybook/preview";
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
    children: () => null,
    organizationId: "org-acme",
    canCreateProjects: true,
    getProjectPath: (projectId) => `/project/${projectId}`,
  },
  render: (args) => (
    <ProjectDropdownMenu {...args}>
      {({ getTriggerProps }) => (
        <button type="button" {...getTriggerProps()}>
          Trigger
        </button>
      )}
    </ProjectDropdownMenu>
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

export const TestSearch = meta.story({
  name: "(Test) Search projects",
  args: {
    state: "loaded",
    projects,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole("button", { name: "Trigger" });
    await userEvent.click(trigger);

    const menu = within(body.getByRole("menu", { name: "Projects" }));
    const search = menu.getByRole("searchbox", { name: "Search projects..." });
    await expect(search).toHaveFocus();
    await userEvent.type(search, "PROD");

    await expect(menu.getAllByRole("menuitem")).toHaveLength(2);
    await expect(
      menu.getByRole("link", { name: "Production" }),
    ).toHaveAttribute("href", "/project/project-production");
    await expect(
      menu.getByRole("link", { name: "Go to settings for Production" }),
    ).toHaveAttribute("href", "/project/project-production/settings");
    await expect(menu.getByRole("link", { name: "New Project" })).toBeVisible();

    await userEvent.clear(search);
    await userEvent.type(search, "project-production");
    await expect(menu.getByText("No project found.")).toBeVisible();
    await expect(menu.getAllByRole("menuitem")).toHaveLength(1);
    await expect(menu.getByRole("link", { name: "New Project" })).toBeVisible();

    await userEvent.keyboard("{Escape}");
    await expect(body.queryByRole("menu", { name: "Projects" })).toBeNull();
    await userEvent.click(trigger);
    await expect(
      body.getByRole("searchbox", { name: "Search projects..." }),
    ).toHaveValue("");
    await waitFor(() =>
      expect(body.getByRole("link", { name: "Analytics" })).toBeVisible(),
    );
  },
});
