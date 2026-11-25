import {
  type StudioTabbedWidget,
  type StudioWidgetConfig,
} from "@langfuse/shared";
import { Button } from "@/src/components/design-system/Button/Button";
import { InlineEditText } from "@/src/components/design-system/InlineEditText/InlineEditText";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { DropdownMenu } from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { EllipsisVertical, PlusIcon } from "@langfuse/icons";

type Props = {
  widget: StudioTabbedWidget;
  chart: StudioWidgetConfig;
  id: string;
  invalid: boolean;
  onTitle: (title: string) => void;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onFirst: () => void;
};
export function StudioTabControls({
  widget,
  chart,
  id,
  invalid,
  onTitle,
  onSelect,
  onAdd,
  onDuplicate,
  onRemove,
  onFirst,
}: Props) {
  const multiple = widget.tabs.length > 1;
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 px-4 py-1">
      {multiple && (
        <>
          <InlineEditText
            aria-label="Widget title"
            value={widget.title}
            onSave={onTitle}
            required
          />
          <Tabs
            value={id}
            onValueChange={(next) => {
              if (next !== id && !invalid) onSelect(next);
            }}
          >
            <Tabs.List variant="underline" aria-label="Chart tabs">
              {widget.tabs.map((tab) => (
                <Tabs.Trigger
                  key={tab.id}
                  value={tab.id}
                  label={tab.id === id ? chart.title : tab.chart.title}
                  disabled={invalid && tab.id !== id}
                />
              ))}
            </Tabs.List>
          </Tabs>
        </>
      )}
      <Button
        icon={PlusIcon}
        text="Add tab"
        variant="ghost"
        size="sm"
        disabled={invalid || widget.tabs.length >= 16}
        onClick={onAdd}
      />
      <DropdownMenu
        ariaLabel="Tab actions"
        placement="bottom-end"
        items={[
          {
            id: "duplicate",
            type: "item",
            title: "Duplicate tab",
            disabled:
              invalid || widget.tabs.length >= 16
                ? { reason: "Complete the chart and keep at most 16 tabs." }
                : undefined,
            onClick: onDuplicate,
          },
          ...(multiple && widget.tabs[0]!.id !== id
            ? [
                {
                  id: "first",
                  type: "item" as const,
                  title: "Make first tab",
                  disabled: invalid
                    ? { reason: "Complete the chart first." }
                    : undefined,
                  onClick: onFirst,
                },
              ]
            : []),
          ...(multiple
            ? [
                {
                  id: "delete",
                  type: "item" as const,
                  title: "Remove tab",
                  onClick: onRemove,
                },
              ]
            : []),
        ]}
      >
        {({ getTriggerProps }) => (
          <IconButton
            icon={EllipsisVertical}
            label="Tab actions"
            {...getTriggerProps()}
          />
        )}
      </DropdownMenu>
    </div>
  );
}
