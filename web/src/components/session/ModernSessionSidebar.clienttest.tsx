import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ModernSessionSidebar,
  type ModernSessionSidebarFilterControls,
} from "@/src/components/session/ModernSessionSidebar";
import { type EventSessionTrace } from "@/src/components/session/sessionDetailPageTypes";

const virtualizer = vi.hoisted(() => ({
  getTotalSize: vi.fn(() => 0),
  getVirtualItems: vi.fn(
    (): Array<{
      index: number;
      key: string;
      start: number;
      end: number;
      size: number;
      lane: number;
    }> => [],
  ),
  scrollToIndex: vi.fn(),
  scrollToOffset: vi.fn(),
  resizeItem: vi.fn(),
  isScrolling: false,
  scrollElement: null as HTMLElement | null,
}));

const virtualizerControl = vi.hoisted(() => ({
  notifyChange: null as (() => void) | null,
}));

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: (options: {
    onChange?: (instance: typeof virtualizer) => void;
  }) => {
    virtualizerControl.notifyChange = () => options.onChange?.(virtualizer);
    return virtualizer;
  },
}));

const traces = Array.from({ length: 3 }, (_, index) => ({
  id: `turn-${index + 1}`,
  name: `Turn ${index + 1}`,
  timestamp: new Date(`2026-01-01T12:0${index}:00.000Z`),
  environment: "production",
  userId: "user-1",
  observationCount: 0,
  latencyMs: 1_000,
  scores: [],
})) satisfies EventSessionTrace[];

const filterControls = {
  activeFilterCount: 0,
  activeFilters: [],
  activeViewName: undefined,
  selectedViewId: null,
  matchingSystemPresetId: undefined,
  matchingSavedViewId: undefined,
  savedViews: [],
  onApplyPreset: vi.fn(),
  onApplySavedView: vi.fn(),
  onManageViews: vi.fn(),
  onOpenFilterDialog: vi.fn(),
  onClearFilters: vi.fn(),
} satisfies ModernSessionSidebarFilterControls;

function sidebar(activeTraceId: string, onSelect = vi.fn()) {
  return (
    <ModernSessionSidebar
      state="loaded"
      traces={traces.map((trace, index) => ({
        trace,
        turnNumber: index + 1,
        observations: [],
        hasMatchingTraceLevelIO: false,
      }))}
      activeTraceId={activeTraceId}
      filterControls={filterControls}
      search=""
      onSearchChange={vi.fn()}
      expandedTraceIds={new Set(traces.map((trace) => trace.id))}
      onToggleTraceExpanded={vi.fn()}
      onExcludeObservation={vi.fn()}
      onSelect={onSelect}
      onVisibleTraceIdsChange={vi.fn()}
      hasMoreObservations={false}
      isLoadingMoreObservations={false}
      observationLoadError={false}
      onLoadMoreObservations={vi.fn()}
    />
  );
}

