import {
  fireEvent,
  render as renderWithOptions,
  screen,
} from "@testing-library/react";
import { type ComponentProps, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ModernSession } from "@/src/features/sessions/ModernSession";
import { LayerProvider } from "@/src/context/LayerContext/LayerContext";

const render = (ui: ReactNode) =>
  renderWithOptions(ui, { wrapper: LayerProvider });

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
  viewTabs: {
    value: "messages",
    hasUnsavedView: false,
    isMessagesPinned: true,
    savedViews: [],
    onManageViews: vi.fn(),
    onUnpin: vi.fn(),
    onRemoveUnsaved: vi.fn(),
    onEditUnsaved: vi.fn(),
    onValueChange: vi.fn(),
    onCreate: vi.fn(),
    canManageViews: true,
    onViewAction: vi.fn(),
  },
  isTimelineEnabled: true,
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
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe = vi.fn();
        unobserve = vi.fn();
        disconnect = vi.fn();
      },
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("shows a recovery action when every view is unpinned", () => {
    render(
      <ModernSession
        {...defaultProps}
        viewTabs={{
          ...defaultProps.viewTabs,
          value: "",
          isMessagesPinned: false,
        }}
      />,
    );
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "No pinned views" }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getAllByRole("button", { name: "Manage views" })[1]!,
    );
    expect(defaultProps.viewTabs.onManageViews).toHaveBeenCalledOnce();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows an unsaved tab and save action even without filters", () => {
    const onSave = vi.fn();
    render(
      <ModernSession
        {...defaultProps}
        isTimelineEnabled
        viewTabs={{
          ...defaultProps.viewTabs,
          value: "unsaved",
          hasUnsavedView: true,
        }}
        customization={{
          activeFilterCount: 0,
          onCustomizeView: vi.fn(),
          onClearFilters: vi.fn(),
        }}
        onSaveView={onSave}
      />,
    );
    expect(screen.getByRole("tab", { name: "Unsaved view" })).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(
      screen.queryByText(
        "Filters are active. Some session data may be hidden.",
      ),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save view" }));
    expect(onSave).toHaveBeenCalled();
  });

  it.each(["unsaved", "saved-view"])(
    "only shows Clear filters for unsaved views (selected: %s)",
    (value) => {
      const onClearFilters = vi.fn();
      render(
        <ModernSession
          {...defaultProps}
          viewTabs={{
            ...defaultProps.viewTabs,
            value,
            hasUnsavedView: value === "unsaved",
          }}
          customization={{
            activeFilterCount: 1,
            onCustomizeView: vi.fn(),
            onClearFilters,
          }}
        />,
      );
      expect(
        screen.getByRole("button", { name: "Edit filters" }),
      ).toBeInTheDocument();
      if (value === "unsaved") {
        expect(screen.getByRole("status")).toHaveTextContent(
          "Filters are active.",
        );
        fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
        expect(onClearFilters).toHaveBeenCalledOnce();
      } else {
        expect(screen.getByRole("status")).toHaveTextContent(
          "A custom view is active.",
        );
        expect(screen.getByRole("status")).not.toHaveTextContent(
          "Filters are active.",
        );
        expect(
          screen.queryByRole("button", { name: "Clear filters" }),
        ).not.toBeInTheDocument();
      }
    },
  );

  it("renders the list body with the shared header when selected", () => {
    render(
      <ModernSession {...defaultProps} isTimelineEnabled viewMode="list" />,
    );

    expect(screen.getByText("List body")).toBeInTheDocument();
    expect(screen.queryByText("Timeline body")).not.toBeInTheDocument();
    expect(screen.queryByText("Legacy body")).not.toBeInTheDocument();
  });

  it("keeps view tabs and empty state behind the timeline flag", () => {
    render(
      <ModernSession
        {...defaultProps}
        isTimelineEnabled={false}
        viewTabs={{ ...defaultProps.viewTabs, value: "" }}
      />,
    );

    expect(screen.getByText("Legacy body")).toBeInTheDocument();
    expect(screen.getByTestId("legacy-filter-controls")).toBeInTheDocument();
    expect(screen.queryByText("Timeline body")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "No pinned views" }),
    ).not.toBeInTheDocument();
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
