import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import preview from "../../../.storybook/preview";
import { V4MigrationBadgeContent } from "./V4MigrationBadgeContent";

// The longest copy the delay badge renders (V4MigrationDelayBadge); the
// hover reveal must expand to whatever width this needs (LF-90).
const OTEL_DESCRIPTION = "Update your OTel instrumentation for real-time data";

const meta = preview.meta({
  component: V4MigrationBadgeContent,
});

export const Default = meta.story({
  args: {
    onClick: fn(),
    title: "New data in ~15 min",
    description: "Update your SDK for real-time data",
  },
});

export const LongestDescription = meta.story({
  args: {
    onClick: fn(),
    title: "New data in ~15 min",
    description: OTEL_DESCRIPTION,
  },
});

export const Compact = meta.story({
  args: {
    onClick: fn(),
    title: "Action required",
    compact: true,
  },
});

export const TestFocusRevealsLongestDescription = meta.story({
  name: "(Test) Focus Reveals Longest Description",
  args: {
    onClick: fn(),
    title: "New data in ~15 min",
    description: OTEL_DESCRIPTION,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = await canvas.findByRole("button");
    // Synthetic hover cannot activate CSS :hover; the badge also reveals on
    // focus-visible, which keyboard focus does trigger.
    await userEvent.tab();
    await expect(button).toHaveFocus();
    // The description sits in an overflow-hidden wrapper that animates open;
    // once expanded it must fit the whole text (no clipping mid-word).
    const text = within(button).getByText(
      /Update your OTel instrumentation for real-time data/,
    );
    const clipBox = text.parentElement;
    if (!clipBox) throw new Error("description wrapper not found");
    await waitFor(() => {
      expect(clipBox.clientWidth).toBeGreaterThan(0);
      expect(clipBox.scrollWidth).toBeLessThanOrEqual(clipBox.clientWidth + 1);
    });
  },
});
