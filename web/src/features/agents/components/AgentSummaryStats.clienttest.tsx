import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AgentSummaryStats } from "./AgentSummaryStats";

describe("Agent model completeness", () => {
  it("warns about unassigned calls in participating traces without adding them to agent totals", () => {
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
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Model calls without agent attribution in these traces: 3",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Totals may be incomplete",
    );
    expect(screen.getByText("$0.02")).toBeInTheDocument();
    expect(screen.getByText("30")).toBeInTheDocument();
    expect(screen.getByText(/Priced: 2\/2/)).toBeInTheDocument();
    expect(
      screen.getByText(/Model calls without a verified owning run: 1/),
    ).toHaveTextContent("Included in these agent totals");

    rerender(
      <AgentSummaryStats stats={{ ...stats, traceUnassignedModelCalls: 0 }} />,
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
