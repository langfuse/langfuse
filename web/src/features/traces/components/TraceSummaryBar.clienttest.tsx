// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

import { TraceSummaryBar } from "@/src/features/traces/components/TraceSummaryBar";

vi.mock("@/src/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

describe("TraceSummaryBar", () => {
  it("shows the existing trace-level identity and metrics", () => {
    render(
      <TraceSummaryBar
        projectId="project"
        latencySeconds={1.25}
        sessionId="session"
        userId="user"
        totalCost={0.42}
        costDetails={{ total: 0.42 }}
      />,
    );

    expect(screen.queryByText("Trace summary")).not.toBeInTheDocument();
    expect(screen.getByText("Latency: 1.25s")).toBeInTheDocument();
    expect(screen.getByText("Session: session")).toBeInTheDocument();
    expect(screen.getByText("User ID: user")).toBeInTheDocument();
    expect(screen.getByText("$0.42")).toBeInTheDocument();
  });
});
