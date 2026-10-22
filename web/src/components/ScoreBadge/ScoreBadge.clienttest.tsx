// Rerendering the same owner directly exercises score identity across data refreshes.
/* eslint-disable @repo/prefer-stories-over-client-tests */
import { type LastUserScore } from "@langfuse/shared";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LayerProvider } from "@/src/context/LayerContext/LayerContext";
import { GroupedScoreBadges } from "@/src/components/grouped-score-badge";
import { ScoreBadge } from "./ScoreBadge";

vi.mock("@/src/hooks/useProjectIdFromURL", () => ({
  default: () => "project-id",
}));

const firstScore = {
  id: "first-score",
  name: "quality",
  dataType: "NUMERIC",
  source: "API",
  value: 1,
  timestamp: new Date("2026-01-01T00:00:00.000Z"),
  traceId: "trace-id",
  userId: "user-id",
  metadata: { detail: "First score metadata" },
} satisfies LastUserScore;

const secondScore = {
  ...firstScore,
  id: "second-score",
  value: 2,
  metadata: { detail: "Second score metadata" },
} satisfies LastUserScore;

describe("ScoreBadge metadata preview", () => {
  it("keeps the preview attached to its score after reordering and closes when removed", async () => {
    const { rerender } = render(
      <ScoreBadge name="quality" scores={[firstScore, secondScore]} />,
      { wrapper: LayerProvider },
    );
    fireEvent.focus(
      screen.getByRole("button", { name: "View metadata for quality: 1.00" }),
    );

    const card = await screen.findByRole("dialog");
    expect(card.firstElementChild).toHaveClass(
      "bg-popover",
      "border",
      "shadow-md",
    );
    expect(
      within(card).getByText('"First score metadata"'),
    ).toBeInTheDocument();

    rerender(<ScoreBadge name="quality" scores={[secondScore, firstScore]} />);
    expect(
      within(screen.getByRole("dialog")).getByText('"First score metadata"'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "View metadata for quality: 2.00" }),
    ).toHaveAttribute("aria-expanded", "false");

    rerender(<ScoreBadge name="quality" scores={[secondScore]} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("ScoreBadge session replay privacy", () => {
  const commentedScore = {
    ...firstScore,
    comment: "Customer score comment",
  } satisfies LastUserScore;

  it("blocks the score value and its portaled comment and metadata cards", async () => {
    render(<ScoreBadge name="quality" scores={[commentedScore]} />, {
      wrapper: LayerProvider,
    });

    expect(screen.getByTitle("1.00").closest(".ph-no-capture")).not.toBeNull();

    fireEvent.focus(
      screen.getByRole("button", { name: "View comment for quality: 1.00" }),
    );
    const commentCard = await screen.findByRole("dialog");
    expect(
      within(commentCard)
        .getByText("Customer score comment")
        .closest(".ph-no-capture"),
    ).not.toBeNull();
    fireEvent.blur(
      screen.getByRole("button", { name: "View comment for quality: 1.00" }),
    );

    fireEvent.focus(
      screen.getByRole("button", { name: "View metadata for quality: 1.00" }),
    );
    const metadataCard = await screen.findByRole("dialog");
    expect(
      within(metadataCard)
        .getByText('"First score metadata"')
        .closest(".ph-no-capture"),
    ).not.toBeNull();
  });

  it("blocks the portaled overflow score table", async () => {
    render(
      <GroupedScoreBadges
        maxVisible={0}
        scores={[{ ...commentedScore, name: "hidden-score" }]}
      />,
      { wrapper: LayerProvider },
    );

    fireEvent.click(screen.getByRole("button", { name: "Show all 1 scores" }));
    expect(
      (await screen.findByText("hidden-score")).closest(".ph-no-capture"),
    ).not.toBeNull();
  });
});
