import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../../../../../../.storybook/preview";
import { IntegrationBrowser } from "./IntegrationBrowser";

const meta = preview.meta({
  component: IntegrationBrowser,
});

export const Default = meta.story({
  args: {
    project: "this",
    category: null,
    onCategoryChange: fn(),
    onOpenSetup: fn(),
    onClose: fn(),
  },
});

export const InACategory = meta.story({
  args: { ...Default.input.args, category: "developer-tools" },
});

export const ForANewProject = meta.story({
  args: { ...Default.input.args, project: "new" },
});

export const TestNarrowsToACategory = meta.story({
  name: "(Test) A category chip narrows the list",
  args: InACategory.input.args,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("button", { name: /^Developer tools \d+$/ }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      canvas.getByRole("button", { name: "Claude Code" }),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: "OpenTelemetry" }),
    ).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: /^All \d+$/ }));
    await expect(args.onCategoryChange).toHaveBeenCalledWith(null);
  },
});

export const TestAnnouncesOnlyTheTitle = meta.story({
  name: "(Test) No matches announces its title and offers a way back",
  args: Default.input.args,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const status = canvas.getByRole("status");
    await expect(status).toBeEmptyDOMElement();
    await userEvent.type(canvas.getByRole("searchbox"), "cobol");
    await expect(status).toHaveTextContent("Nothing matches “cobol”");
    await expect(canvas.getAllByRole("status")).toHaveLength(1);
    await expect(canvas.getByRole("region", { name: "Popular" })).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Set up OpenTelemetry" }),
    );
    await expect(args.onOpenSetup).toHaveBeenCalledWith("opentelemetry");
  },
});

export const TestListsTracingIntegrationsOnly = meta.story({
  name: "(Test) Lists ways to send traces, not analytics exports",
  args: Default.input.args,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const search = canvas.getByPlaceholderText(/^Search \d+ integrations/);
    await userEvent.type(search, "OpenLIT");
    await expect(canvas.getByRole("button", { name: "OpenLIT" })).toBeVisible();
    await userEvent.clear(search);
    await userEvent.type(search, "PostHog");
    await expect(canvas.queryByRole("button", { name: "PostHog" })).toBeNull();
    await userEvent.clear(search);
    await userEvent.type(search, "Mixpanel");
    await expect(canvas.queryByRole("button", { name: "Mixpanel" })).toBeNull();
  },
});
