import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import {
  renderFilterIcon,
  type LangfuseItemType,
} from "@/src/components/ItemBadge";

export type EntityTitleTabsProps = {
  label: string;
  value: string;
  options: readonly {
    value: string;
    label: string;
    itemType: LangfuseItemType;
    disabled?: boolean;
    disabledReason?: string;
  }[];
  onValueChange: (value: string) => void;
};

export function EntityTitleTabs({
  label,
  value,
  options,
  onValueChange,
}: EntityTitleTabsProps) {
  return (
    <Tabs value={value} onValueChange={onValueChange}>
      <Tabs.List aria-label={label} variant="inset" size="sm">
        {options.map((option) => {
          const trigger = (
            <Tabs.Trigger value={option.value} disabled={option.disabled}>
              {renderFilterIcon(option.itemType)}
              <span>{option.label}</span>
            </Tabs.Trigger>
          );
          if (option.disabled && option.disabledReason) {
            return (
              <Tooltip key={option.value} label={option.disabledReason}>
                {({ getTriggerProps }) => (
                  <span {...getTriggerProps()} className="inline-flex">
                    {trigger}
                  </span>
                )}
              </Tooltip>
            );
          }
          return (
            <span key={option.value} className="inline-flex">
              {trigger}
            </span>
          );
        })}
      </Tabs.List>
    </Tabs>
  );
}
