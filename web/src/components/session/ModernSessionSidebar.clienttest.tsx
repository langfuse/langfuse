import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ModernSessionSidebar,
  type ModernSessionSidebarFilterControls,
} from "@/src/components/session/ModernSessionSidebar";
import { type EventSessionTrace } from "@/src/components/session/sessionDetailPageTypes";

const virtualizer = vi.hoisted(() => ({
  getTotalSize: vi.fn(() => 0),
  getVirtualItems: vi.fn(() => []),
  scrollToIndex: vi.fn(),
}));

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: () => virtualizer,
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

function sidebar(activeTraceId: string) {
  return (
    <ModernSessionSidebar
      state="loaded"
      traces={traces}
      activeTraceId={activeTraceId}
      filterControls={filterControls}
      renderObservationRows={() => null}
      onSelect={vi.fn()}
    />
  );
}

describe("ModernSessionSidebar", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    virtualizer.scrollToIndex.mockReset();
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
});
