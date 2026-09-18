import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { TablePeekViewTraceDetail } from "./peek-trace-detail";
import { TablePeekViewObservationDetail } from "./peek-observation-detail";

const state = vi.hoisted(() => ({
  query: { peek: "trace-a", traceId: "trace-a" },
  menu: false,
  topicsEnabled: true,
  transcript: vi.fn(),
}));
vi.mock("@/src/components/ui/CodeJsonViewer", () => ({
  JSONView: ({ json }: { json: unknown }) => <div>{JSON.stringify(json)}</div>,
}));
vi.mock("next/router", () => ({ useRouter: () => ({ query: state.query }) }));
vi.mock("@/src/features/auth", () => ({
  useIsAuthenticatedAndProjectMember: () => true,
}));
vi.mock("@/src/features/feature-flags/hooks/useIsFeatureEnabled", () => ({
  default: () => state.topicsEnabled,
}));
vi.mock("@/src/features/rbac/utils/checkProjectAccess", () => ({
  useHasProjectAccess: () => true,
}));
vi.mock("@/src/components/table/peek/hooks/usePeekData", () => ({
  usePeekData: () => ({
    data: {
      id: state.query.traceId,
      projectId: "project",
      public: false,
      name: "Example",
    },
  }),
}));
vi.mock("@/src/features/traces", () => ({
  TraceDetailActions: () => null,
  TraceDetailBody: () => <div>Trace body</div>,
  traceDetailTitle: () => "Example trace",
}));
vi.mock("@/src/components/table/peek", () => ({
  shouldClosePeekAfterDelete: () => false,
  TablePeekView: ({
    actions,
    actionsMenu,
    children,
  }: {
    actions: ReactNode;
    actionsMenu: ReactNode;
    children: ReactNode;
  }) => (
    <>
      {state.menu ? actionsMenu : actions}
      {children}
    </>
  ),
}));
vi.mock("@/src/utils/api", () => ({
  api: {
    topics: {
      traceSummaries: {
        useQuery: () => ({
          data: [
            {
              id: "intent",
              facetName: "Intent",
              facetVersion: 3,
              summary: "A saved intent summary.",
              processedAt: "2026-09-16T00:00:00Z",
              inputHash: "current",
            },
            {
              id: "issues",
              facetName: "Issues",
              facetVersion: 1,
              summary: "A saved issues summary.",
              processedAt: "2026-09-16T00:00:00Z",
              inputHash: "old",
            },
          ],
        }),
      },
      transcript: {
        useQuery: (input: { traceId: string }) => {
          state.transcript(input);
          return {
            data: {
              text: JSON.stringify([
                {
                  source: "trace_input",
                  text: `Transcript of ${input.traceId}`,
                },
              ]),
              inputHash: "current",
              coverage: { omittedBlockCount: 0, truncatedBlockCount: 0 },
            },
          };
        },
      },
    },
  },
}));

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  state.query = { peek: "trace-a", traceId: "trace-a" };
  state.menu = false;
  state.topicsEnabled = true;
  state.transcript.mockClear();
});

afterEach(() => vi.unstubAllEnvs());

describe("trace transcript from peek headers", () => {
  it("hides transcript controls and closes an open transcript when access is disabled", () => {
    const props = {
      projectId: "project",
      itemType: "TRACE" as const,
      tableName: "traces" as const,
      isV4: true,
      closePeek: vi.fn(),
    };
    state.topicsEnabled = false;
    const view = render(<TablePeekViewTraceDetail {...props} />);
    expect(
      screen.queryByRole("button", { name: "Show transcript" }),
    ).toBeNull();
    expect(state.transcript).not.toHaveBeenCalled();

    state.topicsEnabled = true;
    view.rerender(<TablePeekViewTraceDetail {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Show transcript" }));
    expect(screen.getByRole("dialog")).toBeTruthy();

    state.topicsEnabled = false;
    state.transcript.mockClear();
    view.rerender(<TablePeekViewTraceDetail {...props} />);
    expect(
      screen.queryByRole("button", { name: "Show transcript" }),
    ).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(state.transcript).not.toHaveBeenCalled();
  });

  it.each([TablePeekViewTraceDetail, TablePeekViewObservationDetail])(
    "keeps the dialog outside the overflow and resets it when the trace changes",
    (Peek) => {
      const props = {
        projectId: "project",
        itemType: "TRACE" as const,
        tableName: "traces" as const,
        isV4: true,
        closePeek: vi.fn(),
      };
      const view = render(<Peek {...props} />);
      expect(state.transcript).not.toHaveBeenCalled();
      expect(
        screen.getByRole("button", { name: "Show transcript" }),
      ).toBeTruthy();
      state.menu = true;
      view.rerender(<Peek {...props} />);
      fireEvent.click(screen.getByRole("button", { name: "Show transcript" }));
      expect(screen.getByText(/Transcript of trace-a/)).toBeTruthy();
      expect(screen.getByText("A saved intent summary.")).toBeTruthy();
      expect(screen.getByText("A saved issues summary.")).toBeTruthy();
      expect(screen.queryByRole("combobox")).toBeNull();
      expect(
        screen.getByText(
          "Trace content has changed since this summary was saved.",
        ),
      ).toBeTruthy();
      state.menu = false;
      view.rerender(<Peek {...props} />);
      expect(screen.getByRole("dialog")).toBeTruthy();
      state.query = { peek: "trace-b", traceId: "trace-b" };
      view.rerender(<Peek {...props} />);
      expect(screen.queryByRole("dialog")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Show transcript" }));
      expect(screen.getByText(/Transcript of trace-b/)).toBeTruthy();
      expect(state.transcript).toHaveBeenLastCalledWith({
        projectId: "project",
        traceId: "trace-b",
      });
    },
  );
});
