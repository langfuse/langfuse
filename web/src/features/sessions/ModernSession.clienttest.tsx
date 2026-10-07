import { fireEvent, render, screen } from "@testing-library/react";
import { type ComponentProps, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ModernSession } from "@/src/features/sessions/ModernSession";

const { capture } = vi.hoisted(() => ({ capture: vi.fn() }));

vi.mock("@/src/features/posthog-analytics", () => ({
  usePostHogClientCapture: () => capture,
}));

vi.mock("@/src/features/sessions/ConnectedModernSessionBodyLegacy", () => ({
  ConnectedModernSessionBodyLegacy: () => <div>Legacy body</div>,
}));

vi.mock(
  "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/ConnectedModernSessionBodyTimeline",
  () => ({
    ConnectedModernSessionBodyTimeline: () => <div>Timeline body</div>,
  }),
);

vi.mock("@/src/features/sessions/ModernSessionHeader", () => ({
  ModernSessionHeader: () => <div>Modern session header</div>,
}));

vi.mock("@/src/features/sessions/ModernSessionFilterControls", () => ({
  ModernSessionFilterControls: ({
    children,
  }: {
    children: (controls: never) => ReactNode;
  }) => <div data-testid="legacy-filter-controls">{children({} as never)}</div>,
}));

vi.mock("@/src/features/sessions/SessionMetadataJsonPathControl", () => ({
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
  beforeEach(() => {
    localStorage.clear();
    capture.mockClear();
  });

  it("renders the shared header and legacy connected body by default", () => {
    render(<ModernSession {...defaultProps} />);

    expect(screen.getByText("Modern session header")).toBeInTheDocument();
    expect(screen.getByText("Legacy body")).toBeInTheDocument();
    expect(screen.getByTestId("legacy-filter-controls")).toBeInTheDocument();
    expect(screen.queryByText("Timeline body")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "What's new" }),
    ).not.toBeInTheDocument();
  });

  it("renders the timeline whenever enabled, including public access", () => {
    render(<ModernSession {...defaultProps} isTimelineEnabled />);

    expect(screen.getByText("Modern session header")).toBeInTheDocument();
    expect(screen.getByText("Timeline body")).toBeInTheDocument();
    expect(
      screen.queryByTestId("legacy-filter-controls"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Legacy body")).not.toBeInTheDocument();
  });

  it("introduces the timeline once and allows reopening after dismissal", () => {
    const { unmount } = render(
      <ModernSession {...defaultProps} isTimelineEnabled />,
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByText(/one continuous conversation transcript/),
    ).toBeInTheDocument();
    expect(screen.getByText(/new conversation sidebar/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Provide feedback" }),
    ).toHaveAttribute(
      "href",
      "https://github.com/langfuse/langfuse/discussions",
    );
    fireEvent.click(screen.getByRole("button", { name: "Got it!" }));
    expect(
      localStorage.getItem("session-transcripts-introduction-v1-dismissed"),
    ).toBe("true");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    unmount();
    render(
      <ModernSession
        {...defaultProps}
        sessionId="another-session"
        isTimelineEnabled
      />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "What's new" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("persists dismissal with the close button", () => {
    render(<ModernSession {...defaultProps} isTimelineEnabled />);
    fireEvent.click(screen.getAllByRole("button", { name: "Close" })[0]!);
    expect(
      localStorage.getItem("session-transcripts-introduction-v1-dismissed"),
    ).toBe("true");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("tracks showing, dismissing, and each button click", () => {
    render(<ModernSession {...defaultProps} isTimelineEnabled />);
    expect(capture).toHaveBeenCalledWith("session_introduction:shown", {
      source: "first_visit",
    });
    fireEvent.click(screen.getByRole("link", { name: "Provide feedback" }));
    expect(capture).toHaveBeenCalledWith(
      "session_introduction:button_clicked",
      {
        button: "provide_feedback",
      },
    );
    expect(capture).not.toHaveBeenCalledWith(
      "session_introduction:dismissed",
      expect.anything(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Got it!" }));
    expect(capture).toHaveBeenCalledWith(
      "session_introduction:button_clicked",
      {
        button: "got_it",
      },
    );
    expect(capture).toHaveBeenCalledWith("session_introduction:dismissed", {
      source: "first_visit",
    });
    fireEvent.click(screen.getByRole("button", { name: "What's new" }));
    expect(capture).toHaveBeenCalledWith(
      "session_introduction:button_clicked",
      {
        button: "reopen",
      },
    );
    expect(capture).toHaveBeenCalledWith("session_introduction:shown", {
      source: "reopen",
    });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(capture).toHaveBeenCalledWith("session_introduction:dismissed", {
      source: "reopen",
    });
    expect(
      capture.mock.calls.filter(
        ([event]) => event === "session_introduction:shown",
      ),
    ).toHaveLength(2);
  });
});
