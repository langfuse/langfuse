import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { type ComponentProps } from "react";
import preview from "../../../.storybook/preview";
import { TopicsHeaderActions } from "./TopicsHeaderActions";
import { prepareTopicsActions } from "./prepare-topics-actions";

const defaultArgs: ComponentProps<typeof TopicsHeaderActions> = {
  actions: prepareTopicsActions({
    automaticProcessing: { state: { status: "off" }, saving: false },
    configureAvailable: true,
    regenerateAvailable: true,
    canWrite: true,
    menuOnly: false,
    onAutomaticProcessing: fn(),
    onConfigure: fn(),
    onRegenerate: fn(),
    onHistory: fn(),
    showUnassigned: true,
    onShowUnassignedChange: fn(),
  }),
};

const meta = preview.meta({
  component: TopicsHeaderActions,
  parameters: { layout: "fullscreen" },
  args: defaultArgs,
});

export const Wide = meta.story({
  render: (args) => (
    <div className="@container/topics-header w-full p-3">
      <TopicsHeaderActions {...args} />
    </div>
  ),
});

export const Compact = meta.story({
  name: "(Test) Compact Analyze stays reachable",
  render: (args) => (
    <div className="@container/topics-header w-80 p-3">
      <TopicsHeaderActions {...args} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.queryByRole("button", { name: "Analyze" }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("button", { name: "Topics actions" }),
    );
    const body = within(canvasElement.ownerDocument.body);
    await waitFor(() =>
      expect(body.getByRole("menuitem", { name: /Analyze/ })).toBeVisible(),
    );
    await expect(
      body.getByRole("menuitem", { name: "Regenerate topics" }),
    ).toBeVisible();
  },
});
