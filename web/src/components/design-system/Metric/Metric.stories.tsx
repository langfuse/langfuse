import React from "react";
import { TriangleAlert } from "@langfuse/icons";
import { expect } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { Metric } from "./Metric";

const meta = preview.meta({
  component: Metric,
  args: {
    label: "latency",
    value: "0.71s",
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
      <Metric label="latency" value="0.71s" />
      <Metric value="$0.0042" interactive />
      <Metric
        icon={TriangleAlert}
        iconTone="warning"
        interactive
        value="no cost"
      />
      <Metric href="#" value="session" />
      <Metric href="#" label="user" value="maya.chen@acme-robotics.io" />
      <Metric
        href="#"
        label="prompt"
        value="langfuse-docs-assistant-chat - v27"
      />
      <Metric size="sm" value="Oct 23, 14:02:11" />
    </div>
  ),
});

export const RendersALink = meta.story({
  name: "(Test) Renders A Link",
  args: { href: "#", label: "prompt", value: "docs-assistant - v27" },
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
    value: "https://langfuse.com/self-hosting/oss-newsletter",
    shouldWrap: true,
  },
  render: (args) => (
    <div className="w-40">
      <Metric {...args} />
    </div>
  ),
  play: async ({ canvas, args }) => {
    const value = canvas.getByText(args.value as string);
    const range = document.createRange();
    range.selectNodeContents(value);
    await expect(range.getClientRects().length).toBeGreaterThan(1);
  },
});
