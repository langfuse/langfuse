import { type ReactNode, useState } from "react";
import { X } from "lucide-react";
import {
  type ColumnDefinition,
  type FilterState,
  type TableViewPresetState,
  TableViewPresetTableName,
} from "@langfuse/shared";
import {
  type ColumnOrderState,
  type VisibilityState,
} from "@tanstack/react-table";
import isEqual from "lodash/isEqual";

import {
  combineModernSessionObservationFilters,
  splitModernSessionObservationFilters,
  type ModernSessionObservationIdentity,
} from "@/src/components/session/modernSessionObservationFilters";
import { SESSION_DETAIL_SYSTEM_PRESETS } from "@/src/components/session/session-detail-presets";
import { type ModernSessionObservationFilterControls } from "@/src/components/session/ModernSessionObservationList";
import { TableViewPresetsDrawer } from "@/src/components/table/table-view-presets/components/data-table-view-presets-drawer";
import { useViewData } from "@/src/components/table/table-view-presets/hooks/useViewData";
import { useViewMutations } from "@/src/components/table/table-view-presets/hooks/useViewMutations";
import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { Input } from "@/src/components/ui/input";
import { InlineFilterBuilder } from "@/src/features/filters/components/filter-builder";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

type ViewControllers = {
  selectedViewId: string | null;
  appliedViewId: string | null;
  handleSetViewId: (viewId: string | null) => void;
  applyViewState: (
    viewData: TableViewPresetState,
    meta?: {
      trigger: "select" | "permalink" | "default" | "system_preset";
      viewId?: string | null;
    },
  ) => void;
};

type ModernSessionFilterControlsProps = {
  projectId: string;
  filterState: FilterState;
  filterColumns: ColumnDefinition[];
  filterColumnsWithCustomSelect: string[];
  onChange: (filters: FilterState) => void;
  viewControllers: ViewControllers;
  currentViewState: {
    orderBy: null;
    filters: FilterState;
    columnOrder: ColumnOrderState;
    columnVisibility: VisibilityState;
    searchQuery: string;
  };
  children: (controls: ModernSessionObservationFilterControls) => ReactNode;
};

const normalizeFilters = (filters: FilterState) =>
  filters.map((filter) =>
    Object.fromEntries(
      Object.entries(filter).filter(([, value]) => value !== undefined),
    ),
  );

