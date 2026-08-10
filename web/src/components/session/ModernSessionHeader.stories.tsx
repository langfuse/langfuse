import { type ComponentProps } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";

import preview from "../../../.storybook/preview";
import { ModernSessionHeader } from "@/src/components/session/ModernSessionHeader";

const scores = [
  {
    id: "score-helpfulness",
    name: "Helpfulness",
    value: 0.86,
    stringValue: null,
    dataType: "NUMERIC",
  },
] satisfies ComponentProps<typeof ModernSessionHeader>["scores"];

const overflowScores = Array.from({ length: 16 }, (_, index) => ({
  id: `score-quality-${index + 1}`,
  name: `Quality ${index + 1}`,
  value: (index + 1) / 20,
  stringValue: null,
  dataType: "NUMERIC" as const,
})) satisfies ComponentProps<typeof ModernSessionHeader>["scores"];

const manyUsers = Array.from(
  { length: 1_000 },
  (_, index) => `user-${index + 1}@example.com`,
);

const defaultArgs = {
  projectId: "project-1",
  countTraces: 24,
  traces: {
    state: "loaded",
    data: [
      { latencyMs: 1_240, observationCount: 42 },
      { latencyMs: 2_310, observationCount: 38 },
      { latencyMs: 4_620, observationCount: 51 },
      { latencyMs: 8_760, observationCount: 55 },
    ],
  },
  tokensIn: 18_420,
  tokensOut: 6_310,
  totalTokens: 24_730,
  totalCost: 0.084291,
  environment: "production",
  users: ["customer@example.com", "support@example.com"],
  scores,
} satisfies ComponentProps<typeof ModernSessionHeader>;

const meta = preview.meta({
  component: ModernSessionHeader,
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
});

export default meta;

export const Default = meta.story({ args: defaultArgs });

export const Minimal = meta.story({
  args: {
    ...defaultArgs,
    traces: { state: "loading" },
    tokensIn: 0,
    tokensOut: 0,
    totalTokens: 0,
    environment: null,
    users: [],
    scores: [],
  },
});

export const Overflow = meta.story({
  args: {
    ...defaultArgs,
    scores: overflowScores,
  },
});

export const TestSearchesHiddenPills = meta.story({
  name: "(Test) Searches hidden pills",
  args: {
    ...defaultArgs,
    scores: overflowScores,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() =>
      expect(
        canvas.getByRole("button", {
          name: /show \d+ hidden session details/i,
        }),
      ).toBeInTheDocument(),
    );
    const overflowButton = canvas.getByRole("button", {
      name: /show \d+ hidden session details/i,
    });
    const visiblePills = canvasElement.querySelectorAll<HTMLElement>(
      "[data-overflow-visible-item='true'] [data-session-header-pill='true']",
    );
    const lastVisiblePill = visiblePills.item(visiblePills.length - 1);
    await expect(
      overflowButton.getBoundingClientRect().left -
        lastVisiblePill.getBoundingClientRect().right,
    ).toBeLessThanOrEqual(8);
    const overflowButtonRect = overflowButton.getBoundingClientRect();
    const lastVisiblePillRect = lastVisiblePill.getBoundingClientRect();
    await expect(
      Math.abs(
        overflowButtonRect.top +
          overflowButtonRect.height / 2 -
          (lastVisiblePillRect.top + lastVisiblePillRect.height / 2),
      ),
    ).toBeLessThanOrEqual(0.5);

    await userEvent.click(overflowButton);

    const body = within(canvasElement.ownerDocument.body);
    const searchInput = await body.findByRole("textbox", {
      name: "Search session details",
    });
    const dialog = body.getByRole("dialog");
    await expect(within(dialog).queryByText(/traces/i)).not.toBeInTheDocument();

    await userEvent.type(searchInput, "Quality 16");
    await expect(within(dialog).getByText("Quality 16")).toBeInTheDocument();
    await expect(
      within(dialog).queryByText("Quality 1"),
    ).not.toBeInTheDocument();
  },
});

export const TestBoundsManyUsers = meta.story({
  name: "(Test) Bounds many users",
  args: {
    ...defaultArgs,
    users: manyUsers,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() =>
      expect(
        canvasElement.querySelectorAll('a[href*="/users/"]').length,
      ).toBeLessThanOrEqual(6),
    );

    await userEvent.click(
      canvas.getByRole("button", {
        name: /show \d+ hidden session details/i,
      }),
    );
    const body = within(canvasElement.ownerDocument.body);
    const detailsDialog = body.getByRole("dialog", {
      name: "All session details",
    });
    const results = within(detailsDialog).getByRole("region", {
      name: "Session detail results",
    });
    const initialUserCount = within(results).getAllByRole("link").length;
    await expect(initialUserCount).toBeLessThanOrEqual(53);

    results.scrollTop = results.scrollHeight;
    results.dispatchEvent(new Event("scroll", { bubbles: true }));
    await waitFor(() =>
      expect(within(results).getAllByRole("link").length).toBeGreaterThan(
        initialUserCount,
      ),
    );

    const searchInput = within(detailsDialog).getByRole("textbox", {
      name: "Search session details",
    });
    await userEvent.clear(searchInput);
    await userEvent.type(searchInput, "user-999@example.com");
    await expect(
      within(results).getByRole("link", {
        name: "user user-999@example.com",
      }),
    ).toBeInTheDocument();
  },
});
