import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TraceAggregationToggle } from "@/src/features/traces/components/TraceAggregationToggle";

describe("TraceAggregationToggle", () => {
  it("offers observation mode", () => {
    const onAggregationLevelChange = vi.fn();

    render(
      <TraceAggregationToggle
        aggregationLevel="trace"
        canSelectObservation
        canSelectSession
        observationType="GENERATION"
        onAggregationLevelChange={onAggregationLevelChange}
      />,
    );

    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Observation",
      "Trace",
      "Session",
    ]);

    const observationTab = screen.getByRole("tab", { name: "Observation" });
    expect(observationTab.querySelector("svg")).toHaveClass(
      "text-muted-magenta",
    );

    fireEvent.mouseDown(observationTab, {
      button: 0,
      ctrlKey: false,
    });

    expect(onAggregationLevelChange).toHaveBeenCalledWith("observation");
  });

  it("disables unavailable observation and session modes", () => {
    render(
      <TraceAggregationToggle
        aggregationLevel="trace"
        canSelectObservation={false}
        canSelectSession={false}
        observationType={null}
        onAggregationLevelChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("tab", { name: "Observation" })).toBeDisabled();
    expect(screen.getByRole("tab", { name: "Trace" })).toBeEnabled();
    expect(screen.getByRole("tab", { name: "Session" })).toBeDisabled();
  });
});
