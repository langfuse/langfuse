import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TraceAggregationToggle } from "@/src/features/traces/components/TraceAggregationToggle";

describe("TraceAggregationToggle", () => {
  it("offers observation mode", () => {
    const onAggregationLevelChange = vi.fn();

    render(
      <TraceAggregationToggle
        aggregationLevel="trace"
        onAggregationLevelChange={onAggregationLevelChange}
      />,
    );

    fireEvent.click(
      screen.getByRole("radio", { name: "Show observation details only" }),
    );

    expect(onAggregationLevelChange).toHaveBeenCalledWith("observation");
  });
});
