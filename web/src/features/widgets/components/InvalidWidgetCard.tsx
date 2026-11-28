import { WidgetChartCard } from "./WidgetChartCard";
import { TrashIcon } from "@langfuse/icons";

export const INVALID_WIDGET_MESSAGE =
  "This widget's saved configuration is invalid or unsupported. It has not been deleted. Ask its owner to repair the configuration or replace this widget.";

export function InvalidWidgetCard({
  name,
  onRemove,
}: {
  name: string;
  onRemove?: () => void;
}) {
  return (
    <WidgetChartCard
      title={name}
      content={{ type: "error", message: INVALID_WIDGET_MESSAGE }}
      actions={
        onRemove
          ? {
              menu: [
                {
                  id: "remove",
                  type: "item",
                  title: "Remove widget",
                  icon: TrashIcon,
                  variant: "destructive",
                  onClick: onRemove,
                },
              ],
            }
          : undefined
      }
    />
  );
}
