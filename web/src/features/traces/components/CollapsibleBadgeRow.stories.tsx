import { expect, userEvent, within } from "storybook/test";

import preview from "@/.storybook/preview";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { CollapsibleBadgeRow } from "./CollapsibleBadgeRow";

const meta = preview.meta({
  component: CollapsibleBadgeRow,
});

export const ClippedBadges = meta.story({
  render: () => (
    <CollapsibleBadgeRow>
      <Badge color="filled" text="Latency: 1.2s" />
      <Badge color="filled" text="Time to first token: 340ms" />
      <Badge color="filled" text="Model: gpt-4o" />
      <Badge color="filled" text="Environment: production" />
    </CollapsibleBadgeRow>
  ),
});

export const TestExpandCollapse = meta.story({
  name: "(Test) Expand and collapse",
  globals: { viewport: { value: "narrow", isRotated: false } },
  parameters: {
    viewport: {
      options: {
        narrow: {
          name: "Narrow phone",
          styles: { width: "320px", height: "640px" },
        },
      },
    },
  },
  render: () => (
    <CollapsibleBadgeRow>
      <Badge color="filled" text="One" />
      <Badge color="filled" text="Two" />
      <Badge color="filled" text="Three" />
    </CollapsibleBadgeRow>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const expand = canvas.getByRole("button", { name: "Show more details" });
    await userEvent.click(expand);
    await expect(
      canvas.getByRole("button", { name: "Show fewer details" }),
    ).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(
      canvas.getByRole("button", { name: "Show fewer details" }),
    );
    await expect(
      canvas.getByRole("button", { name: "Show more details" }),
    ).toHaveAttribute("aria-expanded", "false");
  },
});
