import React from "react";
import { Sparkles, X } from "@langfuse/icons";
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

export const Sizes = meta.story({
  parameters: {
    controls: {
      disable: true,
    },
  },
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Badge color="inverted" size="lg" text="# 16" />
      <Badge size="default" label="env" text="production" />
      <Badge color="filled" size="md" label="accuracy" text="0.95" />
      <Badge color="filled" size="sm" text="Healthy" />
    </div>
  ),
});

/** Descenders (g, p, y) must not clip at the bottom edge. */
export const WithDescenders = meta.story({
  parameters: {
    controls: {
      disable: true,
    },
  },
  render: () => (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge label="model" text="gpt-5" />
      <Badge label="tag" text="typography-qa" />
      <Badge color="filled" size="md" text="query-rewriting" />
    </div>
  ),
});

export const WithIcons = meta.story({
  parameters: {
    controls: {
      disable: true,
    },
  },
  render: () => (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge leadingIcon={Sparkles} color="filled" text="Recommended" />
      <Badge trailingIcon={X} text="trace-8f2c" />
    </div>
  ),
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

/** One example per family; the reference for picking a colour. */
export const InContext = meta.story({
  parameters: {
    controls: {
      disable: true,
    },
  },
  render: () => {
    const rows: { title: string; badges: React.ReactNode }[] = [
      {
        title: "filled: tables and lists",
        badges: (
          <>
            <Badge color="filled" text="production" />
            <Badge color="filled" text="Inactive" />
            <Badge color="filled" text="skill-usage" />
            <Badge color="filled" text="+3" />
          </>
        ),
      },
      {
        title: "outline: headers, titles, menus",
        badges: (
          <>
            <Badge text="v4" />
            <Badge text="Archived" />
            <Badge text="Your default" />
          </>
        ),
      },
      {
        title: "Status: error, warning, success",
        badges: (
          <>
            <Badge color="error" text="Failing" />
            <Badge color="warning" text="Degraded" />
            <Badge color="success" text="Healthy" />
          </>
        ),
      },
      {
        title: "Categories: hue fill, hairline and text",
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
        title: "inverted: rarely, at most one per surface",
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