describe("ModernSessionSidebar", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    virtualizer.scrollToIndex.mockReset();
    virtualizer.scrollToOffset.mockReset();
    virtualizer.getVirtualItems.mockReturnValue([]);
    virtualizer.scrollElement = null;
    virtualizerControl.notifyChange = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("follows the active turn without overriding manual sidebar scrolling", () => {
    const view = render(sidebar("turn-1"));

    expect(virtualizer.scrollToIndex).toHaveBeenLastCalledWith(0, {
      align: "auto",
    });

    fireEvent.wheel(screen.getByLabelText("Session turns"));
    view.rerender(sidebar("turn-2"));

    expect(virtualizer.scrollToIndex).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(1_000));
    expect(virtualizer.scrollToIndex).toHaveBeenCalledTimes(1);

    view.rerender(sidebar("turn-3"));
    expect(virtualizer.scrollToIndex).toHaveBeenLastCalledWith(2, {
      align: "auto",
    });
  });

  it("uses the stable turn number when selecting a filtered turn", () => {
    const onSelect = vi.fn();
    virtualizer.getVirtualItems.mockReturnValue([
      { index: 0, key: "turn-3", start: 0, end: 160, size: 160, lane: 0 },
    ]);

    render(
      <ModernSessionSidebar
        state="loaded"
        traces={[
          {
            trace: traces[2]!,
            turnNumber: 3,
            observations: [
              {
                id: "observation-3",
                name: "Matching observation",
                type: "SPAN",
                latency: 0.5,
              },
            ],
            hasMatchingTraceLevelIO: false,
          },
        ]}
        activeTraceId="turn-3"
        filterControls={filterControls}
        search="matching"
        onSearchChange={vi.fn()}
        expandedTraceIds={new Set(["turn-3"])}
        onToggleTraceExpanded={vi.fn()}
        onExcludeObservation={vi.fn()}
        onSelect={onSelect}
        onVisibleTraceIdsChange={vi.fn()}
        hasMoreObservations={false}
        isLoadingMoreObservations={false}
        observationLoadError={false}
        onLoadMoreObservations={vi.fn()}
      />,
    );

    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Matching observation")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Turn 3/i }));
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it("reports visible turns and loads more when search results are exhausted", () => {
    const onVisibleTraceIdsChange = vi.fn();
    const onLoadMoreObservations = vi.fn();
    virtualizer.getVirtualItems.mockReturnValue([
      { index: 0, key: "turn-1", start: 0, end: 160, size: 160, lane: 0 },
    ]);

    render(
      <ModernSessionSidebar
        state="loaded"
        traces={[
          {
            trace: traces[0]!,
            turnNumber: 1,
            observations: [],
            hasMatchingTraceLevelIO: false,
          },
        ]}
        activeTraceId="turn-1"
        filterControls={filterControls}
        search="matching"
        onSearchChange={vi.fn()}
        expandedTraceIds={new Set(["turn-1"])}
        onToggleTraceExpanded={vi.fn()}
        onExcludeObservation={vi.fn()}
        onSelect={vi.fn()}
        onVisibleTraceIdsChange={onVisibleTraceIdsChange}
        hasMoreObservations
        isLoadingMoreObservations={false}
        observationLoadError={false}
        onLoadMoreObservations={onLoadMoreObservations}
        onViewportUnderfilled={onLoadMoreObservations}
      />,
    );

    virtualizer.scrollElement = screen.getByLabelText("Session turns");
    act(() => virtualizerControl.notifyChange?.());

    expect(onVisibleTraceIdsChange).toHaveBeenCalledWith(["turn-1"]);
    expect(onLoadMoreObservations).toHaveBeenCalledOnce();
  });

  it("loads another browse page near the end of the visible turn", () => {
    const onLoadMoreObservations = vi.fn();
    virtualizer.getVirtualItems.mockReturnValue([
      { index: 0, key: "turn-1", start: 0, end: 400, size: 400, lane: 0 },
    ]);

    render(
      <ModernSessionSidebar
        state="loaded"
        traces={[
          {
            trace: traces[0]!,
            turnNumber: 1,
            observations: [],
            hasMatchingTraceLevelIO: false,
          },
        ]}
        activeTraceId="turn-1"
        filterControls={filterControls}
        search=""
        onSearchChange={vi.fn()}
        expandedTraceIds={new Set(["turn-1"])}
        onToggleTraceExpanded={vi.fn()}
        onExcludeObservation={vi.fn()}
        onSelect={vi.fn()}
        onVisibleTraceIdsChange={vi.fn()}
        hasMoreObservations
        isLoadingMoreObservations={false}
        observationLoadError={false}
        onLoadMoreObservations={onLoadMoreObservations}
      />,
    );

    const region = screen.getByLabelText("Session turns");
    Object.defineProperties(region, {
      clientHeight: { configurable: true, value: 100 },
      scrollTop: { configurable: true, value: 0, writable: true },
    });

    fireEvent.scroll(region);
    expect(onLoadMoreObservations).not.toHaveBeenCalled();

    region.scrollTop = 200;
    fireEvent.scroll(region);
    expect(onLoadMoreObservations).toHaveBeenCalledOnce();
  });

  it("distinguishes matching trace I/O from missing child spans", () => {
    virtualizer.getVirtualItems.mockReturnValue([
      { index: 0, key: "turn-1", start: 0, end: 160, size: 160, lane: 0 },
      { index: 1, key: "turn-2", start: 160, end: 320, size: 160, lane: 0 },
    ]);
    const onSelect = vi.fn();

    render(
      <ModernSessionSidebar
        state="loaded"
        traces={[
          {
            trace: traces[0]!,
            turnNumber: 1,
            observations: [],
            hasMatchingTraceLevelIO: true,
          },
          {
            trace: traces[1]!,
            turnNumber: 2,
            observations: [],
            hasMatchingTraceLevelIO: false,
          },
        ]}
        activeTraceId="turn-1"
        filterControls={filterControls}
        search="matching"
        onSearchChange={vi.fn()}
        expandedTraceIds={new Set(["turn-1", "turn-2"])}
        onToggleTraceExpanded={vi.fn()}
        onExcludeObservation={vi.fn()}
        onSelect={onSelect}
        onVisibleTraceIdsChange={vi.fn()}
        hasMoreObservations={false}
        isLoadingMoreObservations={false}
        observationLoadError={false}
        onLoadMoreObservations={vi.fn()}
      />,
    );

    expect(screen.getByText("Trace-level I/O only")).toBeInTheDocument();
    expect(
      screen.getByText("No matching child observations"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText("Trace-level I/O only"));
    expect(onSelect).toHaveBeenCalledWith(0);
  });

  it("shows observation loading errors when search has no rows", () => {
    render(
      <ModernSessionSidebar
        state="loaded"
        traces={[]}
        activeTraceId={undefined}
        filterControls={filterControls}
        search="missing"
        onSearchChange={vi.fn()}
        expandedTraceIds={new Set()}
        onToggleTraceExpanded={vi.fn()}
        onExcludeObservation={vi.fn()}
        onSelect={vi.fn()}
        onVisibleTraceIdsChange={vi.fn()}
        hasMoreObservations={false}
        isLoadingMoreObservations={false}
        observationLoadError
        onLoadMoreObservations={vi.fn()}
      />,
    );

    expect(screen.getByText("Failed to load observations")).toBeInTheDocument();
  });
});
