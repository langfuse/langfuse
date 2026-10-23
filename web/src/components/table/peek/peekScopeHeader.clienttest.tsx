import { type ComponentProps } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TablePeekViewTraceDetail } from "./TablePeekViewTraceDetail";
import { TablePeekViewObservationDetail } from "./TablePeekViewObservationDetail";
import { type TablePeekView } from "@/src/components/table/peek";

const mocks = vi.hoisted(() => ({
  router: vi.fn(),
  trace: vi.fn(),
  member: vi.fn(),
  replace: vi.fn(),
  internalFeatures: vi.fn(),
}));

vi.mock("@/src/features/feature-flags", () => ({
  useInternalFeaturesEnabled: () => mocks.internalFeatures(),
}));

vi.mock("next/router", () => ({ useRouter: () => mocks.router() }));
vi.mock("@/src/features/auth", () => ({
  useIsAuthenticatedAndProjectMember: () => mocks.member(),
}));
vi.mock("@/src/components/table/peek/hooks/usePeekData", () => ({
  usePeekData: () => mocks.trace(),
}));
vi.mock("@/src/components/table/peek", () => ({
  TablePeekView: ({
    title,
    itemType,
    titleControl,
  }: ComponentProps<typeof TablePeekView>) => (
    <div data-testid="peek-header" data-item-type={itemType}>
      {titleControl}
      <span data-testid="peek-title">{title}</span>
    </div>
  ),
  shouldClosePeekAfterDelete: () => false,
}));
vi.mock("@/src/features/traces", () => ({
  TraceDetailActions: () => null,
  TraceDetailBody: () => null,
}));
vi.mock("@/src/features/traces/components/TraceDetailActions", () => ({
  TraceDetailActions: () => null,
}));
vi.mock("@/src/features/traces/components/TraceDetailBody", () => ({
  TraceDetailBody: () => null,
}));

describe.each([
  ["trace peek", TablePeekViewTraceDetail],
  ["observation peek", TablePeekViewObservationDetail],
] as const)("%s scope header", (_, Peek) => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.internalFeatures.mockReturnValue(true);
    mocks.router.mockReturnValue({
      pathname: "/project/[projectId]/traces",
      replace: mocks.replace,
      query: {
        peek: "observation-1",
        traceId: "trace-1",
        aggregation: "session",
      },
    });
    mocks.trace.mockReturnValue({
      data: {
        id: "trace-1",
        projectId: "p",
        sessionId: "session-1",
        observations: [{ id: "in-trace" }],
      },
    });
    mocks.member.mockReturnValue(true);
  });

  const renderPeek = (isV4 = true) =>
    render(
      <Peek
        projectId="p"
        itemType="TRACE"
        isV4={isV4}
        tableName="events"
        closePeek={vi.fn()}
      />,
    );

  it("shows the session icon and session display name in session scope", () => {
    renderPeek();
    expect(screen.getByTestId("peek-header")).toHaveAttribute(
      "data-item-type",
      "SESSION",
    );
    expect(screen.getByTestId("peek-header")).toHaveTextContent("session-1");
    expect(screen.getByTestId("peek-header")).not.toHaveTextContent("trace-1");
  });

  it("places the labeled scope control before the title", () => {
    renderPeek();
    const control = screen.getByRole("tablist", { name: "Trace detail scope" });
    expect(screen.getByRole("tab", { name: "Trace" })).toHaveAccessibleName(
      "Trace",
    );
    expect(screen.getByRole("tab", { name: "Session" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      control.compareDocumentPosition(screen.getByTestId("peek-title")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("switches to trace scope and clears a selection from another trace", () => {
    mocks.router.mockReturnValue({
      pathname: "/project/[projectId]/traces",
      replace: mocks.replace,
      query: {
        peek: "observation-1",
        traceId: "trace-1",
        aggregation: "session",
        observation: "foreign",
      },
    });
    renderPeek();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Trace" }), {
      button: 0,
      ctrlKey: false,
    });
    expect(mocks.replace).toHaveBeenCalledWith(
      {
        pathname: "/project/[projectId]/traces",
        query: { peek: "observation-1", traceId: "trace-1" },
      },
      undefined,
      { shallow: true },
    );
  });

  it("preserves an anchor observation when switching back to trace scope", () => {
    mocks.router.mockReturnValue({
      pathname: "/project/[projectId]/traces",
      replace: mocks.replace,
      query: {
        peek: "observation-1",
        traceId: "trace-1",
        aggregation: "session",
        observation: "in-trace",
      },
    });
    renderPeek();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Trace" }), {
      button: 0,
      ctrlKey: false,
    });
    expect(mocks.replace).toHaveBeenCalledWith(
      expect.objectContaining({
        query: {
          peek: "observation-1",
          traceId: "trace-1",
          observation: "in-trace",
        },
      }),
      undefined,
      { shallow: true },
    );
  });

  it("switches to session scope using the header control", () => {
    mocks.router.mockReturnValue({
      pathname: "/project/[projectId]/traces",
      replace: mocks.replace,
      query: { peek: "observation-1", traceId: "trace-1" },
    });
    renderPeek();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Session" }), {
      button: 0,
      ctrlKey: false,
    });
    expect(mocks.replace).toHaveBeenCalledWith(
      expect.objectContaining({
        query: {
          peek: "observation-1",
          traceId: "trace-1",
          aggregation: "session",
        },
      }),
      undefined,
      { shallow: true },
    );
  });

  it("restores the trace header when switching back to trace scope", () => {
    const { rerender } = renderPeek();
    mocks.router.mockReturnValue({
      query: { peek: "observation-1", traceId: "trace-1" },
    });
    rerender(
      <Peek
        projectId="p"
        itemType="TRACE"
        isV4
        tableName="events"
        closePeek={vi.fn()}
      />,
    );
    expect(screen.getByTestId("peek-header")).toHaveAttribute(
      "data-item-type",
      "TRACE",
    );
    expect(screen.getByTestId("peek-header")).toHaveTextContent("trace-1");
  });

  it("keeps the trace header when the trace has no session", () => {
    mocks.trace.mockReturnValue({
      data: { id: "trace-1", projectId: "p", sessionId: null },
    });
    renderPeek();
    expect(screen.getByTestId("peek-header")).toHaveAttribute(
      "data-item-type",
      "TRACE",
    );
    expect(screen.getByTestId("peek-header")).toHaveTextContent("trace-1");
  });

  it("keeps the trace header when session scope is unavailable", () => {
    mocks.member.mockReturnValue(false);
    renderPeek();
    expect(screen.getByTestId("peek-header")).toHaveAttribute(
      "data-item-type",
      "TRACE",
    );
  });

  it("keeps the trace header for the legacy read path", () => {
    renderPeek(false);
    expect(screen.getByTestId("peek-header")).toHaveAttribute(
      "data-item-type",
      "TRACE",
    );
  });

  it("restores the trace icon and ignores session scope without internal features", () => {
    mocks.internalFeatures.mockReturnValue(false);
    renderPeek();
    expect(screen.getByTestId("peek-header")).toHaveAttribute(
      "data-item-type",
      "TRACE",
    );
    expect(screen.getByTestId("peek-title")).toHaveTextContent("trace-1");
    expect(
      screen.queryByRole("tablist", { name: "Trace detail scope" }),
    ).not.toBeInTheDocument();
  });
});
