import { dashboardBlockContentSchema } from "@langfuse/shared";
import { type z } from "zod";
import { type metricAggregations } from "@langfuse/shared/query";
import {
  buildWidgetExport,
  downloadWidgetJson,
  type WidgetExportSource,
} from "@/src/features/widgets/utils/import-export-utils";
import { copyTextToClipboard } from "@/src/utils/clipboard";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useContext, useState } from "react";
import { useRouter } from "next/router";
import {
  Pencil,
  CopyPlusIcon,
  Trash2,
  CopyIcon,
  FileJsonIcon,
} from "@langfuse/icons";
import { api, type RouterOutputs } from "@/src/utils/api";
import { DashboardBlocksContext } from "@/src/features/dashboard-blocks/dashboard-block-context";
import { MultiQueryChart } from "@/src/features/dashboard-blocks/multi-query/MultiQueryChart";
import { DashboardMarkdown } from "@/src/features/dashboard-blocks/DashboardMarkdown";
import { type DashboardWidget } from "./DashboardWidget";
import { type DataCardActions } from "@/src/components/design-system/DataCard/DataCard";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import useIsFeatureEnabled from "@/src/features/feature-flags/hooks/useIsFeatureEnabled";

export function SavedWidgetCard({
  widget,
  ...props
}: Parameters<typeof DashboardWidget>[0] & {
  widget: NonNullable<RouterOutputs["dashboardWidgets"]["get"]> & {
    definition: NonNullable<
      NonNullable<RouterOutputs["dashboardWidgets"]["get"]>["definition"]
    >;
  };
}) {
  const router = useRouter();
  const capture = usePostHogClientCapture();
  const utils = api.useUtils();
  const context = useContext(DashboardBlocksContext);
  const authoring = useIsFeatureEnabled("dashboardBlockAuthoring");
  const permission = useHasProjectAccess({
    projectId: props.projectId,
    scope: "dashboards:CUD",
  });
  const [selectedTabId, setSelectedTabId] = useState<string>();
  const duplicate = api.dashboardWidgets.saveDefinition.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.dashboard.invalidate(),
        utils.dashboardWidgets.invalidate(),
      ]);
    },
  });
  const definition = widget.definition;

  const editable =
    !props.readOnly &&
    permission &&
    authoring &&
    props.dashboardOwner === "PROJECT";
  const edit = () => {
    if (!context) {
      router.push(
        `/project/${props.projectId}/widgets/${widget.id}?dashboardId=${props.dashboardId}`,
      );
      return;
    }
    context.openEditor({
      kind: definition.kind,
      block: {
        id: widget.id,
        revision: widget.revision ?? 0,
        beforePlacementId: null,
        ...definition,
      },
      widgetId: widget.id,
      expectedRevision: widget.revision,
      initialTabId: selectedTabId,
      onTabSaved: setSelectedTabId,
    });
  };
  const exportSource: WidgetExportSource = {
    ...widget,
    definition,
    metrics: widget.metrics.map((metric) => ({
      ...metric,
      agg: metric.agg as z.infer<typeof metricAggregations>,
    })),
  };
  const copy = async () => {
    try {
      await copyTextToClipboard(
        JSON.stringify(buildWidgetExport(exportSource), null, 2),
      );
      capture("dashboard:widget_copied_to_clipboard", {
        surface: "grid_menu",
        kind: "widget",
        widget_id: widget.id,
        dashboard_id: props.dashboardId,
      });
      showSuccessToast({
        operation: "widget.copy",
        title: "Widget copied",
        description: "Paste it on any dashboard with Cmd/Ctrl+V.",
      });
    } catch {
      showErrorToast("Copy failed", "Could not write to the clipboard.", {
        operation: "widget.copy",
        errorOrigin: "frontend",
        errorCategory: "permission",
      });
    }
  };
  const actions: DataCardActions = {
    draggable:
      !props.readOnly && permission && props.dashboardOwner === "PROJECT",
    buttons: editable
      ? [
          { id: "edit", label: "Edit widget", icon: Pencil, onClick: edit },
          {
            id: "duplicate",
            label: "Duplicate widget",
            icon: CopyPlusIcon,
            disabled: duplicate.isPending,
            onClick: () =>
              duplicate.mutate({
                projectId: props.projectId,
                dashboardId: props.dashboardId,
                beforePlacementId: props.placement.id,
                definition: dashboardBlockContentSchema.parse({
                  ...definition,
                  config: {
                    ...definition.config,
                    title: `${definition.config.title.slice(0, 190)} (Copy)`,
                  },
                }),
              }),
          },
        ]
      : [],
    menu: [
      {
        id: "copy",
        type: "item",
        title: "Copy widget",
        icon: CopyIcon,
        onClick: copy,
      },
      {
        id: "download-json",
        type: "item",
        title: "Download as JSON",
        icon: FileJsonIcon,
        onClick: () => {
          downloadWidgetJson(exportSource);
          capture("dashboard:widget_json_downloaded", {
            surface: "grid_menu",
            widget_id: widget.id,
            dashboard_id: props.dashboardId,
          });
        },
      },
      ...(!props.readOnly && permission && props.dashboardOwner === "PROJECT"
        ? [
            {
              id: "remove",
              type: "item" as const,
              title: "Remove widget",
              icon: Trash2,
              variant: "destructive" as const,
              onClick: () => props.onDeleteWidget(props.placement.id),
            },
          ]
        : []),
    ],
  };
  return definition.kind === "markdown" ? (
    <DashboardMarkdown
      title={definition.config.title}
      content={definition.config.content}
      actions={actions}
    />
  ) : (
    <MultiQueryChart
      config={definition.config}
      selectedTabId={selectedTabId}
      onSelectTab={setSelectedTabId}
      projectId={props.projectId}
      dateRange={props.dateRange}
      filterState={props.filterState}
      readPath={props.readPath}
      actions={actions}
    />
  );
}
