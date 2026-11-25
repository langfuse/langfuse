import { VisualizationFrame } from "@/src/components/design-system/charts/internal/VisualizationFrame/VisualizationFrame";
import {
  StudioWidgetResultPresentation,
  type StudioWidgetCardResultProps,
  type StudioWidgetResultFrameProps,
} from "./StudioWidgetResultPresentation";

export function StudioWidgetPreview(props: StudioWidgetCardResultProps) {
  return (
    <StudioWidgetResultPresentation
      {...props}
      Frame={StudioWidgetPreviewFrame}
    />
  );
}

function StudioWidgetPreviewFrame({
  content,
  metric,
  descriptor,
}: StudioWidgetResultFrameProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      {descriptor}
      {metric && (
        <div className="shrink-0">
          <strong className="text-2xl">{metric.value}</strong>
          <p className="text-muted-foreground text-xs">{metric.description}</p>
        </div>
      )}
      <div className="relative min-h-0 flex-1">
        <VisualizationFrame content={content} />
      </div>
    </div>
  );
}
