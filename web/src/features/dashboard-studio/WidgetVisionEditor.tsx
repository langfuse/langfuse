import { type ComponentProps, useState } from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { type StudioWidgetConfig } from "@langfuse/shared";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { Button } from "@/src/components/design-system/Button/Button";
import { StudioWidgetEditor } from "./StudioWidgetEditor";
import { CurrentWidgetExperience } from "./CurrentWidgetExperience";
import { DeferredWidgetQuestion } from "./DeferredWidgetQuestion";
import { useDashboardStudioCapture } from "./analytics";

function percentileExperiment(): StudioWidgetConfig {
  return {
    version: 1,
    executionMode: "prototype",
    title: "Custom latency percentile",
    description:
      "A live experimental percentile query. The percentile can be changed in the metric editor.",
    queries: [
      {
        id: "a",
        label: "Latency",
        view: "observations",
        metrics: [
          {
            id: "latency",
            measure: "latency",
            aggregation: "p50",
            percentile: 10,
          },
        ],
        dimensions: [],
        filters: [],
      },
    ],
    expressions: [],
    display: {
      chartType: "LINE_TIME_SERIES",
      timeSeries: true,
      legend: true,
    },
  };
}

export type WidgetVisionEditorMode = "current" | "multi-query" | "future";
export function WidgetVisionEditor({
  initialMode = "multi-query",
  ...props
}: WidgetVisionEditorProps) {
  const [mode, setMode] = useState<WidgetVisionEditorMode>(initialMode);
  const [visited, setVisited] = useState<WidgetVisionEditorMode[]>([
    initialMode,
  ]);
  const [futurePlan, setFuturePlan] = useState<"draft" | "custom" | "plan">(
    "draft",
  );
  const [experimentVisited, setExperimentVisited] = useState(false);
  const track = useDashboardStudioCapture(props.readPath === "v4");
  const selectMode = (next: WidgetVisionEditorMode) => {
    if (next === mode) return;
    setMode(next);
    setVisited((current) =>
      current.includes(next) ? current : [...current, next],
    );
    track("view_changed", {
      editorMode: next,
      scope: "widget",
      target: "configuration_data",
    });
  };
  const livePercentile = () => {
    setExperimentVisited(true);
    setFuturePlan("custom");
    track("configuration_changed", {
      editorMode: "future",
      capability: "custom-percentile",
      scope: "widget",
    });
  };
  return (
    <section
      aria-label="Widget builder comparison"
      className="ph-no-capture flex h-full min-h-0 min-w-0 flex-col"
    >
      <Tabs
        value={mode}
        onValueChange={(value) => selectMode(value as WidgetVisionEditorMode)}
        layout="fill"
      >
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-4">
          <Tabs.List variant="underline" aria-label="Editor experience">
            <Tabs.Trigger value="current" label="Current editor" />
            <Tabs.Trigger value="multi-query" label="Multi-query" />
            <Tabs.Trigger value="future" label="Future builder" />
          </Tabs.List>
          <p className="text-muted-foreground text-[11px]">
            Each builder keeps its own draft.
          </p>
        </div>
        <TabsPrimitive.Content
          forceMount
          value="current"
          className="min-h-0 flex-1 data-[state=inactive]:hidden"
        >
          {visited.includes("current") ? (
            <CurrentWidgetExperience
              initialValue={props.initialValue}
              projectId={props.projectId}
              dateRange={props.dateRange}
              active={mode === "current"}
              onApply={props.onApply}
              onCancel={props.onCancel}
              onOpenMultiQuery={() => selectMode("multi-query")}
              applyContext={props.applyContext}
            />
          ) : null}
        </TabsPrimitive.Content>
        <TabsPrimitive.Content
          forceMount
          value="multi-query"
          className="min-h-0 flex-1 data-[state=inactive]:hidden"
        >
          {visited.includes("multi-query") ? (
            <StudioWidgetEditor
              {...props}
              initialValue={{ ...props.initialValue, executionMode: "current" }}
              active={mode === "multi-query"}
            />
          ) : null}
        </TabsPrimitive.Content>
        <TabsPrimitive.Content
          forceMount
          value="future"
          className="flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
        >
          {visited.includes("future") ? (
            <>
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
                <p className="text-muted-foreground text-xs">
                  Experimental execution is separate from capabilities that
                  still need backend work.
                </p>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    text="Live experiment"
                    variant={futurePlan === "draft" ? "secondary" : "ghost"}
                    onClick={() => setFuturePlan("draft")}
                  />
                  <Button
                    size="sm"
                    text="Plan a future query"
                    variant={futurePlan === "plan" ? "secondary" : "ghost"}
                    onClick={() => setFuturePlan("plan")}
                  />
                  <Button
                    size="sm"
                    text="Try custom percentile"
                    variant="outline"
                    onClick={livePercentile}
                  />
                </div>
              </div>
              <div hidden={futurePlan !== "draft"} className="min-h-0 flex-1">
                <StudioWidgetEditor
                  {...props}
                  initialValue={{
                    ...props.initialValue,
                    executionMode: "prototype",
                  }}
                  active={mode === "future" && futurePlan === "draft"}
                />
              </div>
              <div hidden={futurePlan !== "custom"} className="min-h-0 flex-1">
                {experimentVisited ? (
                  <StudioWidgetEditor
                    {...props}
                    initialValue={percentileExperiment()}
                    active={mode === "future" && futurePlan === "custom"}
                  />
                ) : null}
              </div>
              <div hidden={futurePlan !== "plan"} className="min-h-0 flex-1">
                <DeferredWidgetQuestion
                  dateRange={props.dateRange}
                  onTryLive={livePercentile}
                  onCancel={props.onCancel}
                />
              </div>
            </>
          ) : null}
        </TabsPrimitive.Content>
      </Tabs>
    </section>
  );
}

type WidgetVisionEditorProps = ComponentProps<typeof StudioWidgetEditor> & {
  initialMode?: WidgetVisionEditorMode;
};
