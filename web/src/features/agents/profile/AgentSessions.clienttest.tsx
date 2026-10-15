import { fireEvent, render, screen, within } from "@testing-library/react";
import { AgentSessions } from "./AgentSessions";
import { projection, session } from "../overview/testFixtures";

const mocks = vi.hoisted(() => ({
  params: {} as { agentTool?: string; agentSkill?: string },
  route: {} as { peek?: string },
  setParams: vi.fn(),
  openPeek: vi.fn(),
  closePeek: vi.fn(),
  push: vi.fn(),
}));
vi.mock("next/router", () => ({
  useRouter: () => ({ query: mocks.route, push: mocks.push }),
}));
vi.mock("use-query-params", () => ({
  NumberParam: {},
  StringParam: {},
  useQueryParams: () => [mocks.params, mocks.setParams],
}));
vi.mock("@/src/components/table/peek/hooks/usePeekNavigation", () => ({
  usePeekNavigation: () => ({
    openPeek: mocks.openPeek,
    closePeek: mocks.closePeek,
  }),
}));
vi.mock("./AgentSessionPeek", () => ({
  AgentSessionPeek: ({ sessionId }: { sessionId: string }) => (
    <div role="dialog" aria-label={`Session ${sessionId}`} />
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.params = {};
  mocks.route = {};
});

function tableRow(id: string) {
  return within(screen.getByRole("table", { name: "Agent sessions" }))
    .getByText(id)
    .closest("tr")!;
}
function columnCell(row: HTMLElement, label: string) {
  const headers = within(
    screen.getByRole("table", { name: "Agent sessions" }),
  ).getAllByRole("columnheader");
  const index = headers.findIndex((header) => header.textContent === label);
  expect(index).toBeGreaterThanOrEqual(0);
  return within(row).getAllByRole("cell")[index];
}

describe("agent sessions table", () => {
  it("shows selected-window contributions and opens the real session ID rather than the agent-unit key", () => {
    const data = projection({
      sessions: [
        session("agent-unit-key", {
          sessionId: "real-session/id",
          invocations: 91,
          toolInvocations: 92,
          cost: 123.45,
          windowInvocations: 2,
          windowToolInvocations: 3,
          windowCost: 0.25,
        }),
      ],
    });
    const { rerender } = render(
      <AgentSessions projectId="p" agentName="research" projection={data} />,
    );
    const row = tableRow("real-session/id");
    expect(Number(columnCell(row, "Invocations").textContent)).toBe(2);
    expect(Number(columnCell(row, "Tools").textContent)).toBe(3);
    expect(columnCell(row, "Agent cost")).toHaveTextContent(/^\$0\.25$/);
    fireEvent.click(within(row).getByText("real-session/id"));
    expect(mocks.openPeek).toHaveBeenCalledExactlyOnceWith("real-session/id");
    expect(mocks.push).not.toHaveBeenCalled();
    mocks.route.peek = "real-session/id";
    rerender(
      <AgentSessions projectId="p" agentName="research" projection={data} />,
    );
    expect(
      screen.getByRole("dialog", { name: "Session real-session/id" }),
    ).toBeDefined();
  });

  it("navigates sessionless units to their real trace and never opens a session peek", () => {
    const data = projection({
      sessions: [
        session("agent-trace-unit-key", {
          kind: "trace",
          sessionId: null,
          traceId: "real-trace-id",
          completePerSession: false,
          completenessReason: "missing-session-id",
        }),
      ],
    });
    render(
      <AgentSessions projectId="p" agentName="research" projection={data} />,
    );
    const row = tableRow("real-trace-id");
    expect(within(row).getByText("No session ID")).toBeDefined();
    fireEvent.click(within(row).getByText("real-trace-id"));
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith(
      "/project/p/traces/real-trace-id",
    );
    expect(mocks.openPeek).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps only units supporting the selected tool or skill and intersects both filters", () => {
    const data = projection({
      sessions: [
        session("lookup-only", {
          toolNames: ["lookup"],
          skillNames: ["outline"],
        }),
        session("both", { toolNames: ["lookup"], skillNames: ["citations"] }),
        session("skill-only", {
          toolNames: ["format"],
          skillNames: ["citations"],
        }),
      ],
    });
    mocks.params.agentTool = "lookup";
    const { rerender } = render(
      <AgentSessions projectId="p" agentName="research" projection={data} />,
    );
    expect(tableRow("lookup-only")).toBeDefined();
    expect(tableRow("both")).toBeDefined();
    expect(screen.queryByText("skill-only")).toBeNull();
    mocks.params = { agentSkill: "citations" };
    rerender(
      <AgentSessions projectId="p" agentName="research" projection={data} />,
    );
    expect(tableRow("skill-only")).toBeDefined();
    expect(tableRow("both")).toBeDefined();
    expect(screen.queryByText("lookup-only")).toBeNull();
    mocks.params = { agentTool: "lookup", agentSkill: "citations" };
    rerender(
      <AgentSessions projectId="p" agentName="research" projection={data} />,
    );
    expect(tableRow("both")).toBeDefined();
    expect(screen.queryByText("lookup-only")).toBeNull();
    expect(screen.queryByText("skill-only")).toBeNull();
  });
});
