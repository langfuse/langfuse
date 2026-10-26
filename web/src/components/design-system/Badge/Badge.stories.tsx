import React from "react";
import { ArrowUpRight, ExternalLinkIcon, TriangleAlert } from "@langfuse/icons";
import { expect } from "storybook/test";

import preview from "../../../../.storybook/preview";
import { Badge } from "./Badge";

type ComponentProps = React.ComponentProps<typeof Badge>;
type Color = NonNullable<ComponentProps["color"]>;

const meta = preview.meta({
  component: Badge,
  args: {
    text: "Badge",
  },
});

const colorFamily = {
  outline: "Neutral",
  ghost: "Neutral",
  filled: "Neutral",
  inverted: "Neutral",
  error: "Status",
  warning: "Status",
  success: "Status",
  info: "Status",
  violet: "Category",
  blue: "Category",
  teal: "Category",
  green: "Category",
  amber: "Category",
  pink: "Category",
} satisfies Record<Color, string>;

const colorGroups = Object.entries(colorFamily).reduce<Record<string, Color[]>>(
  (groups, [color, family]) => {
    groups[family] = [...(groups[family] ?? []), color as Color];
    return groups;
  },
  {},
);

export const Default = meta.story({});

export const WithDescenders = meta.story({
  parameters: {
    controls: {
      disable: true,
    },
  },
  render: () => (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge
        text="gpt-5"
        trailingIcon={ExternalLinkIcon}
        trailingIconTone="link"
      />
      <Badge
        text="Prompt: langfuse-docs-assistant-chat - v27"
        trailingIcon={ExternalLinkIcon}
      />
    </div>
  ),
});

export const WithTrailingIcon = meta.story({
  name: "(Test) With Trailing Icon",
  args: {
    text: "Linked badge",
    trailingIcon: ExternalLinkIcon,
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("svg")).not.toBeNull();
  },
});

export const Small = meta.story({
  args: { text: "DEBUG", size: "sm" },
});

export const Large = meta.story({
  args: { text: "# 16", size: "lg", color: "inverted" },
});

export const GhostInteractive = meta.story({
  args: {
    color: "ghost",
    interactive: true,
    label: "cost",
    text: "$0.0042",
  },
});

export const GhostWarning = meta.story({
  args: {
    color: "ghost",
    leadingIconTone: "warning",
    interactive: true,
    leadingIcon: TriangleAlert,
    text: "no cost",
  },
});

export const VariantMatrix = meta.story({
  parameters: {
    controls: {
      disable: true,
    },
  },
  render: () => (
    <div className="flex flex-col gap-4">
      {Object.entries(colorGroups).map(([group, colors]) => (
        <div key={group} className="flex flex-col gap-2">
          <span className="text-muted-foreground text-xs">{group}</span>
          <div className="flex flex-wrap items-center gap-2">
            {colors.map((color) => (
              <Badge key={color} color={color} text={color} />
            ))}
          </div>
        </div>
      ))}
    </div>
  ),
});

/** Each family where the app uses it; the reference for picking a colour. */
export const InContext = meta.story({
  parameters: {
    controls: {
      disable: true,
    },
  },
  render: () => {
    const rows: { title: string; badges: React.ReactNode }[] = [
      {
        title: "Header metrics: ghost",
        badges: (
          <>
            <Badge color="ghost" label="latency" text="0.71s" />
            <Badge color="ghost" text="$0.0042" />
            <Badge
              color="ghost"
              leadingIcon={TriangleAlert}
              leadingIconTone="warning"
              text="no cost"
            />
            <Badge
              color="ghost"
              text="session"
              trailingIcon={ArrowUpRight}
              trailingIconTone="link"
            />
          </>
        ),
      },
      {
        title: "Attributes: outline",
        badges: (
          <>
            <Badge label="env" text="production" />
            <Badge label="release" text="v2.3.0" />
            <Badge label="version" text="4" />
          </>
        ),
      },
      {
        title: "Scores and tags: filled, md; level as category tint",
        badges: (
          <>
            <Badge color="blue" size="md" text="observation" />
            <Badge color="filled" size="md" label="accuracy" text="0.95" />
            <Badge color="violet" size="md" text="trace" />
            <Badge color="filled" size="md" label="helpfulness" text="0.81" />
            <Badge color="filled" size="md" text="prod-rollout" />
          </>
        ),
      },
      {
        title: "Status: error, warning, success, info",
        badges: (
          <>
            <Badge color="error" text="Failing" />
            <Badge color="warning" text="Degraded" />
            <Badge color="success" text="Healthy" />
            <Badge color="info" size="sm" text="Beta" />
          </>
        ),
      },
      {
        title: "Categories: tint, neutral text",
        badges: (
          <>
            <Badge color="violet" text="Billing questions" />
            <Badge color="blue" text="Onboarding" />
            <Badge color="green" text="Refunds" />
            <Badge color="amber" text="Bug reports" />
          </>
        ),
      },
      {
        title: "One strong marker: inverted",
        badges: <Badge color="inverted" size="lg" text="# 16" />,
      },
    ];
    return (
      <div className="flex flex-col gap-4">
        {rows.map(({ title, badges }) => (
          <div key={title} className="flex flex-col gap-2">
            <span className="text-muted-foreground text-xs">{title}</span>
            <div className="flex flex-wrap items-center gap-2">{badges}</div>
          </div>
        ))}
      </div>
    );
  },
});

export const LongWrappedLabel = meta.story({
  name: "(Test) Long Wrapped Label",
  args: {
    text: "Quality dashboard widgets and score distribution",
    shouldWrap: true,
  },
  render: (args) => (
    <div className="w-36">
      <Badge {...args} />
    </div>
  ),
  play: async ({ canvas, args }) => {
    const label = canvas.getByText(args.text);
    const badge = label.parentElement!;
    const range = document.createRange();
    range.selectNodeContents(label);
    const lines = Array.from(range.getClientRects());
    await expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      await expect(line.right).toBeLessThanOrEqual(
        badge.getBoundingClientRect().right,
      );
      await expect(line.bottom).toBeLessThanOrEqual(
        badge.getBoundingClientRect().bottom,
      );
    }
  },
});
