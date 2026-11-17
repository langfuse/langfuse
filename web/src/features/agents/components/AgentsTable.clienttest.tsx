import { fireEvent, render, screen } from "@testing-library/react";
import { type ComponentProps } from "react";
import { decodeFiltersGeneric } from "@langfuse/shared";
import { type AgentScope, type AgentSummary } from "@langfuse/shared/agents";
import { LayerProvider } from "@/src/context/LayerContext/LayerContext";
import { AgentsTable } from "./AgentsTable";
import { useAgentsTable } from "../hooks/useAgentsTable";

vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));

const scope: AgentScope = {
  projectId: "project",
  from: new Date("2026-11-05T00:00:00Z"),
  to: new Date("2026-11-06T00:00:00Z"),
  environment: "production",
};
const agent: AgentSummary = {
  identity: { kind: "id", value: "agent/one" },
  id: "agent/one",
  displayName: "Researcher",
  firstSeen: scope.from,
  lastSeen: scope.to,
  environments: ["production"],
  stats: {
    runs: 2,
    traces: 1,
    errorRuns: 0,
    averageRunDurationMs: 1000,
    modelCalls: 2,
    inputTokens: null,
    outputTokens: null,
    totalTokens: null,
    cost: 0,
    usageKnownCalls: 0,
    pricedModelCalls: 2,
    unattributedModelCalls: 0,
    traceUnassignedModelCalls: 0,
  },
};

function AgentTableHarness(
  props: Pick<
    ComponentProps<typeof AgentsTable>,
    "data" | "orderBy" | "setOrderBy"
  >,
) {
  const table = useAgentsTable(scope);
  return <AgentsTable {...props} table={table} />;
}

describe("Agent list table", () => {
  beforeEach(() => localStorage.clear());

  it("links to the exact scoped identity and distinguishes unknown usage from zero cost", () => {
    render(
      <LayerProvider>
        <AgentTableHarness
          data={{ status: "success", data: [agent] }}
          orderBy={{ column: "lastSeen", order: "DESC" }}
          setOrderBy={vi.fn()}
        />
      </LayerProvider>,
    );
    const href = new URL(
      screen.getByRole("link", { name: "Researcher" }).getAttribute("href")!,
      "https://example.test",
    );
    expect(decodeURIComponent(href.pathname)).toBe(
      "/project/project/agents/agent/one",
    );
    expect(href.searchParams.get("identityKind")).toBe("id");
    expect(decodeFiltersGeneric(href.searchParams.get("filter")!)).toEqual([
      {
        column: "environment",
        type: "stringOptions",
        operator: "any of",
        value: ["production"],
      },
    ]);
    expect(href.searchParams.get("dateRange")).toBe(
      `${scope.from.getTime()}-${scope.to.getTime()}`,
    );
    expect(screen.getByText("$0.00")).toBeInTheDocument();
    expect(screen.getByText("Unknown")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("requests server sorting only for supported aggregate columns", () => {
    const setOrderBy = vi.fn();
    render(
      <LayerProvider>
        <AgentTableHarness
          data={{ status: "success", data: [agent] }}
          orderBy={{ column: "lastSeen", order: "DESC" }}
          setOrderBy={setOrderBy}
        />
      </LayerProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Sort by Model cost" }));
    expect(setOrderBy).toHaveBeenLastCalledWith({
      column: "cost",
      order: "DESC",
    });
    fireEvent.click(screen.getByRole("button", { name: "Sort by Last seen" }));
    expect(setOrderBy).toHaveBeenLastCalledWith({
      column: "lastSeen",
      order: "ASC",
    });
    expect(
      screen.queryByRole("button", { name: "Sort by Tokens" }),
    ).not.toBeInTheDocument();
  });
});
