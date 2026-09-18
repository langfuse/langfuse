import { useCallback, useMemo } from "react";
import { Copy, CopyPlus, FileJson, Trash } from "lucide-react";
import startCase from "lodash/startCase";
import { type DashboardWidgetChartType } from "@langfuse/shared/src/db";

import {
  Table,
  type TableProps,
} from "@/src/components/design-system/table/Table";
import { createDateTableColumn } from "@/src/components/design-system/table/columns/createDateTableColumn";
import { createBadgeTableColumn } from "@/src/components/design-system/table/columns/createBadgeTableColumn";
import { createLinkTableColumn } from "@/src/components/design-system/table/columns/createLinkTableColumn";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { dashboardWidgetChartTypeIcons } from "@/src/features/widgets/chart-library/chartTypeIcons";

const TYPE_COLUMN_SIZE = 140;

const chartTypeLabels: Record<DashboardWidgetChartType, string> = {
  LINE_TIME_SERIES: "Line Chart",
  AREA_TIME_SERIES: "Area Chart",
  BAR_TIME_SERIES: "Bar Chart",
  HORIZONTAL_BAR: "Horizontal Bar Chart",
  VERTICAL_BAR: "Vertical Bar Chart",
  PIE: "Pie Chart",
  NUMBER: "Big Number",
  HISTOGRAM: "Histogram",
  PIVOT_TABLE: "Pivot Table",
};

const chartDisplayModes: Record<DashboardWidgetChartType, string> = {
  LINE_TIME_SERIES: "Time Series",
  AREA_TIME_SERIES: "Time Series",
  BAR_TIME_SERIES: "Time Series",
  HORIZONTAL_BAR: "Total Value",
  VERTICAL_BAR: "Total Value",
  PIE: "Total Value",
  NUMBER: "Total Value",
  HISTOGRAM: "Total Value",
  PIVOT_TABLE: "Total Value",
};

const viewBadgeVariants = {
  TRACES: "blue",
  OBSERVATIONS: "teal",
  SCORES_NUMERIC: "green",
  SCORES_BOOLEAN: "violet",
  SCORES_CATEGORICAL: "pink",
} as const;

const chartTypeBadgeVariants = {
  LINE_TIME_SERIES: "blue",
  AREA_TIME_SERIES: "emerald",
  BAR_TIME_SERIES: "violet",
  HORIZONTAL_BAR: "teal",
  VERTICAL_BAR: "orange",
  PIE: "pink",
  NUMBER: "green",
  HISTOGRAM: "purple",
  PIVOT_TABLE: "amber",
} as const;

export type WidgetTableRow = {
  id: string;
  name: string;
  description: string;
  view: string;
  chartType: string;
  createdAt: Date;
  updatedAt: Date;
  owner: "PROJECT" | "LANGFUSE";
};

export function DashboardWidgetTable({
  projectId,
  hasCUDAccess,
  onCopy,
  onDelete,
  onDownload,
  onDuplicate,
  ...tableProps
}: Pick<
  TableProps<WidgetTableRow>,
  | "data"
  | "loadingRowCount"
  | "noResultsMessage"
  | "onRowClick"
  | "orderBy"
  | "setOrderBy"
> & {
  projectId: string | undefined;
  hasCUDAccess: boolean;
  onCopy: (widget: WidgetTableRow) => void;
  onDelete: (widget: WidgetTableRow) => void;
  onDownload: (widget: WidgetTableRow) => void;
  onDuplicate: (widget: WidgetTableRow) => void;
}) {
  const columns = useMemo<LangfuseColumnDef<WidgetTableRow>[]>(
    () => [
      createLinkTableColumn<WidgetTableRow>({
        accessorKey: "name",
        header: "Name",
        enableSorting: true,
        size: 200,
        getCell: (name, { row }) =>
          name
            ? {
                type: "link",
                props: {
                  path: `/project/${projectId}/widgets/${encodeURIComponent(row.original.id)}`,
                  value: name,
                },
              }
            : undefined,
      }),
      createTextTableColumn<WidgetTableRow>({
        accessorKey: "description",
        header: "Description",
        size: 300,
      }),
      createBadgeTableColumn<WidgetTableRow>({
        range: "decorative",
        accessorKey: "view",
        header: "View Type",
        enableSorting: true,
        size: TYPE_COLUMN_SIZE,
        getBadge: (view) => ({
          value: startCase(view.toLowerCase()),
          variant:
            viewBadgeVariants[view as keyof typeof viewBadgeVariants] ?? "blue",
        }),
      }),
      createBadgeTableColumn<WidgetTableRow>({
        range: "decorative",
        accessorKey: "chartType",
        header: "Chart Type",
        enableSorting: true,
        size: TYPE_COLUMN_SIZE,
        getBadge: (chartType) => ({
          value: chartTypeLabels[chartType as DashboardWidgetChartType],
          variant:
            chartTypeBadgeVariants[chartType as DashboardWidgetChartType],
          icon: dashboardWidgetChartTypeIcons[
            chartType as DashboardWidgetChartType
          ],
        }),
      }),
      createBadgeTableColumn<WidgetTableRow>({
        range: "decorative",
        accessorFn: (row) =>
          chartDisplayModes[row.chartType as DashboardWidgetChartType],
        id: "displayMode",
        header: "Display Mode",
        enableSorting: true,
        size: TYPE_COLUMN_SIZE,
        getBadge: (displayMode) => ({
          value: displayMode,
          variant: displayMode === "Time Series" ? "blue" : "teal",
          icon:
            displayMode === "Time Series"
              ? dashboardWidgetChartTypeIcons.LINE_TIME_SERIES
              : dashboardWidgetChartTypeIcons.NUMBER,
        }),
      }),
      createDateTableColumn<WidgetTableRow>({
        accessorKey: "createdAt",
        header: "Created At",
        enableSorting: true,
        mode: "relative",
        size: 100,
      }),
      createDateTableColumn<WidgetTableRow>({
        accessorKey: "updatedAt",
        header: "Updated At",
        enableSorting: true,
        mode: "relative",
        size: 100,
      }),
    ],
    [projectId],
  );
  const actions = useCallback<
    NonNullable<TableProps<WidgetTableRow>["actions"]>
  >(
    (row) => [
      {
        id: "copy",
        type: "item",
        title: "Copy widget",
        icon: Copy,
        onClick: () => onCopy(row),
      },
      {
        id: "clone",
        type: "item",
        title: "Clone",
        icon: CopyPlus,
        disabled: hasCUDAccess
          ? undefined
          : { reason: "You do not have permission to clone widgets" },
        onClick: () => onDuplicate(row),
      },
      {
        id: "download",
        type: "item",
        title: "Download as JSON",
        icon: FileJson,
        onClick: () => onDownload(row),
      },
      { id: "delete-separator", type: "separator" },
      {
        id: "delete",
        type: "item",
        title: "Delete",
        icon: Trash,
        variant: "destructive",
        disabled:
          hasCUDAccess && row.owner !== "LANGFUSE"
            ? undefined
            : {
                reason: "You do not have permission to delete this widget",
              },
        onClick: () => onDelete(row),
      },
    ],
    [hasCUDAccess, onCopy, onDelete, onDownload, onDuplicate],
  );

  return (
    <Table
      tableName="widgets"
      columns={columns}
      actions={actions}
      {...tableProps}
    />
  );
}
