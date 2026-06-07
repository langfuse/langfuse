// @vitest-environment jsdom

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TooltipProvider } from "@/src/components/ui/tooltip";
import { TimelineBar } from "./TimelineBar";
import type { TimelineBarProps } from "./types";

const baseProps: TimelineBarProps = {
  node: {
    id: "obs-1",
    type: "GENERATION",
    name: "test-generation",
    startTime: new Date("2024-01-01T00:00:00Z"),
    endTime: new Date("2024-01-01T00:00:10Z"),
    children: [],
    startTimeSinceTrace: 0,
    startTimeSinceParentStart: null,
    depth: 0,
    childrenDepth: 0,
  },
  metrics: {
    startOffset: 0,
    itemWidth: 200,
    firstTokenTimeOffset: undefined,
    timeToFirstToken: undefined,
    latency: 10,
  },
  isSelected: false,
  onSelect: () => {},
  showDuration: false,
  showCostTokens: false,
  showScores: false,
  showComments: false,
  colorCodeMetrics: false,
};

const renderWithTooltip = (props: TimelineBarProps) =>
  render(
    <TooltipProvider>
      <TimelineBar {...props} />
    </TooltipProvider>,
  );

describe("TimelineBar", () => {
  describe("diamond marker (TTFT)", () => {
    it("does not render diamond when timeToFirstToken is absent", () => {
      renderWithTooltip(baseProps);
      expect(document.querySelector("[class*='rotate-45']")).toBeNull();
    });

    it("does not render diamond when firstTokenTimeOffset set but timeToFirstToken is absent", () => {
      renderWithTooltip({
        ...baseProps,
        metrics: {
          ...baseProps.metrics,
          firstTokenTimeOffset: 80,
          timeToFirstToken: undefined,
        },
      });
      expect(document.querySelector("[class*='rotate-45']")).toBeNull();
    });

    it("renders diamond marker when both firstTokenTimeOffset and timeToFirstToken are present", () => {
      renderWithTooltip({
        ...baseProps,
        metrics: {
          ...baseProps.metrics,
          firstTokenTimeOffset: 80,
          timeToFirstToken: 2,
        },
      });
      expect(
        document.querySelector("[class*='rotate-45']"),
      ).toBeInTheDocument();
    });

    it("shows tooltip with formatted TTFT on mouseenter", async () => {
      renderWithTooltip({
        ...baseProps,
        metrics: {
          ...baseProps.metrics,
          firstTokenTimeOffset: 80,
          timeToFirstToken: 2,
        },
      });

      const diamond = document.querySelector(
        "[class*='rotate-45']",
      ) as HTMLElement;
      fireEvent.mouseEnter(diamond);
      fireEvent.focus(diamond);

      await waitFor(() => {
        // Radix renders a hidden <span role="tooltip"> for accessibility
        const tooltip = screen.getByRole("tooltip");
        expect(tooltip).toHaveTextContent(/Time to first token: 2\.00s/);
      });
    });

    it("shows correct TTFT for sub-second values in tooltip", async () => {
      renderWithTooltip({
        ...baseProps,
        metrics: {
          ...baseProps.metrics,
          firstTokenTimeOffset: 40,
          timeToFirstToken: 0.5,
        },
      });

      const diamond = document.querySelector(
        "[class*='rotate-45']",
      ) as HTMLElement;
      fireEvent.mouseEnter(diamond);
      fireEvent.focus(diamond);

      await waitFor(() => {
        const tooltip = screen.getByRole("tooltip");
        expect(tooltip).toHaveTextContent(/Time to first token: 0\.50s/);
      });
    });

    it("renders 'First token' label in split bar", () => {
      renderWithTooltip({
        ...baseProps,
        metrics: {
          ...baseProps.metrics,
          firstTokenTimeOffset: 80,
          timeToFirstToken: 2,
        },
      });
      expect(screen.getByText("First token")).toBeInTheDocument();
    });
  });

  describe("regular bar (no TTFT)", () => {
    it("renders node name", () => {
      renderWithTooltip(baseProps);
      expect(screen.getByText("test-generation")).toBeInTheDocument();
    });

    it("does not render 'First token' label", () => {
      renderWithTooltip(baseProps);
      expect(screen.queryByText("First token")).not.toBeInTheDocument();
    });

    it("calls onSelect when clicked", () => {
      const onSelect = vi.fn();
      renderWithTooltip({ ...baseProps, onSelect });
      fireEvent.click(screen.getByText("test-generation"));
      expect(onSelect).toHaveBeenCalledOnce();
    });
  });
});
