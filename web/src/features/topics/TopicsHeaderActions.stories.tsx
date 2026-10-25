import { expect, fn, userEvent, within } from "storybook/test";
import { type ComponentProps } from "react";
import preview from "../../../.storybook/preview";
import { TopicsHeaderActions } from "./TopicsHeaderActions";
import { prepareTopicsActions } from "./prepare-topics-actions";

const defaultArgs: ComponentProps<typeof TopicsHeaderActions> = {
  actions: prepareTopicsActions({
    automaticProcessing: { state: { status: "off" }, saving: false },
    configureAvailable: true,
    configureVariant: "secondary",
    configured: true,
    canWrite: true,
    manualAvailable: true,
    menuOnly: false,
    onManualProcessing: fn(),
    onAutomaticProcessing: fn(),
    onConfigure: fn(),
    onHistory: fn(),
    onRefresh: fn(),
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
  name: "(Test) Compact processing actions remain reachable",
  render: (args) => (
    <div className="@container/topics-header w-80 p-3">
      <TopicsHeaderActions {...args} />
    </div>
  ),
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.queryByRole("button", { name: "Automatic processing" }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole("button", { name: "Manual processing" }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("button", { name: "Topics actions" }),
    );
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await body.findByRole("menuitem", { name: /Automatic processing/ }),
    );
    await expect(args.actions.automatic!.onSelect).toHaveBeenCalledOnce();
    await userEvent.click(
      canvas.getByRole("button", { name: "Topics actions" }),
    );
    await userEvent.click(
      await body.findByRole("menuitem", { name: "Manual processing" }),
    );
    await expect(
      args.actions.menu.find((action) => action.id === "manual")!.onSelect,
    ).toHaveBeenCalledOnce();
  },
});