export function ModernSessionFilterControls({
  projectId,
  filterState,
  filterColumns,
  filterColumnsWithCustomSelect,
  onChange,
  viewControllers,
  currentViewState,
  children,
}: ModernSessionFilterControlsProps) {
  const capture = usePostHogClientCapture();
  const [filterDialogOpen, setFilterDialogOpen] = useState(false);
  const [manageViewsOpen, setManageViewsOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState<FilterState>([]);
  const [draftExclusions, setDraftExclusions] = useState<
    ModernSessionObservationIdentity[]
  >([]);
  const [viewName, setViewName] = useState("");
  const { regularFilters, exclusions } =
    splitModernSessionObservationFilters(filterState);
  const activeFilterCount = regularFilters.length + exclusions.length;
  const { TableViewPresetsList } = useViewData({
    tableName: TableViewPresetTableName.SessionDetail,
    projectId,
  });
  const hasWriteAccess = useHasProjectAccess({
    projectId,
    scope: "TableViewPresets:CUD",
  });
  const { createMutation } = useViewMutations({
    handleSetViewId: viewControllers.handleSetViewId,
    applyViewState: viewControllers.applyViewState,
  });

  const matchingSystemPreset = SESSION_DETAIL_SYSTEM_PRESETS.find(
    (preset) =>
      preset.id === viewControllers.selectedViewId &&
      isEqual(normalizeFilters(preset.filters), normalizeFilters(filterState)),
  );
  const matchingSavedView = TableViewPresetsList?.find(
    (view) =>
      view.id === viewControllers.selectedViewId &&
      isEqual(normalizeFilters(view.filters), normalizeFilters(filterState)),
  );
  const activeViewName = matchingSystemPreset?.name ?? matchingSavedView?.name;

  const openFilterDialog = () => {
    const split = splitModernSessionObservationFilters(filterState);
    setDraftFilters(split.regularFilters);
    setDraftExclusions(split.exclusions);
    setViewName("");
    setFilterDialogOpen(true);
    capture("table:filter_builder_open", {
      tableName: "session-detail",
      isV4: true,
    });
  };

  const applyFilters = () => {
    const nextFilters = combineModernSessionObservationFilters(
      draftFilters,
      draftExclusions,
    );
    if (isEqual(normalizeFilters(nextFilters), normalizeFilters(filterState))) {
      setFilterDialogOpen(false);
      return;
    }

    onChange(nextFilters);
    const appliedFilter = nextFilters[nextFilters.length - 1];
    if (appliedFilter) {
      capture("filters:applied", {
        surface: "filter_builder",
        tableName: "session-detail",
        column: appliedFilter.column,
        filterType: appliedFilter.type,
        operator: appliedFilter.operator,
        ...("key" in appliedFilter && appliedFilter.key
          ? { key: appliedFilter.key }
          : {}),
        valueCount: Array.isArray(appliedFilter.value)
          ? appliedFilter.value.length
          : 1,
        conditionCount: nextFilters.length,
        columnConditionCount: nextFilters.filter(
          (filter) => filter.column === appliedFilter.column,
        ).length,
        isV4: true,
      });
    } else if (filterState.length > 0) {
      capture("filters:cleared", {
        surface: "filter_builder",
        tableName: "session-detail",
        clearedCount: filterState.length,
        isV4: true,
      });
    }
    setFilterDialogOpen(false);
  };

  const saveView = () => {
    const name = viewName.trim();
    if (!name) return;
    const nextFilters = combineModernSessionObservationFilters(
      draftFilters,
      draftExclusions,
    );

    capture("saved_views:create", {
      tableName: TableViewPresetTableName.SessionDetail,
    });
    createMutation.mutate({
      name,
      tableName: TableViewPresetTableName.SessionDetail,
      projectId,
      orderBy: null,
      filters: nextFilters,
      columnOrder: currentViewState.columnOrder,
      columnVisibility: currentViewState.columnVisibility,
      searchQuery: "",
    });
    setFilterDialogOpen(false);
  };

  const applyPreset = (
    preset: (typeof SESSION_DETAIL_SYSTEM_PRESETS)[number],
  ) => {
    capture("saved_views:system_preset_selected", {
      tableName: TableViewPresetTableName.SessionDetail,
      presetId: preset.id,
    });
    viewControllers.handleSetViewId(preset.id);
    viewControllers.applyViewState(
      {
        filters: preset.filters,
        columnOrder: [],
        columnVisibility: {},
        orderBy: null,
        searchQuery: "",
      },
      { trigger: "system_preset", viewId: preset.id },
    );
  };

  const applySavedView = (
    view: TableViewPresetState & { id: string; name: string },
  ) => {
    capture("saved_views:view_selected", {
      tableName: TableViewPresetTableName.SessionDetail,
      viewId: view.id,
    });
    viewControllers.handleSetViewId(view.id);
    viewControllers.applyViewState(view, {
      trigger: "select",
      viewId: view.id,
    });
  };

  const clearFilters = () => {
    onChange([]);
    viewControllers.handleSetViewId(null);
    capture("filters:cleared", {
      surface: "filter_builder",
      tableName: "session-detail",
      clearedCount: activeFilterCount,
      isV4: true,
    });
  };

  return (
    <>
      {children({
        activeFilterCount,
        activeViewName,
        selectedViewId: viewControllers.selectedViewId,
        matchingSystemPresetId: matchingSystemPreset?.id,
        matchingSavedViewId: matchingSavedView?.id,
        savedViews:
          TableViewPresetsList?.filter((view) => !view.isSystem) ?? [],
        onApplyPreset: applyPreset,
        onApplySavedView: applySavedView,
        onManageViews: () =>
          window.requestAnimationFrame(() => setManageViewsOpen(true)),
        onOpenFilterDialog: () =>
          window.requestAnimationFrame(openFilterDialog),
        onClearFilters: clearFilters,
      })}

      <Dialog open={filterDialogOpen} onOpenChange={setFilterDialogOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Filter observations</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-5 overflow-y-auto">
            <div className="space-y-2">
              <label
                htmlFor="modern-session-view-name"
                className="text-sm font-bold"
              >
                View name{" "}
                <span className="text-muted-foreground font-normal">
                  (optional)
                </span>
              </label>
              <Input
                id="modern-session-view-name"
                value={viewName}
                onChange={(event) => setViewName(event.target.value)}
                placeholder="Name this filter view"
              />
            </div>
            <InlineFilterBuilder
              columns={filterColumns}
              filterState={draftFilters}
              onChange={setDraftFilters}
              columnsWithCustomSelect={filterColumnsWithCustomSelect}
            />
            {draftExclusions.length > 0 ? (
              <div className="space-y-2">
                <h3 className="text-sm font-bold">Excluded observations</h3>
                <div className="flex flex-wrap gap-2">
                  {draftExclusions.map((exclusion) => {
                    const key = `${exclusion.type}:${exclusion.name}`;
                    return (
                      <span
                        key={key}
                        className="bg-muted flex items-center gap-1 rounded-sm px-2 py-1 text-xs"
                      >
                        {exclusion.type}: {exclusion.name}
                        <button
                          type="button"
                          aria-label={`Remove ${exclusion.type} ${exclusion.name} exclusion`}
                          onClick={() =>
                            setDraftExclusions((current) =>
                              current.filter(
                                (item) =>
                                  item.type !== exclusion.type ||
                                  item.name !== exclusion.name,
                              ),
                            )
                          }
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setFilterDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={saveView}
              disabled={
                !viewName.trim() || !hasWriteAccess || createMutation.isPending
              }
            >
              Save as view
            </Button>
            <Button onClick={applyFilters}>Apply filters</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TableViewPresetsDrawer
        open={manageViewsOpen}
        onOpenChange={setManageViewsOpen}
        hideTrigger
        viewConfig={{
          tableName: TableViewPresetTableName.SessionDetail,
          projectId,
          controllers: viewControllers,
        }}
        currentState={currentViewState}
        systemFilterPresets={SESSION_DETAIL_SYSTEM_PRESETS}
      />
    </>
  );
}
