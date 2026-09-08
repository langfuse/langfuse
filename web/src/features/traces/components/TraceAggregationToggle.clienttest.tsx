import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TraceAggregationToggle } from "@/src/features/traces/components/TraceAggregationToggle";

describe("TraceAggregationToggle", () => {
  it("offers observation mode", () => {
    const onAggregationLevelChange = vi.fn();

    render(
      <TraceAggregationToggle
        aggregationLevel="trace"
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
    expect(screen.getByRole("tablist")).toHaveClass("bg-muted-foreground/10");
    expect(screen.getByRole("tablist")).not.toHaveClass("border");

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

  it("keeps observation available and explains an unavailable session", () => {
    render(
      <TraceAggregationToggle
        aggregationLevel="trace"
        canSelectSession={false}
        observationType={null}
        onAggregationLevelChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("tab", { name: "Observation" })).toBeEnabled();
    expect(screen.getByRole("tab", { name: "Trace" })).toBeEnabled();
    const sessionTab = screen.getByRole("tab", { name: "Session" });
    expect(sessionTab).toBeDisabled();
    expect(sessionTab).toHaveAttribute(
      "title",
      "Session view is unavailable because this trace is not part of an accessible session.",
    );
    expect(sessionTab.parentElement).toHaveAttribute(
      "title",
      "Session view is unavailable because this trace is not part of an accessible session.",
    );
  });
});
