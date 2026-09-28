import { BookOpen } from "lucide-react";
import { expect, fn, userEvent, within } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { Button } from "./Button";

const meta = preview.meta({
  component: Button,
  args: {
    text: "Save",
  },
});

export const Primary = meta.story({
  args: {
    onClick: fn(),
  },
});

export const VariantMatrix = meta.story({
  parameters: { controls: { disable: true } },
  render: () => (
    <div className="grid grid-cols-2 items-center gap-3">
      {(["primary", "secondary", "destructive", "ghost"] as const).map(
        (variant) =>
          (["default", "sm"] as const).map((size) => (
            <Button
              key={`${variant}-${size}`}
              text={`${variant} / ${size}`}
              variant={variant}
              size={size}
            />
          )),
      )}
    </div>
  ),
});

export const ExternalLangfuseLink = meta.story({
  name: "(Test) External Langfuse Link",
  args: {
    href: "https://langfuse.com/docs",
    text: "View docs",
    variant: "secondary",
  },
  play: async ({ canvasElement }) => {
    const link = within(canvasElement).getByRole("link");
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener");
    await expect(link.querySelector("svg")).not.toBeNull();
  },
});

export const ExternalLink = meta.story({
  name: "(Test) External Link",
  args: {
    href: "https://example.com/docs",
    text: "External docs",
    variant: "secondary",
  },
  play: async ({ canvasElement }) => {
    const link = within(canvasElement).getByRole("link");
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    await expect(link.querySelector("svg")).not.toBeNull();
  },
});

export const SecondaryLink = meta.story({
  name: "(Test) Secondary Link",
  args: {
    href: "/docs",
    icon: BookOpen,
    text: "View docs",
    variant: "secondary",
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("link")).toHaveAttribute(
      "href",
      "/docs",
    );
  },
});

export const Ghost = meta.story({
  args: {
    onClick: fn(),
    text: "Reset",
    variant: "ghost",
  },
});

export const Loading = meta.story({
  name: "(Test) Loading",
  args: {
    loading: true,
    onClick: fn(),
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("button")).toBeDisabled();
  },
});

const onClick = fn();

export const TestClick = meta.story({
  name: "(Test) Click",
  args: {
    onClick,
  },
  play: async ({ canvasElement }) => {
    onClick.mockClear();
    await userEvent.click(within(canvasElement).getByRole("button"));
    await expect(onClick).toHaveBeenCalledOnce();
  },
});
