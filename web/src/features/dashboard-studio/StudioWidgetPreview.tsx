import { VisualizationFrame } from "@/src/components/design-system/charts/internal/VisualizationFrame/VisualizationFrame";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import {
  StudioWidgetResultPresentation,
  type StudioWidgetResultProps,
  type StudioWidgetResultFrameProps,
} from "./StudioWidgetResultPresentation";

/** Editor results without dashboard title, description, or appearance controls. */
export function StudioWidgetPreview(props: StudioWidgetResultProps) {
  return (
    <StudioWidgetResultPresentation
      {...props}
      Frame={StudioWidgetPreviewFrame}
    />
  );
}

function StudioWidgetPreviewFrame({
  content,
  tabs,
  controls = [],
  metric,
}: StudioWidgetResultFrameProps) {
  const body = (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
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
        <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b px-4">
          <Tabs.List variant="underline" aria-label="Query result views">
            {tabs.options.map((option) => (
              <Tabs.Trigger
                key={option.value}
                value={option.value}
                label={option.label}
              />
            ))}
          </Tabs.List>
          <div className="flex max-w-2/3 min-w-0 gap-2">
            {controls.map((control) =>
              control.type === "select" ? (
                <div key={control.id} className="w-64 min-w-0">
                  <SelectInput
                    aria-label={control.label}
                    placeholder={control.label}
                    noCapture={control.noCapture}
                    value={control.value}
                    options={control.options}
                    onValueChange={control.onValueChange}
                  />
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
