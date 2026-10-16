import { fireEvent, render, screen, within } from "@testing-library/react";
import { type AgentMapSkeletonRow } from "@langfuse/shared";
import { type GraphCanvasData } from "@/src/features/trace-graph-view/types";
import { AgentMap } from "./AgentMap";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  diagram: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/router", () => ({
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock("@/src/utils/api", () => ({
  api: { agents: { mapSkeletonFromEvents: { useQuery: mocks.query } } },
}));
vi.mock("@/src/features/trace-graph-view/components/ElkGraphRenderer", () => ({
  ElkGraphRenderer: ({ graph }: { graph: GraphCanvasData }) => {
    mocks.diagram(graph);
    return (
      <div role="img" aria-label="Agent call map">
        {graph.nodes.map((node) => (
          <span key={node.id}>{node.label}</span>
        ))}
      </div>
    );
  },
}));
vi.mock("@/src/components/design-system/SwitchInput/SwitchInput", () => ({
  SwitchInput: ({
    description,
    checked,
    onCheckedChange,
  }: {
    description: string;
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
  }) => (
    <label>
      {description}
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onCheckedChange(event.target.checked)}
      />
    </label>
  ),
}));
vi.mock("@/src/components/design-system/PaginationBar/PaginationBar", () => ({
  PaginationBar: () => null,
}));

type Connection = {
  caller: string;
  callee: string;
  count: number;
  traceCount: number;
};
vi.mock("@/src/components/design-system/table/Table", () => ({
  Table: ({
    data,
    actions,
  }: {
    data: { data: Connection[] };
    actions: (connection: Connection) => { id: string; onClick?: () => void }[];
  }) => (
    <table aria-label="Sampled agent connections">
      <tbody>
        {data.data.map((connection) => (
          <tr key={JSON.stringify([connection.caller, connection.callee])}>
            <td>{connection.caller}</td>
            <td>{connection.callee}</td>
            <td>{connection.count} calls</td>
            <td>{connection.traceCount} traces</td>
            <td>
              <button
                onClick={() =>
                  actions(connection)
                    .find((action) => action.id === "view-runs")
                    ?.onClick?.()
                }
              >
                View callee runs
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  ),
}));

const row = (
  spanId: string,
  parentSpanId: string | null,
  agentName: string | null,
  traceId = "trace-1",
): AgentMapSkeletonRow => ({
  traceId,
  spanId,
  parentSpanId,
  agentName,
  type: "AGENT",
  startTime: new Date("2026-10-08T10:00:00Z"),
});
const props = {
  projectId: "project",
  agentName: "research",
  from: new Date("2026-10-08T08:00:00Z"),
  to: new Date("2026-10-08T12:00:00Z"),
  filter: [],
  onSelectRuns: vi.fn(),
};
const setRows = (rows: AgentMapSkeletonRow[]) => {
  const traceIds = [...new Set(rows.map((item) => item.traceId))];
  mocks.query.mockReturnValue({
    data: {
      rows,
      traceIds,
      traceCount: traceIds.length,
      traceLimit: 100,
      rowLimit: 20_000,
      rowsTruncated: false,
      tracesTruncated: false,
    },
    isError: false,
  });
};

beforeEach(() => vi.clearAllMocks());

test("keeps recursive calls actionable in Connections and explains the grouped diagram", () => {
  setRows([
    row("root", null, "research"),
    row("recursive-1", "root", "research"),
    row("recursive-2", "recursive-1", "research"),
    row("root", null, "research", "trace-2"),
    row("recursive-1", "root", "research", "trace-2"),
  ]);
  render(<AgentMap {...props} />);
  expect(screen.getByRole("alert")).toHaveTextContent(
    "3 self-calls across 2 sampled traces",
  );
  expect(screen.getByRole("alert")).toHaveTextContent("Connections");
  expect(screen.getByRole("img", { name: "Agent call map" })).toHaveTextContent(
    "↻ 3 · research",
  );
  const diagram = mocks.diagram.mock.lastCall?.[0] as
    | GraphCanvasData
    | undefined;
  expect(diagram?.edges.every((edge) => edge.from !== edge.to)).toBe(true);
  const recursiveRow = screen.getByRole("row", {
    name: /research research 3 calls 2 traces/,
  });
  expect(recursiveRow).toHaveTextContent("researchresearch3 calls2 traces");
  fireEvent.click(
    within(recursiveRow).getByRole("button", { name: "View callee runs" }),
  );
  expect(props.onSelectRuns).toHaveBeenCalledWith("research");
});

test("describes grouped unnamed calls without claiming a named self-call", () => {
  setRows([
    row("unnamed-root", null, null),
    row("unnamed-child", "unnamed-root", null),
    row("named-child", "unnamed-child", "research"),
  ]);
  render(<AgentMap {...props} />);
  fireEvent.click(
    screen.getByRole("checkbox", { name: "All agents in these traces" }),
  );
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Calls between unnamed agents also share a node",
  );
  expect(screen.getByRole("alert")).not.toHaveTextContent("self-call");
  expect(
    screen.getByRole("img", { name: "Agent call map" }),
  ).not.toHaveTextContent("↻");
  const unnamedRow = screen.getByRole("row", {
    name: /Unnamed agent Unnamed agent 1 calls 1 traces/,
  });
  expect(unnamedRow).toHaveTextContent("1 calls1 traces");
});
