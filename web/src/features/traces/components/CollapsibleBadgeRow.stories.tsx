import { expect, userEvent, within } from "storybook/test";

import preview from "@/.storybook/preview";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { CollapsibleBadgeRow } from "./CollapsibleBadgeRow";

const meta = preview.meta({
  component: CollapsibleBadgeRow,
});

const overflowBadges = (
  <>
    <Badge color="filled" text="Latency: 1.2s" />
    <Badge color="filled" text="Time to first token: 340ms" />
    <Badge color="filled" text="Prompt: customer-support-playbook-v2" />
    <Badge color="filled" text="Environment: production-west-2" />
  </>
);

function badgeShell(text: HTMLElement) {
  return text.closest('[class*="inline-flex"]') as HTMLElement | null;
}

function isClippedOnRight(
  overflowRoot: HTMLElement,
  badgeText: HTMLElement,
): boolean {
  const badge = badgeShell(badgeText);
  if (!badge) return false;
  const badgeRect = badge.getBoundingClientRect();
  const rootRect = overflowRoot.getBoundingClientRect();
  return badgeRect.right > rootRect.right + 1;
}

export const ClippedBadges = meta.story({
  render: () => <CollapsibleBadgeRow>{overflowBadges}</CollapsibleBadgeRow>,
});

export const TestExpandCollapse = meta.story({
  name: "(Test) Expand and collapse",
  globals: { viewport: { value: "narrow", isRotated: false } },
  parameters: {
    viewport: {
      options: {
        narrow: {
          name: "Narrow phone",
          styles: { width: "260px", height: "640px" },
        },
      },
    },
  },
  render: () => <CollapsibleBadgeRow>{overflowBadges}</CollapsibleBadgeRow>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const clippedBadge = canvas.getByText("Environment: production-west-2");
    const overflowRoot = canvasElement.querySelector(
      ".overflow-hidden",
    ) as HTMLElement | null;
    if (!overflowRoot) throw new Error("Expected collapsed overflow row");
    await expect(isClippedOnRight(overflowRoot, clippedBadge)).toBe(true);

    await userEvent.click(
      canvas.getByRole("button", { name: "Show more details" }),
    );
    const expandedRow = canvasElement.querySelector(
      ".flex.min-w-0.flex-1",
    ) as HTMLElement | null;
    if (!expandedRow) throw new Error("Expected badge row");
    await expect(
      canvasElement.querySelector(".overflow-hidden"),
    ).not.toBeInTheDocument();
    await expect(isClippedOnRight(expandedRow, clippedBadge)).toBe(false);
    await expect(
      canvas.getByRole("button", { name: "Show fewer details" }),
    ).toHaveAttribute("aria-expanded", "true");

    await userEvent.click(
      canvas.getByRole("button", { name: "Show fewer details" }),
    );
    const collapsedOverflow = canvasElement.querySelector(
      ".overflow-hidden",
    ) as HTMLElement | null;
    if (!collapsedOverflow) throw new Error("Expected collapsed overflow row");
    await expect(isClippedOnRight(collapsedOverflow, clippedBadge)).toBe(true);
    await expect(
      canvas.getByRole("button", { name: "Show more details" }),
    ).toHaveAttribute("aria-expanded", "false");
  },
});
