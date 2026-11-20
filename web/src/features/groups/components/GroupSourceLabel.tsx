import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { GROUP_SOURCE_DISPLAY } from "@/src/features/groups/groupSource";

export type GroupSource = keyof typeof GROUP_SOURCE_DISPLAY;

export function GroupSourceLabel({ source }: { source: GroupSource }) {
  const display = GROUP_SOURCE_DISPLAY[source];
  const Icon = display.icon;
  return (
    <Tooltip label={display.description}>
      {({ getTriggerProps }) => (
        <span
          className="text-muted-foreground inline-flex items-center gap-1.5"
          tabIndex={0}
          {...getTriggerProps()}
        >
          <Icon size="sm" aria-hidden="true" />
          {display.label}
        </span>
      )}
    </Tooltip>
  );
}
