import { render, screen } from "@testing-library/react";
import { type ComponentProps, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { ModernSession } from "@/src/components/session/ModernSession";

vi.mock("@/src/components/session/ConnectedModernSessionBodyLegacy", () => ({
  ConnectedModernSessionBodyLegacy: () => <div>Legacy body</div>,
}));

vi.mock("@/src/components/session/ConnectedModernSessionBodyTimeline", () => ({
  ConnectedModernSessionBodyTimeline: () => <div>Timeline body</div>,
}));

vi.mock("@/src/components/session/ModernSessionHeader", () => ({
  ModernSessionHeader: () => <div>Modern session header</div>,
}));

vi.mock("@/src/components/session/ModernSessionFilterControls", () => ({
  ModernSessionFilterControls: ({
    children,
  }: {
    children: (controls: never) => ReactNode;
  }) => children({} as never),
}));

vi.mock("@/src/components/session/SessionMetadataJsonPathControl", () => ({
  SessionMetadataJsonPathControl: ({
    children,
  }: {
    children: (state: {
      paths: readonly string[];
      source: { state: "idle" };
      onEditorOpenChange: (open: boolean) => void;
      onSave: (path: string) => void;
      onRemove: (path: string) => void;
    }) => ReactNode;
  }) =>
    children({
      paths: [],
      source: { state: "idle" },
      onEditorOpenChange: vi.fn(),
      onSave: vi.fn(),
      onRemove: vi.fn(),
    }),
}));

const defaultProps = {
  isTimelineEnabled: false,
  session: {
    countTraces: 0,
    inputUsage: 0,
    outputUsage: 0,
    totalTokens: 0,
    totalCost: 0,
    environment: undefined,
    users: [],
    scores: [],
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
  it("renders the shared header and legacy connected body by default", () => {
    render(<ModernSession {...defaultProps} />);

    expect(screen.getByText("Modern session header")).toBeInTheDocument();
    expect(screen.getByText("Legacy body")).toBeInTheDocument();
    expect(screen.queryByText("Timeline body")).not.toBeInTheDocument();
  });

  it("renders only the timeline connected body when enabled", () => {
    render(<ModernSession {...defaultProps} isTimelineEnabled />);

    expect(screen.getByText("Modern session header")).toBeInTheDocument();
    expect(screen.getByText("Timeline body")).toBeInTheDocument();
    expect(screen.queryByText("Legacy body")).not.toBeInTheDocument();
  });
});
