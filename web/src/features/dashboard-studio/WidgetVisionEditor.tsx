import { type ComponentProps, useState } from "react";
import { EllipsisVertical } from "@langfuse/icons";
import { type StudioWidgetConfig } from "@langfuse/shared";
import { type ViewVersion } from "@langfuse/shared/query";
import { DropdownMenu } from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { CurrentWidgetExperience } from "./CurrentWidgetExperience";
import { DeferredWidgetQuestion } from "./DeferredWidgetQuestion";
import { StudioWidgetEditor } from "./StudioWidgetEditor";
import { useDashboardStudioCapture } from "./analytics";
import { validateCurrentStudioConfig } from "./currentStudioExecution";
import {
  getStudioEditorExecutionMode,
  resolveStudioQueryVersion,
} from "./studioConfig";

type WidgetVisionEditorMode = "current" | "multi-query" | "future";

export function readWidgetEditorMode(
  value: unknown,
): WidgetVisionEditorMode | undefined {
  return value === "current" || value === "multi-query" || value === "future"
    ? value
    : undefined;
}

type EditorPane =
  | { type: "chart" }
  | { type: "classic"; config: StudioWidgetConfig; openedFromChart: boolean }
  | { type: "plan" };

export function WidgetVisionEditor({
  initialMode = "multi-query",
  initialValue,
  ...props
}: WidgetVisionEditorProps) {
  const readableVersion = props.readPath === "v4" ? "v2" : "v1";
  const [initialConfig] = useState(() => ({
    ...initialValue,
    executionMode: getStudioEditorExecutionMode(initialValue, {
      isNew: props.isNew,
      experimental: initialMode === "future",
      version: resolveStudioQueryVersion(
        initialValue,
        readableVersion,
        props.filterState,
      ),
    }),
  }));
  const [pane, setPane] = useState<EditorPane>(() =>
    initialMode === "current"
      ? { type: "classic", config: initialConfig, openedFromChart: false }
      : { type: "chart" },
  );
  const backToChart = () => setPane({ type: "chart" });

  return (
    <section
      aria-label="Chart editor"
      className="ph-no-capture flex h-full min-h-0 min-w-0 flex-col"
    >
      {(pane.type !== "classic" || pane.openedFromChart) && (
        <div hidden={pane.type !== "chart"} className="min-h-0 flex-1">
          <StudioWidgetEditor
            {...props}
            initialValue={initialConfig}
            active={pane.type === "chart"}
            renderEditorOptions={(config, onChange) => (
              <WidgetEditorOptions
                config={config}
                onChange={onChange}
                version={resolveStudioQueryVersion(
                  config,
                  readableVersion,
                  props.filterState,
                )}
                onPlan={() => setPane({ type: "plan" })}
                onClassic={() =>
                  setPane({ type: "classic", config, openedFromChart: true })
                }
              />
            )}
          />
        </div>
      )}
      {pane.type === "classic" && (
        <CurrentWidgetExperience
          initialValue={pane.config}
          projectId={props.projectId}
          dateRange={props.dateRange}
          onApply={props.onApply}
          onCancel={pane.openedFromChart ? backToChart : props.onCancel}
          onBack={backToChart}
          applyContext={props.applyContext}
        />
      )}
      {pane.type === "plan" && (
        <DeferredWidgetQuestion
          dateRange={props.dateRange}
          onBack={backToChart}
        />
      )}
    </section>
  );
}

function WidgetEditorOptions({
  config,
  version,
  onChange,
  onPlan,
  onClassic,
}: {
  config: StudioWidgetConfig;
  version: ViewVersion;
  onChange: (config: StudioWidgetConfig) => void;
  onPlan: () => void;
  onClassic: () => void;
}) {
  const experimental = config.executionMode === "prototype";
  const compatibility = experimental
    ? validateCurrentStudioConfig(config, version)
    : { valid: true as const };
  const track = useDashboardStudioCapture(version === "v2");

  return (
    <DropdownMenu
      ariaLabel="Editor options"
      placement="bottom-end"
      noCapture
      items={[
        {
          id: "experimental",
          type: "checkbox",
          title: "Experimental queries",
          checked: experimental,
          disabled: compatibility.valid
            ? undefined
            : { reason: compatibility.reason },
          onCheckedChange: (enabled) => {
            if (enabled === experimental || (!enabled && !compatibility.valid))
              return;
            onChange({
              ...config,
              executionMode: enabled ? "prototype" : "current",
            });
            track("configuration_changed", {
              scope: "widget",
              editorMode: enabled ? "future" : "multi-query",
            });
          },
          closeOnCheckedChange: true,
        },
        {
          id: "plan",
          type: "item",
          title: "Plan a future query",
          onClick: () => {
            onPlan();
            track("view_changed", {
              editorMode: "future",
              scope: "widget",
              target: "configuration_details",
            });
          },
        },
        { id: "divider", type: "separator" },
        {
          id: "classic",
          type: "item",
          title: "Open classic editor",
          onClick: () => {
            onClassic();
            track("view_changed", {
              editorMode: "current",
              scope: "widget",
              target: "configuration_data",
            });
          },
        },
      ]}
    >
      {({ getTriggerProps }) => (
        <IconButton
          icon={EllipsisVertical}
          label="Editor options"
          title="Editor options"
          {...getTriggerProps()}
        />
      )}
    </DropdownMenu>
  );
}

type WidgetVisionEditorProps = Pick<
  ComponentProps<typeof StudioWidgetEditor>,
  | "initialValue"
  | "isNew"
  | "dashboardName"
  | "projectId"
  | "readPath"
  | "dateRange"
  | "filterState"
  | "onApply"
  | "onCancel"
  | "applyContext"
> & {
  initialMode?: WidgetVisionEditorMode;
};
