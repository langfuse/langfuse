import type { ComponentProps } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
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

// TODO: Move these regression tests to a generic dropdown component story once one exists.
const getAnalyticsActions = async (canvasElement: HTMLElement) => {
  const body = within(canvasElement.ownerDocument.body);
  const primaryAction = await body.findByRole("link", { name: "Analytics" });
  const secondaryAction = body.getByRole("link", {
    name: "Go to settings for Analytics",
  });
  const menuItem = primaryAction.closest('[role="menuitem"]');

  // Every primary action must be owned by a Radix menu item for keyboard navigation.
  await expect(menuItem).not.toBeNull();
  if (!(menuItem instanceof HTMLElement)) {
    throw new Error("Expected Analytics to be rendered inside a menu item");
  }

  return { menuItem, primaryAction, secondaryAction };
};

export const TestSecondaryActionLayout = meta.story({
  name: "(Test) Secondary action layout",
  args: {
    state: "loaded",
    projects,
  },
  play: async ({ canvasElement }) => {
    const { menuItem, secondaryAction } =
      await getAnalyticsActions(canvasElement);

    // Both actions must share one menu item so its highlight spans the full row.
    await expect(menuItem).toContainElement(secondaryAction);

    const menuItemRect = menuItem.getBoundingClientRect();
    const secondaryActionRect = secondaryAction.getBoundingClientRect();
    const centerDifference = Math.abs(
      menuItemRect.top +
        menuItemRect.height / 2 -
        (secondaryActionRect.top + secondaryActionRect.height / 2),
    );
    // The secondary action must remain vertically centered in the row.
    await expect(centerDifference).toBeLessThanOrEqual(1);

    await userEvent.hover(secondaryAction);

    // Hovering the secondary action must highlight the shared menu item.
    await waitFor(() => expect(menuItem).toHaveAttribute("data-highlighted"));
  },
});

export const TestActionsRemainIndependent = meta.story({
  name: "(Test) Actions remain independent",
  args: {
    state: "loaded",
    projects,
  },
  play: async ({ canvasElement }) => {
    const { primaryAction, secondaryAction } =
      await getAnalyticsActions(canvasElement);
    const onPrimaryClick = fn((event: MouseEvent) => event.preventDefault());
    const onSecondaryClick = fn((event: MouseEvent) => event.preventDefault());
    primaryAction.addEventListener("click", onPrimaryClick);
    secondaryAction.addEventListener("click", onSecondaryClick);

    await userEvent.click(secondaryAction);

    // The secondary action handles the click itself without triggering the primary link.
    await expect(onSecondaryClick).toHaveBeenCalledOnce();
    await expect(onPrimaryClick).not.toHaveBeenCalled();
  },
});

export const TestKeyboardActivation = meta.story({
  name: "(Test) Keyboard activation",
  args: {
    state: "loaded",
    projects,
  },
  play: async ({ canvasElement }) => {
    const { menuItem, primaryAction } =
      await getAnalyticsActions(canvasElement);
    const onPrimaryClick = fn((event: MouseEvent) => event.preventDefault());
    primaryAction.addEventListener("click", onPrimaryClick);

    menuItem.focus();
    await userEvent.keyboard("{Enter}");
    menuItem.focus();
    await userEvent.keyboard(" ");

    // Radix forwards both supported activation keys to the primary action exactly once.
    await expect(onPrimaryClick).toHaveBeenCalledTimes(2);
  },
});
