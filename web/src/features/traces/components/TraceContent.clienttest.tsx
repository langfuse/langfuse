import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TraceContent } from "@/src/features/traces/components/Trace";

vi.mock("@/src/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));
vi.mock("@/src/features/traces/contexts/ViewPreferencesContext", () => ({
  useViewPreferences: () => ({ showGraph: true }),
}));
vi.mock("@/src/features/traces/contexts/TraceGraphDataContext", () => ({
  useTraceGraphData: () => ({ isGraphViewAvailable: true }),
}));
vi.mock("@/src/features/traces/components/TracePanelDetail", () => ({
  TracePanelDetail: () => <div>Observation detail</div>,
}));
vi.mock("@/src/features/traces/components/TracePanelNavigation", () => ({
  TracePanelNavigation: () => <div>Navigation</div>,
}));
vi.mock("@/src/features/traces/components/TraceLayoutDesktop", () => {
  const TraceLayoutDesktop = Object.assign(
    function MockTraceLayoutDesktop({
      children,
    }: {
      children: React.ReactNode;
    }) {
      return <div>{children}</div>;
    },
    {
      NavigationPanel: function MockNavigationPanel({
        children,
      }: {
        children: React.ReactNode;
      }) {
        return <div>{children}</div>;
      },
      ResizeHandle: function MockResizeHandle() {
        return <div>Resize handle</div>;
      },
      DetailPanel: function MockDetailPanel({
        children,
      }: {
        children: React.ReactNode;
      }) {
        return <div>{children}</div>;
      },
    },
  );
  return { TraceLayoutDesktop };
});
vi.mock(
  "@/src/features/traces/components/TracePanelNavigationLayoutDesktop/TracePanelNavigationLayoutDesktop",
  () => ({
    TracePanelNavigationLayoutDesktop: ({
      children,
      secondaryContent,
    }: {
      children: React.ReactNode;
      secondaryContent?: React.ReactNode;
    }) => (
      <div>
        {children}
        {secondaryContent}
      </div>
    ),
  }),
);
vi.mock(
  "@/src/features/traces/components/TraceGraphView/TraceGraphView",
  () => ({ TraceGraphView: () => <div>Graph</div> }),
);

describe("TraceContent", () => {
  it("renders only the current detail in observation mode", () => {
    render(
      <TraceContent
        desktopLayout={{
          groupId: "trace-layout-v3",
          defaultNavigationCollapsed: false,
          expandDetailOnMount: false,
        }}
        showObservationOnly
      />,
    );

    expect(screen.getByText("Observation detail")).toBeInTheDocument();
    expect(screen.queryByText("Navigation")).not.toBeInTheDocument();
    expect(screen.queryByText("Graph")).not.toBeInTheDocument();
  });

  it("keeps the navigation layout in trace and session modes", () => {
    render(
      <TraceContent
        desktopLayout={{
          groupId: "trace-layout-v3",
          defaultNavigationCollapsed: false,
          expandDetailOnMount: false,
        }}
        showObservationOnly={false}
      />,
    );

    expect(screen.getByText("Navigation")).toBeInTheDocument();
    expect(screen.getByText("Graph")).toBeInTheDocument();
    expect(screen.getByText("Resize handle")).toBeInTheDocument();
    expect(screen.getByText("Observation detail")).toBeInTheDocument();
  });
});
