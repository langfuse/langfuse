import { expect, userEvent, waitFor, within } from "storybook/test";

import preview from "../../../../../../.storybook/preview";

import { ExternalMediaStorageIntegrationCard } from "./ExternalMediaStorageIntegrationCard";

const meta = preview.meta({
  component: ExternalMediaStorageIntegrationCard,
});

export const Configured = meta.story({
  args: {
    projectId: "project-1",
    hasAccess: true,
    hasEntitlement: true,
    isLoading: false,
    status: "active",
  },
});

export const NotConfigured = meta.story({
  args: {
    projectId: "project-1",
    hasAccess: true,
    hasEntitlement: true,
    isLoading: false,
    status: undefined,
  },
});

export const Gated = meta.story({
  args: {
    projectId: "project-1",
    hasAccess: true,
    hasEntitlement: false,
    isLoading: false,
    status: undefined,
  },
});

export const NoProjectAccess = meta.story({
  args: {
    projectId: "project-1",
    hasAccess: false,
    hasEntitlement: true,
    isLoading: false,
    status: undefined,
  },
});

export const Loading = meta.story({
  args: {
    projectId: "project-1",
    hasAccess: true,
    hasEntitlement: false,
    isLoading: true,
    status: undefined,
  },
});

export const ExplainsPlanRestriction = meta.story({
  name: "(Test) Explains plan restriction",
  args: {
    projectId: "project-1",
    hasAccess: true,
    hasEntitlement: false,
    isLoading: false,
    status: undefined,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const configure = canvas.getByRole("button", { name: "Configure" });

    await expect(configure).toBeDisabled();
    // Disabled buttons ignore pointer events; the hover card listens on its wrapper.
    await userEvent.hover(configure.parentElement ?? configure);
    await waitFor(() =>
      expect(
        body.getByText("This feature is not available in your current plan."),
      ).toBeVisible(),
    );
  },
});
