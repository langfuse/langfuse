import { type ReactNode, useState } from "react";
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
  ModernSessionFilterDialogContent,
  type ModernSessionFilterDialogViewActions,
} from "@/src/features/sessions/ModernSessionFilterDialogContent";
import { ModernSessionSaveViewDialogContent } from "@/src/features/sessions/ModernSessionSaveViewDialogContent";
import { SESSION_DETAIL_SYSTEM_PRESETS } from "@/src/features/sessions/session-detail-presets";
import { type ModernSessionSidebarFilterControls } from "@/src/features/sessions/ModernSessionSidebar";
import {
  TableViewPresetsDrawerContent,
  TableViewPresetsDrawerRoot,
} from "@/src/components/table/table-view-presets/components/data-table-view-presets-drawer";
import type { useTableViewManager } from "@/src/components/table/table-view-presets/hooks/useTableViewManager";
import { useViewData } from "@/src/components/table/table-view-presets/hooks/useViewData";
import { useViewMutations } from "@/src/components/table/table-view-presets/hooks/useViewMutations";
import { Dialog } from "@/src/components/ui/dialog";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

type ViewControllers = Pick<
  ReturnType<typeof useTableViewManager>,
  | "selectedViewId"
  | "appliedViewId"
  | "viewUpdateTarget"
  | "filterEditorResetKey"
  | "handleSetViewId"
  | "handleUserStateChange"
  | "applyViewState"
>;

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
  children: (controls: ModernSessionSidebarFilterControls) => ReactNode;
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
  const [saveViewDialogOpen, setSaveViewDialogOpen] = useState(false);
  const [manageViewsOpen, setManageViewsOpen] = useState(false);
  const [filtersToSave, setFiltersToSave] = useState<FilterState>([]);
  const activeFilterCount = filterState.length;
  const { TableViewPresetsList } = useViewData({
    tableName: TableViewPresetTableName.SessionDetail,
    projectId,
  });
  const hasWriteAccess = useHasProjectAccess({
    projectId,
    scope: "TableViewPresets:CUD",
  });
  const { createMutation, updateConfigMutation } = useViewMutations({
    handleSetViewId: viewControllers.handleSetViewId,
    applyViewState: viewControllers.applyViewState,
  });

  const matchingSystemPreset = SESSION_DETAIL_SYSTEM_PRESETS.find(
    (preset) => preset.id === viewControllers.selectedViewId,
  );
  const matchingSavedView = TableViewPresetsList?.find(
    (view) => view.id === viewControllers.selectedViewId,
  );
  const updateViewId =
    viewControllers.selectedViewId ?? viewControllers.viewUpdateTarget?.viewId;
  const updateView = TableViewPresetsList?.find(
    (view) => view.id === updateViewId && !view.isSystem,
  );
  const activeViewName = matchingSystemPreset?.name ?? matchingSavedView?.name;

  const openFilterDialog = () => {
    setFilterDialogOpen(true);
    capture("table:filter_builder_open", {
      tableName: "session-detail",
      isV4: true,
    });
  };

  const applyFilters = (nextFilters: FilterState) => {
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

  const saveView = (name: string) => {
    capture("saved_views:create", {
      tableName: TableViewPresetTableName.SessionDetail,
    });
    createMutation.mutate({
      name,
      tableName: TableViewPresetTableName.SessionDetail,
      projectId,
      orderBy: null,
      filters: filtersToSave,
      columnOrder: currentViewState.columnOrder,
      columnVisibility: currentViewState.columnVisibility,
      searchQuery: "",
    });
    setSaveViewDialogOpen(false);
  };

  const updateCurrentView = (filters: FilterState) => {
    if (!updateView) return;

    capture("saved_views:update_config", {
      tableName: TableViewPresetTableName.SessionDetail,
      viewId: updateView.id,
      name: updateView.name,
    });

    const viewWasApplied =
      viewControllers.appliedViewId === updateView.id ||
      (viewControllers.viewUpdateTarget?.viewId === updateView.id &&
        viewControllers.viewUpdateTarget.columnsApplied);
    updateConfigMutation.mutate(
      {
        projectId,
        name: updateView.name,
        id: updateView.id,
        tableName: TableViewPresetTableName.SessionDetail,
        orderBy: null,
        filters,
        columnOrder: viewWasApplied
          ? currentViewState.columnOrder
          : updateView.columnOrder,
        columnVisibility: viewWasApplied
          ? currentViewState.columnVisibility
          : updateView.columnVisibility,
        searchQuery: "",
      },
      {
        onSuccess: () => {
          onChange(filters);
          setFilterDialogOpen(false);
        },
      },
    );
  };

  const openSaveViewDialog = (filters: FilterState) => {
    setFiltersToSave(filters);
    setFilterDialogOpen(false);
    setSaveViewDialogOpen(true);
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
    viewControllers.handleUserStateChange(filterState, [], { force: true });
    onChange([]);
    capture("filters:cleared", {
      surface: "filter_builder",
      tableName: "session-detail",
      clearedCount: activeFilterCount,
      isV4: true,
    });
  };

  let filterDialogViewActions: ModernSessionFilterDialogViewActions = {
    type: "none",
  };
  if (hasWriteAccess && updateView) {
    filterDialogViewActions = {
      type: "update",
      viewName: updateView.name,
      isUpdating: updateConfigMutation.isPending,
      onCreate: openSaveViewDialog,
      onUpdate: updateCurrentView,
    };
  } else if (hasWriteAccess) {
    filterDialogViewActions = {
      type: "create",
      onCreate: openSaveViewDialog,
    };
  }

  return (
    <>
      {children({
        activeFilterCount,
        activeFilters: filterState,
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
        {filterDialogOpen ? (
          <ModernSessionFilterDialogContent
            key={viewControllers.filterEditorResetKey}
            initialFilters={filterState}
            filterColumns={filterColumns}
            filterColumnsWithCustomSelect={filterColumnsWithCustomSelect}
            viewActions={filterDialogViewActions}
            onCancel={() => setFilterDialogOpen(false)}
            onApplyFilters={applyFilters}
          />
        ) : null}
      </Dialog>

      <Dialog open={saveViewDialogOpen} onOpenChange={setSaveViewDialogOpen}>
        {saveViewDialogOpen ? (
          <ModernSessionSaveViewDialogContent
            isSaving={createMutation.isPending}
            onCancel={() => {
              setSaveViewDialogOpen(false);
              setFilterDialogOpen(true);
            }}
            onSave={saveView}
          />
        ) : null}
      </Dialog>

      <TableViewPresetsDrawerRoot
        tableName={TableViewPresetTableName.SessionDetail}
        open={manageViewsOpen}
        onOpenChange={setManageViewsOpen}
      >
        <TableViewPresetsDrawerContent
          viewConfig={{
            tableName: TableViewPresetTableName.SessionDetail,
            projectId,
            controllers: viewControllers,
          }}
          currentState={currentViewState}
          systemFilterPresets={SESSION_DETAIL_SYSTEM_PRESETS}
        />
      </TableViewPresetsDrawerRoot>
    </>
  );
}
