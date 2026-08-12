import { useEffect } from "react";
import preview from "../../../../.storybook/preview";
import { expect, waitFor, within } from "storybook/test";
import { toast } from "sonner";

import { Toaster } from "@/src/components/ui/sonner";
import { InAppAgentActivityCards } from "./InAppAgentActivityCards";

/**
 * Visual repro for Sonner + activity cards sharing the top-right corner.
 * Mirrors AuthenticatedLayout (Toaster) + InAppAgentActivityNotifications
 * (cards) without going through `<Layer>` — Storybook's overlay root mounts
 * asynchronously and Layer only queries it once, which flakes in vitest.
 *
 * `--banner-height` is applied on `documentElement` so `top-banner-offset`
 * on the activity stack matches the app.
 */
function ToastOverlapFixture({
  bannerHeight = "0px",
}: {
  bannerHeight?: string;
}) {
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.getPropertyValue("--banner-height");
    root.style.setProperty("--banner-height", bannerHeight);
    return () => {
      if (previous) {
        root.style.setProperty("--banner-height", previous);
      } else {
        root.style.removeProperty("--banner-height");
      }
    };
  }, [bannerHeight]);

  return (
    <>
      <Toaster visibleToasts={1} />
      <InAppAgentActivityCards
        cards={[
          {
            conversationId: "conversation-1",
            activityKey: "run-1:SUCCEEDED",
            runId: "run-1",
            title: "Latency outliers",
            state: "done-unread",
          },
          {
            conversationId: "conversation-2",
            activityKey: "run-2:AWAITING_APPROVAL",
            runId: "run-2",
            title: "Needs your approval",
            state: "approval",
          },
        ]}
        onOpen={() => undefined}
        onDismiss={() => undefined}
      />
      <p className="text-muted-foreground p-6 text-sm">
        Page content behind the toast layer. A Sonner error and Assistant
        activity cards both anchor top-right.
      </p>
    </>
  );
}

const meta = preview.meta({
  component: ToastOverlapFixture,
});

function rectsOverlap(a: DOMRect, b: DOMRect) {
  return !(
    a.right <= b.left ||
    a.left >= b.right ||
    a.bottom <= b.top ||
    a.top >= b.bottom
  );
}

export const ErrorOverStackedCards = meta.story({
  name: "Sonner Error Over Stacked Cards",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);
    toast.dismiss();

    await expect(canvas.getByText("Needs your approval")).toBeVisible();

    toast.error("Forbidden");

    const sonner = await waitFor(() => {
      const node = body.getByText("Forbidden").closest("[data-sonner-toast]");
      expect(node).toBeTruthy();
      expect(
        (node as HTMLElement).getBoundingClientRect().height,
      ).toBeGreaterThan(0);
      return node as HTMLElement;
    });
    const activityCard = canvas
      .getByText("Needs your approval")
      .closest('[role="status"]');
    expect(activityCard).toBeInstanceOf(HTMLElement);
    await expect(canvas.getByText("Latency outliers")).toBeVisible();
    await expect(activityCard as HTMLElement).toBeVisible();

    const sonnerRect = sonner.getBoundingClientRect();
    const cardRect = (activityCard as HTMLElement).getBoundingClientRect();
    // Overlap in the shared top-right corner is accepted/transient for now —
    // this assertion documents the current layout for the review thread.
    expect(rectsOverlap(sonnerRect, cardRect)).toBe(true);
  },
});

export const WithTopBanner = meta.story({
  name: "Sonner Error With Top Banner Offset",
  args: {
    bannerHeight: "40px",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);
    toast.dismiss();

    await expect(canvas.getByText("Needs your approval")).toBeVisible();

    toast.error("Precondition Failed");

    await waitFor(() => {
      expect(body.getByText("Precondition Failed")).toBeVisible();
    });
  },
});
