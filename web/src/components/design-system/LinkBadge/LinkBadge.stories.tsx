import React from "react";
import { expect } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { LinkBadge } from "./LinkBadge";

const meta = preview.meta({
  component: LinkBadge,
  args: {
    href: "#",
    label: "prompt",
    text: "langfuse-docs-assistant-chat - v27",
  },
});

export const Default = meta.story({});

export const Variants = meta.story({
  parameters: {
    controls: {
      disable: true,
    },
  },
  render: () => (
    <div className="flex flex-wrap items-center gap-4">
      <LinkBadge href="#" text="gpt-5" />
      <LinkBadge
        href="#"
        label="prompt"
        text="langfuse-docs-assistant-chat - v27"
      />
      <LinkBadge href="#" label="user" text="maya.chen@acme-robotics.io" />
    </div>
  ),
});

export const RendersALink = meta.story({
  name: "(Test) Renders A Link",
  play: async ({ canvasElement }) => {
    const link = canvasElement.querySelector("a");
    await expect(link).not.toBeNull();
    await expect(link?.getAttribute("href")).toBe("#");
    await expect(link?.textContent).toContain("prompt:");
  },
});

export const WrapsALongValue = meta.story({
  name: "(Test) Wraps A Long Value",
  args: {
    href: "https://langfuse.com/self-hosting/oss-newsletter",
    label: undefined,
    text: "https://langfuse.com/self-hosting/oss-newsletter",
    shouldWrap: true,
  },
  render: (args) => (
    <div className="w-40">
      <LinkBadge {...args} />
    </div>
  ),
  play: async ({ canvas, args }) => {
    const value = canvas.getByText(args.text);
    // The badge clips overflow, so measure the text itself: it must stay inside the box, on several lines.
    const text = document.createRange();
    text.selectNodeContents(value);
    await expect(text.getClientRects().length).toBeGreaterThan(1);
    await expect(text.getBoundingClientRect().right).toBeLessThanOrEqual(
      value.getBoundingClientRect().right + 1,
    );
    await expect(
      value.closest("a")?.getBoundingClientRect().width,
    ).toBeLessThanOrEqual(160);
  },
});
