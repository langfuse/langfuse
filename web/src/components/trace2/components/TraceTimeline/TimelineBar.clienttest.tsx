/**
 * @jest-environment jsdom
 */

import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { TooltipProvider } from "@/src/components/ui/tooltip";
import { TimelineBar } from "./TimelineBar";
import type { TreeNode } from "../../lib/types";

jest.mock("@langfuse/shared", () => ({
  isPresent: (value: unknown) => value !== null && value !== undefined,
}));

jest.mock("../../../ItemBadge", () => ({
  ItemBadge: () => <span data-testid="item-badge" />,
}));

jest.mock("../../../../features/comments/CommentCountIcon", () => ({
  CommentCountIcon: () => <span data-testid="comment-count-icon" />,
}));

jest.mock("../../../grouped-score-badge", () => ({
  GroupedScoreBadges: () => <span data-testid="grouped-score-badges" />,
}));

const baseNode: TreeNode = {
  id: "generation-1",
  type: "GENERATION",
  name: "streaming-generation",
  startTime: new Date("2024-01-01T00:00:00.000Z"),
  endTime: new Date("2024-01-01T00:00:02.000Z"),
  children: [],
  startTimeSinceTrace: 0,
  startTimeSinceParentStart: null,
  depth: 0,
  childrenDepth: 0,
};

describe("TimelineBar", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("renders an accessible first-token marker with tooltip for streaming generations", async () => {
    render(
      <TooltipProvider delayDuration={0}>
        <TimelineBar
          node={baseNode}
          metrics={
            {
              startOffset: 24,
              itemWidth: 180,
              firstTokenTimeOffset: 72,
              latency: 2,
              timeToFirstToken: 0.75,
            } as any
          }
          isSelected={false}
          onSelect={() => {}}
          showDuration={false}
          showCostTokens={false}
          showScores={false}
          showComments={false}
          colorCodeMetrics={false}
        />
      </TooltipProvider>,
    );

    const marker = screen.getByRole("button", {
      name: "Time to first token: 0.75s",
    });

    fireEvent.focus(marker);
    fireEvent.pointerMove(marker);

    act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Time to first token: 0.75s",
    );
  });

  it("does not render a first-token marker when the metric is unavailable", () => {
    render(
      <TimelineBar
        node={baseNode}
        metrics={{
          startOffset: 24,
          itemWidth: 180,
          latency: 2,
        }}
        isSelected={false}
        onSelect={() => {}}
        showDuration={false}
        showCostTokens={false}
        showScores={false}
        showComments={false}
        colorCodeMetrics={false}
      />,
    );

    expect(
      screen.queryByRole("button", { name: /time to first token/i }),
    ).not.toBeInTheDocument();
  });
});
