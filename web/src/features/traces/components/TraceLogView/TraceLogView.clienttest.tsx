import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TraceLogView } from "./TraceLogView";
import { type FlatLogItem } from "./log-view-types";
import { type TreeNode } from "../../types/treeNode";

const mocks = vi.hoisted(() => ({
  useTraceData: vi.fn(),
  useAllObservationsIO: vi.fn(),
}));

vi.mock("@/src/features/traces/contexts/TraceDataContext", () => ({
  useTraceData: mocks.useTraceData,
}));
vi.mock("@/src/features/traces/contexts/ViewPreferencesContext", () => ({
  useViewPreferences: () => ({ logViewMode: "chronological" }),
}));
vi.mock("@/src/features/traces/contexts/JsonExpansionContext", () => ({
  useJsonExpansion: () => ({
    formattedExpansion: {},
    setFormattedFieldExpansion: vi.fn(),
  }),
}));
vi.mock("@/src/features/posthog-analytics", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));
vi.mock("@/src/features/traces/hooks/useTraceAnalyticsDimensions", () => ({
  useTraceAnalyticsDimensions: () => ({}),
}));
vi.mock("./useLogViewAllObservationsIO", () => ({
  useLogViewAllObservationsIO: mocks.useAllObservationsIO,
}));
vi.mock("./useLogViewObservationIO", () => ({
  useObservationIOLoadedCount: () => ({ loaded: 0 }),
}));
vi.mock("./useLogViewPreferences", () => ({
  useLogViewPreferences: () => ({}),
}));
vi.mock("./useLogViewDownload", () => ({
  useLogViewDownload: () => ({}),
}));
vi.mock("./useLogViewColumns", () => ({ useLogViewColumns: () => [] }));
vi.mock("./LogViewToolbar", () => ({
  LogViewToolbar: ({ observationCount }: { observationCount: number }) => (
    <div data-testid="count">{observationCount}</div>
  ),
}));
vi.mock("./LogViewExpandedContent", () => ({
  LogViewExpandedContent: () => null,
}));
vi.mock("./LogViewJsonMode", () => ({ LogViewJsonMode: () => null }));
vi.mock("@/src/features/traces/components/JSONTableView", () => ({
  JSONTableView: ({ items }: { items: FlatLogItem[] }) => (
    <div>
      {items.map((item) => (
        <div key={item.node.id}>{item.node.id}</div>
      ))}
    </div>
  ),
}));

const root = (traceId: string): TreeNode => ({
  id: `trace-${traceId}`,
  traceId,
  type: "TRACE",
  name: traceId,
  startTime: new Date("2026-08-12T00:00:00.000Z"),
  depth: 0,
  startTimeSinceTrace: 0,
  startTimeSinceParentStart: null,
  childrenDepth: 1,
  children: [
    {
      id: `${traceId}-observation`,
      traceId,
      type: "SPAN",
      name: "span",
      startTime: new Date("2026-08-12T00:00:00.000Z"),
      depth: 1,
      startTimeSinceTrace: 0,
      startTimeSinceParentStart: 0,
      childrenDepth: 0,
      children: [],
    },
  ],
});

describe("TraceLogView session scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useAllObservationsIO.mockReturnValue({});
    mocks.useTraceData.mockReturnValue({
      roots: [root("anchor"), root("other")],
      observations: [
        { id: "anchor-observation", traceId: "anchor" },
        { id: "other-observation", traceId: "other" },
      ],
      sessionTraces: [{ id: "anchor" }, { id: "other" }],
    });
  });

  it("scopes displayed rows, counts, and export inputs to the selected trace", () => {
    const { rerender } = render(<TraceLogView projectId="p" traceId="other" />);
    expect(screen.getByText("other-observation")).toBeInTheDocument();
    expect(screen.queryByText("anchor-observation")).not.toBeInTheDocument();
    expect(screen.getByTestId("count")).toHaveTextContent("1");
    const input = mocks.useAllObservationsIO.mock.lastCall?.[0] as {
      items: FlatLogItem[];
    };
    expect(input.items.length).toBeGreaterThan(0);
    expect(input.items.every((item) => item.node.traceId === "other")).toBe(
      true,
    );

    rerender(<TraceLogView projectId="p" traceId="anchor" />);
    expect(screen.getByText("anchor-observation")).toBeInTheDocument();
    expect(screen.queryByText("other-observation")).not.toBeInTheDocument();
  });
});
