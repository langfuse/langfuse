import { VisualizationFrame } from "@/src/components/design-system/charts/internal/VisualizationFrame/VisualizationFrame";
import { StudioInlineSelect } from "./StudioInlineSelect";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import {
  StudioWidgetResultPresentation,
  type StudioWidgetCardResultProps,
  type StudioWidgetResultFrameProps,
} from "./StudioWidgetResultPresentation";

/** Use the dashboard's result, view selector and data inspection controls inside the editor. */
export function StudioWidgetPreview(props: StudioWidgetCardResultProps) {
  return (
    <StudioWidgetResultPresentation
      {...props}
      Frame={StudioWidgetPreviewFrame}
      compactData
    />
  );
}

function StudioWidgetPreviewFrame({
  content,
  tabs,
  controls = [],
  metric,
  descriptor,
  description,
}: StudioWidgetResultFrameProps) {
  const body = (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      {descriptor ? <div className="shrink-0">{descriptor}</div> : null}
      {tabs?.value === "inspect" && description ? (
        <p className="text-muted-foreground shrink-0 text-xs">{description}</p>
      ) : null}
      {metric ? (
        <div className="shrink-0">
          <p className="text-2xl font-bold">{metric.value}</p>
          <p className="text-muted-foreground text-xs">{metric.description}</p>
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col">
        <VisualizationFrame content={content} />
      </div>
    </div>
  );
  if (!tabs) return body;
  return (
    <div className="bg-background flex min-h-0 flex-1 flex-col overflow-hidden">
      <Tabs value={tabs.value} onValueChange={tabs.onValueChange} layout="fill">
        <div className="flex min-h-10 shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <div className="min-w-0">
            <Tabs.List
              variant="underline"
              divider="none"
              aria-label="Query result views"
            >
              {tabs.options.map((option) => (
                <Tabs.Trigger
                  key={option.value}
                  value={option.value}
                  label={option.label}
                />
              ))}
            </Tabs.List>
          </div>
          <div className="flex max-w-full min-w-0 flex-wrap items-center gap-1.5">
            {controls.map((control) =>
              control.type === "select" ? (
                <div
                  key={control.id}
                  className="flex max-w-full min-w-0 items-center gap-2"
                >
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {control.id === "series-view" ? "Showing" : control.label}
                  </span>
                  <div className="max-w-48 min-w-0">
                    <StudioInlineSelect
                      label={control.label}
                      placeholder={control.label}
                      value={control.value}
                      options={control.options}
                      onValueChange={control.onValueChange}
                    />
                  </div>
                </div>
              ) : null,
            )}
          </div>
        </div>
        <Tabs.Content value={tabs.value} layout="fill">
          {body}
        </Tabs.Content>
      </Tabs>
    </div>
  );
}
