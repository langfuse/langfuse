import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FilterState } from "@langfuse/shared";
import { ModernSessionFilterControls } from "./ModernSessionFilterControls";

const { updateConfig, savedViews } = vi.hoisted(() => ({
  updateConfig: vi.fn(),
  savedViews: [
    {
      id: "saved-view",
      name: "Saved session",
      isSystem: false,
      filters: [],
      columnOrder: ["stored-column"],
      columnVisibility: { stored: false },
    },
  ],
}));
vi.mock("@/src/components/table/table-view-presets/hooks/useViewData", () => ({
  useViewData: () => ({ TableViewPresetsList: savedViews }),
}));
vi.mock(
  "@/src/components/table/table-view-presets/hooks/useViewMutations",
  () => ({
    useViewMutations: () => ({
      createMutation: { mutate: vi.fn(), isPending: false },
      updateConfigMutation: { mutate: updateConfig, isPending: false },
    }),
  }),
);
vi.mock("@/src/features/rbac/utils/checkProjectAccess", () => ({
  useHasProjectAccess: () => true,
}));
vi.mock("@/src/features/posthog-analytics/usePostHogClientCapture", () => ({
  usePostHogClientCapture: () => vi.fn(),
}));
vi.mock(
  "@/src/components/table/table-view-presets/components/data-table-view-presets-drawer",
  () => ({
    TableViewPresetsDrawerRoot: ({ children }: { children: ReactNode }) => (
      <>{children}</>
    ),
    TableViewPresetsDrawerContent: () => <div />,
  }),
);
vi.mock("@/src/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("./ModernSessionFilterDialogContent", () => ({
  ModernSessionFilterDialogContent: ({
    initialFilters,
    viewActions,
  }: {
    initialFilters: FilterState;
    viewActions: {
      type: string;
      viewName?: string;
      onUpdate?: (filters: FilterState) => void;
    };
  }) => (
    <button onClick={() => viewActions.onUpdate?.(initialFilters)}>
      {viewActions.type === "update"
        ? `Update ${viewActions.viewName}`
        : "Create view"}
    </button>
  ),
}));
vi.mock("./ModernSessionSaveViewDialogContent", () => ({
  ModernSessionSaveViewDialogContent: () => <div />,
}));

type Props = ComponentProps<typeof ModernSessionFilterControls>;
const makeProps = (): Props => ({
  projectId: "project",
  filterState: [],
  filterColumns: [],
  filterColumnsWithCustomSelect: [],
  onChange: vi.fn(),
  viewControllers: {
    selectedViewId: "saved-view",
    appliedViewId: "saved-view",
    viewUpdateTarget: null,
    filterEditorResetKey: 0,
    handleSetViewId: vi.fn(),
    handleUserStateChange: vi.fn(),
    applyViewState: vi.fn(),
  },
  currentViewState: {
    orderBy: null,
    filters: [],
    columnOrder: ["local-column"],
    columnVisibility: { local: false },
    searchQuery: "",
  },
  children: (controls) => (
    <>
      <span>{controls.activeViewName ?? "No view"}</span>
      <button onClick={controls.onClearFilters}>Clear</button>
      <button onClick={controls.onOpenFilterDialog}>Edit filters</button>
    </>
  ),
});

describe("session detail saved-view controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
  });
  it("marks the selected view by ID when explicit URL filters differ", () => {
    const props = makeProps();
    render(
      <ModernSessionFilterControls
        {...props}
        filterState={[
          {
            type: "stringOptions",
            column: "level",
            operator: "any of",
            value: ["ERROR"],
          },
        ]}
      />,
    );
    expect(screen.getByText("Saved session")).toBeInTheDocument();
  });
  it("forces Clear on an empty selected view without discarding its update target", () => {
    const props = makeProps();
    render(<ModernSessionFilterControls {...props} />);
    fireEvent.click(screen.getByText("Clear"));
    expect(props.viewControllers.handleUserStateChange).toHaveBeenCalledWith(
      [],
      [],
      { force: true },
    );
    expect(props.viewControllers.handleSetViewId).not.toHaveBeenCalled();
    expect(props.onChange).toHaveBeenCalledWith([]);
  });
  it.each([true, false])(
    "keeps the original update target after demotion, columnsApplied=%s",
    (columnsApplied) => {
      const props = makeProps();
      props.viewControllers.selectedViewId = null;
      props.viewControllers.appliedViewId = null;
      props.viewControllers.viewUpdateTarget = {
        viewId: "saved-view",
        columnsApplied,
      };
      render(<ModernSessionFilterControls {...props} />);
      expect(screen.getByText("No view")).toBeInTheDocument();
      act(() => {
        fireEvent.click(screen.getByText("Edit filters"));
      });
      fireEvent.click(screen.getByText("Update Saved session"));
      expect(updateConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "saved-view",
          columnOrder: columnsApplied ? ["local-column"] : ["stored-column"],
          columnVisibility: columnsApplied
            ? { local: false }
            : { stored: false },
        }),
        expect.any(Object),
      );
    },
  );
});
