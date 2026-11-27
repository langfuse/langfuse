/* eslint-disable boundaries/dependencies -- TODO: component privacy */
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { type ComponentProps, type ReactNode } from "react";
import { type SessionEventsWorkspace } from "@/src/features/sessions/SessionPages";
import { Trace } from "./Trace";
import { createPeekHeaderActions } from "@/src/components/ObservabilityEntityDetailHeader/fns/createPeekHeaderActions";

const state = vi.hoisted(() => ({
  stacked: false,
  unifiedViewEnabled: true,
  isV4: true,
  push: vi.fn(),
  query: {} as Record<string, string>,
}));
vi.mock("./SessionTracePeek/SessionTracePeekNavigationProvider", () => ({
  useIsSessionTracePeek: () => state.stacked,
}));
vi.mock("next/router", () => ({
  useRouter: () => ({
    pathname: "/project/[projectId]/sessions",
    query: state.query,
    push: state.push,
  }),
}));
vi.mock("use-query-params", () => ({
  StringParam: {},
  useQueryParam: () => [undefined, vi.fn()],
}));
vi.mock("@/src/utils/api", () => ({ api: {} }));
vi.mock("@/src/hooks/use-mobile", () => ({ useIsMobile: () => true }));
vi.mock(
  "@/src/features/feature-flags/hooks/useInternalFeaturesEnabled",
  () => ({
    useInternalFeaturesEnabled: () => false,
  }),
);
vi.mock("@/src/features/feature-flags/hooks/useIsFeatureEnabled", () => ({
  default: () => state.unifiedViewEnabled,
}));
vi.mock("@/src/features/events/hooks/useReadPath", () => ({
  useReadPath: () => ({ isV4: state.isV4 }),
}));
vi.mock("../hooks/useSessionTraceData", () => ({
  useSessionTraceData: () => ({
    data: { traces: [], observations: [], scores: [], corrections: [] },
  }),
}));
vi.mock("../hooks/useTraceComments", () => ({
  useTraceComments: () => ({
    observationCommentCounts: new Map(),
    sessionTraceCommentCounts: new Map(),
  }),
}));
vi.mock("../contexts/TraceDataProvider", () => ({
  TraceDataProvider: ({ children }: { children: ReactNode }) => children,
  useTraceData: () => ({
    scope: { type: "session", sessionId: "session", traces: [] },
    projectId: "project",
    trace: null,
    isPlaceholderData: false,
  }),
}));
vi.mock("../contexts/TraceGraphDataProvider", () => ({
  TraceGraphDataProvider: ({ children }: { children: ReactNode }) => children,
  useTraceGraphData: () => ({ isGraphViewAvailable: false }),
}));
vi.mock("../contexts/ViewPreferencesProvider", () => ({
  ViewPreferencesProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("../contexts/SelectionProvider", () => ({
  SelectionProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("../contexts/SearchProvider", () => ({
  SearchProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("../contexts/JsonExpansionProvider", () => ({
  JsonExpansionProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("./TraceHeader", () => ({ TraceHeader: () => null }));
vi.mock("./TraceLayoutMobile", () => ({ TraceLayoutMobile: () => null }));
vi.mock("./SessionTracePeek/SessionTracePeek", () => ({
  SessionTracePeek: () => <div aria-label="Nested peek" />,
}));
vi.mock("@/src/features/sessions/SessionPages", () => ({
  SessionEventsWorkspace: ({
    navigation,
    renderTracePeek,
  }: ComponentProps<typeof SessionEventsWorkspace>) => (
    <>
      <button
        onClick={() =>
          navigation?.onOpenTrace?.("trace", {
            id: "trace",
            observationId: "observation",
          } as Parameters<NonNullable<typeof navigation.onOpenTrace>>[1])
        }
      >
        Open observation
      </button>
      {renderTracePeek?.([])}
    </>
  ),
}));

beforeEach(() => {
  state.stacked = false;
  state.unifiedViewEnabled = true;
  state.isV4 = true;
  vi.clearAllMocks();
  state.query = {
    projectId: "project",
    peek: "session",
    traceView: "messages",
    observation: "previous",
    timestamp: "stale",
    sessionView: "saved-view",
  };
});

it.each([
  { unifiedViewEnabled: false, isV4: true, visible: false },
  { unifiedViewEnabled: true, isV4: false, visible: false },
  { unifiedViewEnabled: true, isV4: true, visible: true },
])(
  "gates bookmarked stacked peeks with unifiedViewEnabled=$unifiedViewEnabled and isV4=$isV4",
  ({ unifiedViewEnabled, isV4, visible }) => {
    state.unifiedViewEnabled = unifiedViewEnabled;
    state.isV4 = isV4;
    state.query.sessionPeek = "peek=trace&aggregation=trace";
    render(
      <Trace.Session
        projectId="project"
        sessionId="session"
        context="peek"
        header={{
          variant: "peek",
          headerProps: {
            title: "session",
            itemType: "SESSION",
            actions: createPeekHeaderActions({ onClose: vi.fn() }),
          },
        }}
      />,
    );
    if (visible) {
      expect(screen.getByLabelText("Nested peek")).toBeInTheDocument();
    } else {
      expect(screen.queryByLabelText("Nested peek")).not.toBeInTheDocument();
    }
  },
);

it("reuses the stacked layer instead of opening a third peek", () => {
  state.stacked = true;
  state.query.sessionPeek = "peek=old-trace";
  render(
    <Trace.Session
      projectId="project"
      sessionId="session"
      context="peek"
      header={{
        variant: "peek",
        headerProps: {
          title: "session",
          itemType: "SESSION",
          actions: createPeekHeaderActions({ onClose: vi.fn() }),
        },
      }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Open observation" }));
  expect(state.push).toHaveBeenCalledWith(
    {
      pathname: "/project/[projectId]/sessions",
      query: {
        projectId: "project",
        peek: "session",
        sessionView: "saved-view",
        traceId: "trace",
        observation: "observation",
        aggregation: "trace",
      },
    },
    undefined,
    { shallow: true },
  );
  expect(screen.queryByLabelText("Nested peek")).not.toBeInTheDocument();
});

it.each(["peek", "page"] as const)(
  "opens observations from %s in the existing peek or a new peek respectively",
  (variant) => {
    render(
      <Trace.Session
        projectId="project"
        sessionId="session"
        context={variant === "peek" ? "peek" : "fullscreen"}
        header={{
          variant,
          headerProps: {
            title: "session",
            itemType: "SESSION",
            actions: createPeekHeaderActions({ onClose: vi.fn() }),
          },
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open observation" }));
    expect(state.push).toHaveBeenCalledWith(
      {
        pathname: "/project/[projectId]/sessions",
        query: {
          ...state.query,
          sessionPeek: "peek=trace&aggregation=trace&observation=observation",
        },
      },
      undefined,
      { shallow: true },
    );
    expect(screen.queryByLabelText("Nested peek")).not.toBeInTheDocument();
  },
);
