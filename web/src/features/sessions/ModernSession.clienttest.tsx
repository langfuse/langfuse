import { render, screen } from "@testing-library/react";
import { type ComponentProps, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { ModernSession } from "@/src/features/sessions/ModernSession";

vi.mock("@/src/features/sessions/ConnectedModernSessionBodyLegacy", () => ({
  ConnectedModernSessionBodyLegacy: () => <div>Legacy body</div>,
}));

vi.mock("@/src/features/sessions/ConnectedSessionListBody", () => ({
  ConnectedSessionListBody: () => <div>List body</div>,
}));

vi.mock(
  "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/ConnectedModernSessionBodyTimeline",
  () => ({
    ConnectedModernSessionBodyTimeline: () => <div>Timeline body</div>,
  }),
);

vi.mock("@/src/features/sessions/ModernSessionFilterControls", () => ({
  ModernSessionFilterControls: ({
    children,
  }: {
    children: (controls: never) => ReactNode;
  }) => <div data-testid="legacy-filter-controls">{children({} as never)}</div>,
}));

const defaultProps = {
  viewMode: "conversational",
  isTimelineEnabled: false,
  session: {
    minTimestamp: new Date("2026-01-01T00:00:00.000Z"),
    maxTimestamp: new Date("2026-01-01T00:00:01.000Z"),
  },
  tracesState: { type: "loaded", traces: [] } as const,
  projectId: "project-id",
  sessionId: "session-id",
  openPeek: vi.fn(),
  traceCommentCounts: undefined,
  filterState: [],
  filterMeasurementKey: "filters",
  viewLabel: null,
  showInlineToolCalls: false,
  showSystemPrompt: false,
  filterControlsProps: {
    projectId: "project-id",
    filterState: [],
    filterColumns: [],
    filterColumnsWithCustomSelect: [],
    onChange: vi.fn(),
    viewControllers: {
      selectedViewId: null,
      appliedViewId: null,
      viewUpdateTarget: null,
      filterEditorResetKey: 0,
      handleUserStateChange: vi.fn(),
      handleSetViewId: vi.fn(),
      applyViewState: vi.fn(),
    },
    currentViewState: {
      orderBy: null,
      filters: [],
      columnOrder: [],
      columnVisibility: {},
      searchQuery: "",
    },
  },
  onFilterObservationByName: vi.fn(),
} satisfies ComponentProps<typeof ModernSession>;

describe("ModernSession", () => {
  it("renders the list body when selected", () => {
    render(
      <ModernSession {...defaultProps} isTimelineEnabled viewMode="list" />,
    );

    expect(screen.getByText("List body")).toBeInTheDocument();
    expect(screen.queryByText("Timeline body")).not.toBeInTheDocument();
    expect(screen.queryByText("Legacy body")).not.toBeInTheDocument();
  });

  it("renders the legacy connected body by default", () => {
    render(<ModernSession {...defaultProps} />);

    expect(screen.getByText("Legacy body")).toBeInTheDocument();
    expect(screen.getByTestId("legacy-filter-controls")).toBeInTheDocument();
    expect(screen.queryByText("Timeline body")).not.toBeInTheDocument();
  });

  it("renders the timeline whenever enabled, including public access", () => {
    render(<ModernSession {...defaultProps} isTimelineEnabled />);

    expect(screen.getByText("Timeline body")).toBeInTheDocument();
    expect(
      screen.queryByTestId("legacy-filter-controls"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Legacy body")).not.toBeInTheDocument();
  });
});
