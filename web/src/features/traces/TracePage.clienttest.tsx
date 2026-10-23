import { type ComponentProps } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TracePage } from "./TracePage";
import type Page from "@/src/components/layouts/page";

const mocks = vi.hoisted(() => ({
  router: vi.fn(),
  trace: vi.fn(),
  readPath: vi.fn(),
  replace: vi.fn(),
  internalFeatures: vi.fn(),
}));
vi.mock("@/src/features/feature-flags", () => ({
  useInternalFeaturesEnabled: () => mocks.internalFeatures(),
}));
vi.mock("next/router", () => ({ useRouter: () => mocks.router() }));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: "authenticated" }),
}));
vi.mock("@/src/features/auth", () => ({
  useIsAuthenticatedAndProjectMember: () => true,
}));
vi.mock("@/src/features/events", () => ({
  useReadPath: () => mocks.readPath(),
}));
vi.mock("@/src/features/traces/hooks/useTraceDetailData", () => ({
  useTraceDetailData: () => mocks.trace(),
}));
vi.mock("@/src/features/navigate-detail-pages", () => ({
  DetailPageNav: () => null,
}));
vi.mock("@/src/features/traces/components/TraceDetailActions", () => ({
  TraceDetailActions: () => null,
}));
vi.mock("@/src/features/traces/components/TraceDetailBody", () => ({
  TraceDetailBody: () => <div>Trace detail body</div>,
}));
vi.mock("@/src/components/layouts/page", () => ({
  default: ({ headerProps, children }: ComponentProps<typeof Page>) => (
    <div data-testid="page" data-item-type={headerProps.itemType}>
      {headerProps.titleControl}
      <h1>{headerProps.title}</h1>
      {children}
    </div>
  ),
}));

describe("TracePage scope header", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.internalFeatures.mockReturnValue(true);
    mocks.router.mockReturnValue({
      pathname: "/project/[projectId]/traces/[traceId]",
      query: { projectId: "p", traceId: "trace-1", observation: "in-trace" },
      replace: mocks.replace,
    });
    mocks.trace.mockReturnValue({
      data: {
        id: "trace-1",
        projectId: "p",
        sessionId: "session-1",
        public: false,
        observations: [{ id: "in-trace" }],
      },
    });
    mocks.readPath.mockReturnValue({ isV4: true });
  });

  it("shows the shared labeled scope control before the trace title", () => {
    render(<TracePage traceId="trace-1" />);
    const control = screen.getByRole("tablist", { name: "Trace detail scope" });
    const title = screen.getByRole("heading", { name: "trace-1" });
    expect(
      control.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Trace" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "Session" })).toBeEnabled();
    expect(
      screen.getAllByRole("tablist", { name: "Trace detail scope" }),
    ).toHaveLength(1);
  });

  it("uses the session title and scope on the standalone page", () => {
    mocks.router.mockReturnValue({
      pathname: "/project/[projectId]/traces/[traceId]",
      query: {
        projectId: "p",
        traceId: "trace-1",
        aggregation: "session",
        observation: "in-trace",
      },
      replace: mocks.replace,
    });
    render(<TracePage traceId="trace-1" />);
    expect(
      screen.getByRole("heading", { name: "session-1" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("page")).toHaveAttribute(
      "data-item-type",
      "SESSION",
    );
    expect(screen.getByRole("tab", { name: "Session" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Trace" }), {
      button: 0,
      ctrlKey: false,
    });
    expect(mocks.replace).toHaveBeenCalledWith(
      {
        pathname: "/project/[projectId]/traces/[traceId]",
        query: { projectId: "p", traceId: "trace-1", observation: "in-trace" },
      },
      undefined,
      { shallow: true },
    );
  });

  it("leaves legacy trace headers without the v4 scope control", () => {
    mocks.readPath.mockReturnValue({ isV4: false });
    render(<TracePage traceId="trace-1" />);
    expect(
      screen.getByRole("heading", { name: "trace-1" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("tablist", { name: "Trace detail scope" }),
    ).not.toBeInTheDocument();
  });

  it("restores the trace icon and ignores session scope without internal features", () => {
    mocks.internalFeatures.mockReturnValue(false);
    mocks.router.mockReturnValue({
      query: { projectId: "p", traceId: "trace-1", aggregation: "session" },
    });
    render(<TracePage traceId="trace-1" />);
    expect(
      screen.getByRole("heading", { name: "trace-1" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("page")).toHaveAttribute(
      "data-item-type",
      "TRACE",
    );
    expect(
      screen.queryByRole("tablist", { name: "Trace detail scope" }),
    ).not.toBeInTheDocument();
  });
});
