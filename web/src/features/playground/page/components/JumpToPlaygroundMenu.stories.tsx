import { expect, fn, userEvent, within } from "storybook/test";
import { type ComponentProps } from "react";

import preview from "../../../../../.storybook/preview";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { JumpToPlaygroundMenu } from "./JumpToPlaygroundMenu";

const meta = preview.meta({
  component: JumpToPlaygroundMenu,
});

export default meta;

const onIncludeOutputChange = fn();

const renderMenu = (args: ComponentProps<typeof JumpToPlaygroundMenu>) => (
  <DropdownMenu defaultOpen>
    <DropdownMenuTrigger>Open playground menu</DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <JumpToPlaygroundMenu {...args} />
    </DropdownMenuContent>
  </DropdownMenu>
);

export const Prompt = meta.story({
  render: renderMenu,
  args: {
    source: "prompt",
    onPlaygroundAction: fn(),
  },
});

export const Generation = meta.story({
  render: renderMenu,
  args: {
    source: "generation",
    includeOutput: false,
    onIncludeOutputChange: fn(),
    onPlaygroundAction: fn(),
  },
});

export const TestFreshPlayground = meta.story({
  name: "(Test) Opens a fresh playground",
  render: renderMenu,
  args: {
    source: "prompt",
    onPlaygroundAction: fn(),
  },
  play: async ({ canvasElement, args }) => {
    await userEvent.click(
      within(canvasElement.ownerDocument.body).getByRole("menuitem", {
        name: "Fresh playground",
      }),
    );
    await expect(args.onPlaygroundAction).toHaveBeenCalledWith("fresh");
  },
});

export const TestAddToExisting = meta.story({
  name: "(Test) Adds to an existing playground",
  render: renderMenu,
  args: {
    source: "prompt",
    onPlaygroundAction: fn(),
  },
  play: async ({ canvasElement, args }) => {
    await userEvent.click(
      within(canvasElement.ownerDocument.body).getByRole("menuitem", {
        name: "Add to existing",
      }),
    );
    await expect(args.onPlaygroundAction).toHaveBeenCalledWith("existing");
  },
});

export const TestIncludeOutput = meta.story({
  name: "(Test) Toggles include output",
  render: renderMenu,
  args: {
    source: "generation",
    includeOutput: false,
    onIncludeOutputChange,
    onPlaygroundAction: fn(),
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement.ownerDocument.body).getByRole("switch"),
    );
    await expect(onIncludeOutputChange).toHaveBeenCalledWith(true);
  },
});
