import { useRouter } from "next/router";
import { useState } from "react";
import { DashboardBlockEditor } from "@/src/features/dashboard-blocks/DashboardBlockEditor";
import {
  HOME_DASHBOARD_PRESET_IDS,
  type HomeDashboardPresetId,
} from "@langfuse/shared";
import { toWidgetDefinition } from "@langfuse/shared/dashboards";
import { normalizeStoredWidgetFiltersForEditor } from "@/src/features/dashboard/lib/dashboardUiTableToViewMapping";
import { api, type RouterOutputs } from "@/src/utils/api";
import { useReadPath } from "@/src/features/events/hooks/useReadPath";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { MultiQueryEditor } from "@/src/features/dashboard-blocks/multi-query/MultiQueryEditor";
import { DashboardMarkdownEditor } from "@/src/features/dashboard-blocks/DashboardMarkdownEditor";
import { useDashboardBlockCapabilities } from "@/src/features/dashboard-blocks/useDashboardBlockCapabilities";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

type Widget = NonNullable<RouterOutputs["dashboardWidgets"]["get"]>;

export function SavedWidgetEditor({
  projectId,
  dashboardId,
  widget,
}: {
  projectId: string;
  dashboardId?: string;
  widget?: Widget;
}) {
  const router = useRouter();
  const utils = api.useUtils();
  const capture = usePostHogClientCapture();
  const { readPath, isResolved } = useReadPath();
  const capabilities = useDashboardBlockCapabilities(projectId, true);
  const [dateRange] = useState(() => ({
    from: new Date(Date.now() - 30 * 86400000),
    to: new Date(),
  }));
  const adapted = (() => {
    try {
      return {
        definition: widget
          ? toWidgetDefinition({
              ...widget,
              filters: widget.definition
                ? widget.filters
                : normalizeStoredWidgetFiltersForEditor(
                    widget.view,
                    widget.filters,
                  ).editorFilters,
            })
          : undefined,
        error: undefined,
      };
    } catch {
      return {
        definition: undefined,
        error:
          "This widget configuration cannot be opened in the editor. Its saved configuration has not changed.",
      };
    }
  })();
  const definition =
    adapted.definition ??
    (!widget && router.query.kind === "markdown"
      ? {
          kind: "markdown" as const,
          config: { version: 1 as const, title: "", content: "" },
        }
      : undefined);
  const back = () =>
    router.push(
      dashboardId
        ? `/project/${projectId}/dashboards/${dashboardId}`
        : `/project/${projectId}/widgets`,
    );
  const editingOwnedWidget = widget?.owner === "PROJECT";
  const mutation = api.dashboardWidgets.saveDefinition.useMutation({
    onSuccess: async () => {
      capture("dashboard:widget_saved", {
        isNew: !editingOwnedWidget,
        format: "versioned",
      });
      await Promise.all([
        utils.dashboardWidgets.invalidate(),
        utils.dashboard.invalidate(),
      ]);
      await back();
    },
  });
  const save = (next: NonNullable<typeof definition>) =>
    mutation.mutate({
      projectId,
      widgetId: editingOwnedWidget ? widget.id : undefined,
      expectedRevision: editingOwnedWidget ? widget.revision : undefined,
      dashboardId: editingOwnedWidget ? undefined : dashboardId,
      definition: next,
    });
  const error = mutation.error?.message;
  return (
    <DialogController
      initialState={() => true}
      onDismiss={() => {
        back();
      }}
      onBeforeClose={() => !mutation.isPending}
      renderDialog={() => {
        if (!isResolved || readPath === "unknown" || capabilities.isPending)
          return (
            <Dialog title="Opening widget" noCapture>
              <Dialog.Body>Loading widget editor…</Dialog.Body>
            </Dialog>
          );
        if (adapted.error)
          return (
            <Dialog title="Cannot open widget" noCapture>
              <Dialog.Body>{adapted.error}</Dialog.Body>
            </Dialog>
          );
        if (!capabilities.data?.[definition?.kind ?? "multiQuery"])
          return (
            <Dialog title="Widget authoring unavailable" noCapture>
              <Dialog.Body>
                Enable Dashboard widget authoring to edit this widget.
              </Dialog.Body>
            </Dialog>
          );
        const template = router.query.template;
        if (
          !widget &&
          dashboardId &&
          typeof template === "string" &&
          HOME_DASHBOARD_PRESET_IDS.includes(template as HomeDashboardPresetId)
        )
          return (
            <DashboardBlockEditor
              request={{
                kind: "multiQuery",
                preset: {
                  source: {
                    placementId: "",
                    presetId: template as HomeDashboardPresetId,
                  },
                  selection: {},
                  template: true,
                },
              }}
              projectId={projectId}
              dashboardId={dashboardId}
              canEdit
              readPath={readPath}
              dateRange={dateRange}
              filterState={[]}
              placementOptions={[]}
              onPlacementChanged={() => {}}
              onPreview={() => {}}
              onSaved={() => {
                back();
              }}
              onCancel={() => {
                back();
              }}
            />
          );
        if (definition?.kind === "markdown")
          return (
            <DashboardMarkdownEditor
              sharedWidget={editingOwnedWidget}
              initial={definition.config}
              beforePlacementId={null}
              placementOptions={[]}
              pending={mutation.isPending}
              error={error}
              onPlacementChange={() => {}}
              onPreview={() => {}}
              onSave={(config) => save({ kind: "markdown", config })}
              onCancel={() => {
                back();
              }}
            />
          );
        return (
          <MultiQueryEditor
            initial={definition?.config}
            projectId={projectId}
            dateRange={dateRange}
            filterState={[]}
            readPath={readPath}
            savePending={mutation.isPending}
            saveError={error}
            onSave={(config) => save({ kind: "multiQuery", config })}
            onCancel={() => {
              back();
            }}
          >
            {editingOwnedWidget && (
              <p className="text-muted-foreground text-sm">
                Changes apply wherever this widget is used.
              </p>
            )}
          </MultiQueryEditor>
        );
      }}
    >
      {() => null}
    </DialogController>
  );
}
