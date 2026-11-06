import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AgentSummaryStats } from "./AgentSummaryStats";

describe("Agent model completeness", () => {
  it("keeps coverage in a closed disclosure without adding unassigned calls to agent totals", () => {
    const stats = {
      runs: 1,
      traces: 1,
      errorRuns: 0,
      averageRunDurationMs: null,
      modelCalls: 2,
      inputTokens: 10,
      outputTokens: 20,
      totalTokens: 30,
      cost: 0.02,
      usageKnownCalls: 2,
      pricedModelCalls: 2,
      unattributedModelCalls: 1,
      traceUnassignedModelCalls: 3,
    };
    const { rerender } = render(<AgentSummaryStats stats={stats} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("$0.02")).toBeInTheDocument();
    expect(screen.getByText("30")).toBeInTheDocument();
    expect(screen.getByText(/Priced: 2\/2/)).not.toBeVisible();
    fireEvent.click(screen.getByText("Model metric coverage"));
    expect(screen.getByText(/Priced: 2\/2/)).toBeVisible();
    expect(screen.getByText(/1 model calls identify/)).toHaveTextContent(
      "included in the totals",
    );
    expect(screen.getByText(/3 model calls in these traces/)).toHaveTextContent(
      "excluded",
    );

    rerender(
      <AgentSummaryStats stats={{ ...stats, traceUnassignedModelCalls: 0 }} />,
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/3 model calls in these traces/),
    ).not.toBeInTheDocument();
  });
});
